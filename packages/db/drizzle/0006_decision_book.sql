-- Karar Defteri — KMK md.32. Rakip incelemesinde (Dijiyon + Yönetimcell,
-- 2026-07-28) **her ikisinde de** canlı doğrulandı; sektörde neredeyse zorunlu.
--
-- MEVCUT `meeting_decisions` NEDEN YETMİYOR — üç yapısal sebep:
--
--  1. Numara site geneli ve süreklidir. `meeting_decisions.decision_no`
--     toplantı içinde tekil, her toplantı 1'den başlıyor. "2019/7 sayılı
--     karar" ifadesi ancak tek ve sürekli numaralı bir defterle anlam taşır.
--
--  2. Toplantısız kararlar da deftere girer (md.32/son: kurul toplanmaksızın
--     oybirliğiyle karar alabilir). `meeting_id` zorunlu olduğu için
--     `meeting_decisions` bu kararı hiç taşıyamıyor.
--
--  3. Defter ekleme-yalnızdır. Noter tasdikli, sayfaları numaralı bir
--     defterin karşılığı: yazılan karar düzeltilmez, düzelten yeni karar
--     yazılır (`corrects_entry_id`). Bu yüzden `deleted_at` sütunu YOK.
--
-- `meeting_decisions` kaldırılmıyor: toplantı ekranındaki oy sayımı ve yeter
-- sayı hesabı orada kalıyor, deftere geçen karar `meeting_id` ile bağlanıyor.
CREATE TABLE IF NOT EXISTS "decision_book_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entry_no" integer NOT NULL,
  -- Kararın alındığı tarih; kayda geçirildiği tarih değil.
  "decided_at" timestamp with time zone NOT NULL,
  -- 'kurul' | 'yazili' (toplantısız oybirliği) | 'yonetim'
  "kind" varchar(20) DEFAULT 'kurul' NOT NULL,
  "meeting_id" uuid,
  "subject" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "quorum_rule" "public"."quorum_rule" DEFAULT 'simple_majority' NOT NULL,
  "votes_for" numeric(12, 6) DEFAULT '0' NOT NULL,
  "votes_against" numeric(12, 6) DEFAULT '0' NOT NULL,
  "abstentions" numeric(12, 6) DEFAULT '0' NOT NULL,
  "passed" boolean DEFAULT true NOT NULL,
  -- Defterde silgi yok: yanlış karar düzeltilmez, düzelten yeni karar yazılır.
  "corrects_entry_id" uuid,
  -- Noter tasdikli fiziki defterdeki sayfa — dijital ile kâğıt eşleşsin.
  "book_page_no" integer,
  "attachment_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "decision_book_entries" ADD CONSTRAINT "decision_book_entries_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "decision_book_entries" ADD CONSTRAINT "decision_book_entries_corrects_entry_id_fk"
  FOREIGN KEY ("corrects_entry_id") REFERENCES "public"."decision_book_entries"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "decision_book_entries" ADD CONSTRAINT "decision_book_entries_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Sıra numarası site içinde tekil: iki karara aynı numarayı vermek defteri
-- geçersiz kılar. Eşzamanlı iki kayıt denemesinde ikincisi bu index'e çarpıp
-- yeniden numara alır (servis bunu yeniden deneyerek karşılıyor).
CREATE UNIQUE INDEX "idx_decision_book_tenant_no"
  ON "decision_book_entries" USING btree ("tenant_id","entry_no");--> statement-breakpoint
CREATE INDEX "idx_decision_book_tenant_date"
  ON "decision_book_entries" USING btree ("tenant_id","decided_at");--> statement-breakpoint
CREATE INDEX "idx_decision_book_meeting"
  ON "decision_book_entries" USING btree ("meeting_id");--> statement-breakpoint

-- ────────────────────────────────────────────────────────────────────────
-- Defter ekleme-yalnız: DELETE hiçbir koşulda, UPDATE ise yalnız "kâğıt
-- defterde de değişebilecek" alanlarda serbest.
--
-- Karar metni (`subject`, `body`, `votes_*`, `decided_at`, `entry_no`) bir
-- kez yazıldıktan sonra değiştirilemez; düzeltme yeni bir kayıttır. Buna
-- karşılık `book_page_no` ve ek dosyalar sonradan doldurulabiliyor — noter
-- tasdiki ve eklerin taranması kararın kendisinden sonra oluyor.
--
-- Trigger'da, çünkü kural uygulamaya değil **veriye** ait: yarın bir betik
-- ya da yeni bir servis aynı tabloya yazmaya kalkarsa da geçerli olmalı.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_decision_book_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
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

DROP TRIGGER IF EXISTS trg_decision_book_immutable ON "decision_book_entries";--> statement-breakpoint
CREATE TRIGGER trg_decision_book_immutable
  BEFORE UPDATE OR DELETE ON "decision_book_entries"
  FOR EACH ROW EXECUTE FUNCTION trg_decision_book_immutable();
