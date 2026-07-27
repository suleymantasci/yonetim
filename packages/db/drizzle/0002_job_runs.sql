-- Uzun süren iş koşusu — MIMARI-PLAN §10 B3 (GAP 4.1.17'nin önkoşulu).
--
-- NEDEN VERİTABANINDA, KUYRUKTA DEĞİL: BullMQ job'ının kendi ilerleme alanı
-- var ama o Redis'te ve `removeOnComplete` ile siliniyor. "Geçen hafta yapılan
-- göçte hangi satırlar hatalıydı" sorusu haftalar sonra sorulabiliyor; cevabın
-- kalıcı olması gerek. Kuyruk çalıştırmanın aracı, kaydın yeri değil.
--
-- `tenant_id` sütunu olduğu için `rls.sql` bu tabloya politikayı **otomatik**
-- uyguluyor; ayrıca bir şey yazmak gerekmiyor (Bölüm 13.3).
CREATE TABLE IF NOT EXISTS "job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "kind" varchar(60) NOT NULL,
  "status" varchar(20) DEFAULT 'queued' NOT NULL,
  "queue_job_id" varchar(80),
  "started_by_user_id" uuid,
  "processed" integer DEFAULT 0 NOT NULL,
  -- Bilinmiyorsa NULL: 0 yazmak arayüzde "%0 tamamlandı" gibi okunur ve
  -- bekleyen kişiye yanlış bilgi verir.
  "total" integer,
  "step" varchar(80),
  "succeeded" integer DEFAULT 0 NOT NULL,
  "failed" integer DEFAULT 0 NOT NULL,
  "errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "input" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_started_by_user_id_users_id_fk"
  FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_job_runs_tenant_created" ON "job_runs" USING btree ("tenant_id","created_at");
--> statement-breakpoint
-- Worker "koşan var mı" sorusunu her tick'te soruyor; durum üzerinden index şart.
CREATE INDEX "idx_job_runs_status" ON "job_runs" USING btree ("status");
