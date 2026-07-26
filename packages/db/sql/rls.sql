-- =============================================================================
-- Row-Level Security — SPEC Bölüm 5.4 / 13.3
--
-- Strateji: Shared DB + RLS. Her tenant tablosunda tenant_id NOT NULL.
-- Oturum değişkeni: SELECT set_config('app.tenant_id', '<uuid>', true)
-- Fail-closed: app.tenant_id boşsa hiçbir satır görünmez.
--
-- Bu dosya migration'lardan SONRA çalıştırılır (pnpm db:migrate otomatik uygular).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- uuid sütununu GiST exclude constraint'inde kullanabilmek için:
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- Uygulama rolü.
--
-- KRİTİK: Postgres'te süper kullanıcılar ve BYPASSRLS yetkisi olan roller RLS'i
-- her koşulda baypas eder. Bu nedenle uygulama, tablo sahibi/süper kullanıcı ile
-- DEĞİL, aşağıdaki kısıtlı rol ile bağlanmalıdır (SPEC Bölüm 5.1 trade-off notu).
--
-- Bağlantı dizesi: postgresql://yonetim_app:<şifre>@host:5432/yonetim
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yonetim_app') THEN
    CREATE ROLE yonetim_app LOGIN PASSWORD 'yonetim_app'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  -- Platform (tenant üstü) işler için: oturum çözümleme, süper-admin, cron.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yonetim_admin') THEN
    CREATE ROLE yonetim_admin LOGIN PASSWORD 'yonetim_admin'
      NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
END
$$;

-- Şifre ortam değişkeninden geliyorsa güncelle (idempotent kurulum).
DO $$
DECLARE
  pw text := NULLIF(current_setting('app.app_role_password', true), '');
BEGIN
  IF pw IS NOT NULL THEN
    EXECUTE format('ALTER ROLE yonetim_app PASSWORD %L', pw);
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO yonetim_app, yonetim_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO yonetim_app, yonetim_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO yonetim_app, yonetim_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO yonetim_app, yonetim_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO yonetim_app, yonetim_admin;

-- Geçerli tenant'ı döner; set edilmemişse NULL (hiçbir satır eşleşmez).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

-- NOT: Oturum değişkenine dayalı bir "bypass" fonksiyonu bilinçli olarak YOKTUR.
-- Uygulama rolü böyle bir değişkeni kendisi set edebileceğinden RLS'i etkisiz
-- kılardı. Platform seviyesi (tenant üstü) erişim, BYPASSRLS yetkisi olan ayrı
-- bir rol ve ayrı bağlantı havuzu ile yapılır (bkz. yonetim_admin).

-- tenant_id sütunu olan tüm tablolara politika uygula.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'tenant_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.table_name);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON public.%I
        USING (tenant_id = app_current_tenant())
        WITH CHECK (tenant_id = app_current_tenant())
    $p$, r.table_name);
  END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- tenants tablosunda tenant_id yerine id sütunu vardır; ayrı politika gerekir.
-- Public landing page (Bölüm 6.14) için `landing_published = true` satırlar
-- oturum değişkeni olmadan da okunabilir; yazma her zaman tenant bağlamı ister.
-- -----------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_self_read ON public.tenants;
CREATE POLICY tenant_self_read ON public.tenants
  FOR SELECT
  USING (id = app_current_tenant() OR landing_published = true);

DROP POLICY IF EXISTS tenant_self_write ON public.tenants;
CREATE POLICY tenant_self_write ON public.tenants
  FOR UPDATE
  USING (id = app_current_tenant())
  WITH CHECK (id = app_current_tenant());

DROP POLICY IF EXISTS tenant_insert ON public.tenants;
-- Yeni site kaydı yalnızca platform rolü (yonetim_admin) tarafından açılır.
CREATE POLICY tenant_insert ON public.tenants
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS tenant_delete ON public.tenants;
CREATE POLICY tenant_delete ON public.tenants
  FOR DELETE
  USING (false);

-- -----------------------------------------------------------------------------
-- message_templates: platform geneli (tenant_id IS NULL) hazır şablonlar
-- her siteden OKUNABİLİR, ama yalnız platform rolü yazabilir. Siteye özel
-- kopyalar normal tenant izolasyonuna tabidir.
--
-- Yukarıdaki jenerik döngü bu tabloya da `tenant_isolation` politikası
-- uyguladı; NULL tenant_id satırları o politikayla görünmez olurdu.
-- Bu yüzden politika burada özelleştirilir.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON public.message_templates;

DROP POLICY IF EXISTS template_read ON public.message_templates;
CREATE POLICY template_read ON public.message_templates
  FOR SELECT
  USING (tenant_id = app_current_tenant() OR tenant_id IS NULL);

DROP POLICY IF EXISTS template_write ON public.message_templates;
CREATE POLICY template_write ON public.message_templates
  FOR ALL
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- -----------------------------------------------------------------------------
-- user_addresses: kişiye bağlı ama tenant kapsamlı okunur.
--
-- Uygulama bu tabloya HER ZAMAN tenant_id yazar (bkz. schema/users.ts notu):
-- adres, sakinin o sitedeki tebligat/fatura adresidir. tenant_id NULL bırakılan
-- satır kasıtlı olarak görünmez kalır (fail-closed) — yanlışlıkla tenant'sız
-- yazılan kişisel veri hiçbir panelde sızmaz.
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_addresses FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Append-only kütükler: aidat değişiklik timeline'ı ve audit log
-- (SPEC Bölüm 1.2 "immutable timeline", Bölüm 14.2 "audit").
-- -----------------------------------------------------------------------------
-- Kütük içeriği hiçbir koşulda değiştirilemez.
CREATE OR REPLACE FUNCTION app_forbid_log_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Bu tablo değiştirilemez (append-only): %', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

/*
 * Silme yalnızca saklama süresi imhası ve site kaydının tamamen kaldırılması
 * için mümkündür (KVKK md.7 ve md.12: süresi dolan veri silinmek ZORUNDADIR).
 * Koşullar birlikte sağlanmalıdır:
 *   1) Oturumda app.allow_log_purge = 'on' işaretlenmiş olmalı,
 *   2) Bağlanan rol BYPASSRLS yetkisine sahip olmalı (yonetim_admin / sahibi).
 * Uygulama rolü (yonetim_app) ikinci koşulu sağlayamaz; kütüğü silemez.
 */
CREATE OR REPLACE FUNCTION app_guard_log_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  purge_allowed boolean :=
    COALESCE(current_setting('app.allow_log_purge', true), 'off') = 'on';
  privileged boolean := EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolbypassrls OR rolsuper)
  );
BEGIN
  IF purge_allowed AND privileged THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'Denetim kütüğü silinemez (%). Saklama süresi imhası için yetkili rol ve app.allow_log_purge gerekir.',
    TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_logs', 'audit_debt_changes', 'data_access_logs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_no_update ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_no_update BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION app_forbid_log_update()', t, t);

    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_guard_delete ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_guard_delete BEFORE DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION app_guard_log_delete()', t, t);

    -- Eski isimlendirmeden kalan trigger'ları temizle.
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_immutable ON public.%I', t, t);
  END LOOP;
END
$$;

DROP FUNCTION IF EXISTS app_forbid_mutation() CASCADE;

-- -----------------------------------------------------------------------------
-- Borç tutarı değişince timeline'a otomatik kayıt (şeffaflık — Bölüm 1.2).
-- Manuel INSERT unutulsa bile trigger garanti eder.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_log_debt_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount_kurus IS DISTINCT FROM OLD.amount_kurus
     OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO public.audit_debt_changes (
      tenant_id, debt_id, unit_id, change_type,
      old_amount_kurus, new_amount_kurus, old_due_date, new_due_date,
      changed_by, reason, visible_to_resident
    ) VALUES (
      NEW.tenant_id, NEW.id, NEW.unit_id,
      CASE
        WHEN NEW.amount_kurus IS DISTINCT FROM OLD.amount_kurus THEN 'amount_changed'
        ELSE 'due_date_changed'
      END,
      OLD.amount_kurus, NEW.amount_kurus, OLD.due_date, NEW.due_date,
      NULLIF(current_setting('app.user_id', true), '')::uuid,
      NULLIF(current_setting('app.change_reason', true), ''),
      true
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_debts_change_log ON public.debts;
CREATE TRIGGER trg_debts_change_log
  AFTER UPDATE ON public.debts
  FOR EACH ROW EXECUTE FUNCTION app_log_debt_change();

-- -----------------------------------------------------------------------------
-- updated_at otomatik güncelleme
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'updated_at'
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION app_touch_updated_at()',
      r.table_name);
  END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- Rezervasyon çakışma koruması (Bölüm 6.7) — DB seviyesinde garanti.
-- -----------------------------------------------------------------------------
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_no_overlap;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status IN ('pending', 'approved'));

-- -----------------------------------------------------------------------------
-- Tam metin arama (Bölüm 6.10) — Türkçe konfigürasyonu yoksa 'simple'.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documents_fts
  ON public.documents USING gin (to_tsvector('simple', coalesce(search_text, '') || ' ' || title));

CREATE INDEX IF NOT EXISTS idx_units_number_trgm
  ON public.units USING gin (number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_name_trgm
  ON public.users USING gin ((coalesce(first_name, '') || ' ' || coalesce(last_name, '')) gin_trgm_ops);
