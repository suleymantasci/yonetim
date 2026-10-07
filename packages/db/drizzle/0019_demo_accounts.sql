-- =============================================================================
-- 0019 — 24 saatlik demo hesapları
--
-- 1) tenants/companies/users üzerinde demo bayrağı
-- 2) demo_requests (platform tablosu, tenant_id yok)
-- 3) app_purge_demo_tenant(): demo siteyi bütün verisiyle FİZİKSEL siler
-- 4) karar defteri trigger'ı: yalnız demo site silinirken DELETE'e izin
-- =============================================================================

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "demo_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenants_demo_expires" ON "tenants" USING btree ("demo_expires_at");--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "demo_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(12) NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(255) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"ip" varchar(45),
	"user_agent" text,
	"consent_at" timestamp with time zone NOT NULL,
	"login_email" varchar(255),
	"password_sealed" text,
	"user_id" uuid,
	"company_id" uuid,
	"tenant_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"confirmed_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"credentials_mailed_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"phone_slot" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_demo_requests_code" ON "demo_requests" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_demo_requests_token" ON "demo_requests" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_demo_requests_email" ON "demo_requests" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_demo_requests_ip" ON "demo_requests" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_demo_requests_status_expires" ON "demo_requests" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_demo_requests_email_live" ON "demo_requests" USING btree ("email") WHERE status IN ('pending','provisioning','ready');--> statement-breakpoint

-- Demo kişilerinin telefonları `+90 500 SSSS PPP` (500 hiçbir operatöre
-- tahsis edilmemiş): SSSS bu sıradan gelen yuva, PPP kişi sırası. Telefon
-- platformda benzersiz (`idx_users_phone`); aynı anda yaşayan iki demonun
-- çakışmaması için yuva rastgele değil sıralı. 10.000'de başa dönüyor —
-- o yuvayı kullanan demo çoktan (24 saatte) silinmiş oluyor.
CREATE SEQUENCE IF NOT EXISTS "demo_phone_slot_seq" MINVALUE 0 MAXVALUE 9999 START 0 CYCLE;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yonetim_admin') THEN
    EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE demo_phone_slot_seq TO yonetim_admin';
  END IF;
END
$$;--> statement-breakpoint

-- Uygulama rolü (yonetim_app) bu tabloyu hiç görmesin: kişisel veri taşıyor
-- ve yalnız platform bağlamında (yonetim_admin, BYPASSRLS) kullanılıyor.
-- Politika yok + RLS açık = uygulama rolüne boş tablo.
ALTER TABLE "demo_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demo_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- Karar defteri: KMK md.32 gereği kayıt silinemez — TEK İSTİSNA, demo sitenin
-- bütünüyle silinmesi. Üç koşul birlikte aranıyor:
--   * oturum `app.demo_purge_tenant` = silinen satırın sitesi (yalnız
--     app_purge_demo_tenant() set ediyor),
--   * bağlanan rol yetkili (BYPASSRLS / süper kullanıcı) — uygulama rolü
--     ayarı kendisi set etse bile geçemez,
--   * site gerçekten demo (`tenants.is_demo`).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_decision_book_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF COALESCE(current_setting('app.demo_purge_tenant', true), '') = OLD.tenant_id::text
       AND EXISTS (
         SELECT 1 FROM pg_roles
         WHERE rolname = current_user AND (rolbypassrls OR rolsuper)
       )
       AND EXISTS (SELECT 1 FROM tenants WHERE id = OLD.tenant_id AND is_demo) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'decision_book_entries: karar defterinden kayıt silinemez (KMK md.32)';
  END IF;

  IF NEW.entry_no   IS DISTINCT FROM OLD.entry_no
  OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
  OR NEW.subject    IS DISTINCT FROM OLD.subject
  OR NEW.body       IS DISTINCT FROM OLD.body
  OR NEW.kind       IS DISTINCT FROM OLD.kind
  OR NEW.votes_for  IS DISTINCT FROM OLD.votes_for
  OR NEW.votes_against IS DISTINCT FROM OLD.votes_against
  OR NEW.abstentions   IS DISTINCT FROM OLD.abstentions
  OR NEW.passed        IS DISTINCT FROM OLD.passed
  OR NEW.quorum_rule   IS DISTINCT FROM OLD.quorum_rule THEN
    RAISE EXCEPTION 'decision_book_entries: karar metni değiştirilemez; düzeltme için yeni karar yazın';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- app_purge_demo_tenant(site) — demo siteyi bütün verisiyle FİZİKSEL siler.
--
-- KORUMALAR (hepsi veritabanında, uygulama hatası atlatamaz):
--   1) Yalnız yetkili rol (BYPASSRLS/süper kullanıcı) çalıştırabilir;
--      EXECUTE yetkisi PUBLIC'ten alınıp yalnız yonetim_admin'e veriliyor.
--   2) Site `is_demo = true` değilse EXCEPTION — gerçek site bu yoldan
--      hiçbir koşulda silinemez.
--   3) Kişiler yalnız şu koşulların HEPSİ sağlanırsa siliniyor:
--        * bu siteye bağlıydı (üyelik / oturum / malik-kiracı),
--        * platform rolü yok,
--        * silmeden sonra başka hiçbir siteye bağı kalmadı,
--        * demo kişisi (`is_demo`) YA DA demo siteden sonra oluşturuldu
--          (demo yöneticisinin panelden eklediği kişi).
--      Demo açılmadan önce var olan gerçek bir kullanıcının yalnız demo
--      sitedeki bağı kalkar; kendisi kalır.
--
-- TABLO LİSTESİ ELLE TUTULMUYOR: `tenant_id` sütunu olan her tablo
-- katalogdan bulunuyor. Yeni bir tenant tablosu eklendiğinde bu fonksiyonu
-- güncellemeyi unutmak, demo verisinin sessizce geride kalması demekti.
-- Tablolar arası yabancı anahtar sırası bilinmediği için silme turlar
-- hâlinde yapılıyor: FK yüzünden silinemeyen tablo sonraki turda yeniden
-- deneniyor. 12 turda bitmezse EXCEPTION (transaction geri alınır).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_purge_demo_tenant(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_is_demo boolean;
  v_company uuid;
  v_tenant_created timestamptz;
  v_users uuid[];
  v_identifiers text[];
  r record;
  v_rows bigint;
  v_total bigint := 0;
  v_pass int;
  v_pending int := 0;
  v_failed text;
  v_deleted_users int := 0;
  v_deleted_company int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolbypassrls OR rolsuper)
  ) THEN
    RAISE EXCEPTION 'app_purge_demo_tenant: yetkili rol gerekir'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT is_demo, company_id, created_at
    INTO v_is_demo, v_company, v_tenant_created
    FROM tenants WHERE id = p_tenant
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('tenantId', p_tenant, 'found', false);
  END IF;
  IF v_is_demo IS NOT TRUE THEN
    RAISE EXCEPTION 'app_purge_demo_tenant: % demo site değil; fiziksel silme reddedildi', p_tenant
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM set_config('app.allow_log_purge', 'on', true);
  PERFORM set_config('app.demo_purge_tenant', p_tenant::text, true);

  SELECT array_agg(DISTINCT x.uid) INTO v_users FROM (
    SELECT user_id AS uid FROM memberships WHERE tenant_id = p_tenant
    UNION SELECT user_id FROM unit_occupancies WHERE tenant_id = p_tenant
    UNION SELECT current_owner_id FROM units WHERE tenant_id = p_tenant
    UNION SELECT current_tenant_id FROM units WHERE tenant_id = p_tenant
    UNION SELECT user_id FROM sessions WHERE active_tenant_id = p_tenant
  ) x WHERE x.uid IS NOT NULL;

  FOR v_pass IN 1..12 LOOP
    v_pending := 0;
    FOR r IN
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND c.column_name = 'tenant_id'
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', r.table_name)
          USING p_tenant;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_total := v_total + v_rows;
      EXCEPTION WHEN foreign_key_violation THEN
        v_pending := v_pending + 1;
        v_failed := r.table_name;
      END;
    END LOOP;
    EXIT WHEN v_pending = 0;
  END LOOP;
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'app_purge_demo_tenant: % tablosu yabancı anahtar yüzünden silinemedi', v_failed;
  END IF;

  DELETE FROM referrals WHERE referrer_tenant_id = p_tenant OR referred_tenant_id = p_tenant;
  UPDATE sessions SET active_tenant_id = NULL WHERE active_tenant_id = p_tenant;
  DELETE FROM tenants WHERE id = p_tenant;

  IF v_users IS NOT NULL THEN
    SELECT array_agg(v) INTO v_identifiers FROM (
      SELECT lower(email) AS v FROM users WHERE id = ANY(v_users) AND email IS NOT NULL
      UNION SELECT phone FROM users WHERE id = ANY(v_users) AND phone IS NOT NULL
    ) i;

    WITH gone AS (
      DELETE FROM users u
      WHERE u.id = ANY(v_users)
        AND u.platform_role IS NULL
        AND (u.is_demo OR u.created_at >= v_tenant_created)
        AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM unit_occupancies o WHERE o.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM units un WHERE un.current_owner_id = u.id OR un.current_tenant_id = u.id)
      RETURNING lower(coalesce(u.email, '')) AS email, coalesce(u.phone, '') AS phone
    )
    SELECT count(*) INTO v_deleted_users FROM gone;

    -- Silinen kişilere ait doğrulama kodları (giriş kodu / parola sıfırlama).
    IF v_identifiers IS NOT NULL THEN
      DELETE FROM verification_tokens vt
      WHERE vt.identifier = ANY(v_identifiers)
        AND NOT EXISTS (
          SELECT 1 FROM users u2
          WHERE lower(u2.email) = vt.identifier OR u2.phone = vt.identifier
        );
    END IF;
  END IF;

  IF v_company IS NOT NULL THEN
    DELETE FROM companies c
    WHERE c.id = v_company AND c.is_demo
      AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.company_id = c.id);
    GET DIAGNOSTICS v_deleted_company = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'tenantId', p_tenant,
    'found', true,
    'rows', v_total,
    'users', v_deleted_users,
    'company', v_deleted_company
  );
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app_purge_demo_tenant(uuid) FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yonetim_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_purge_demo_tenant(uuid) TO yonetim_admin';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yonetim_app') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION app_purge_demo_tenant(uuid) FROM yonetim_app';
  END IF;
END
$$;
