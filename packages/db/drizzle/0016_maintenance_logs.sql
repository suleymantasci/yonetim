-- =============================================================================
-- 0016 — bakım geçmişi (maintenance_logs)
-- "Bakım yapıldı" maintenance_records.last_done_at/last_cost_kurus üstüne
-- yazıyordu; önceki bakımlar kayboluyordu. Her tamamlama artık bir satır.
-- RLS: tenant_id sütunu olduğu için rls.sql'deki event trigger
-- tenant_isolation politikasını otomatik bağlar.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "maintenance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"done_at" timestamp with time zone NOT NULL,
	"cost_kurus" bigint DEFAULT 0 NOT NULL,
	"document_url" text,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_record_id_maintenance_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."maintenance_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maintenance_logs_record" ON "maintenance_logs" USING btree ("record_id","done_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maintenance_logs_tenant_done" ON "maintenance_logs" USING btree ("tenant_id","done_at");--> statement-breakpoint
-- Mevcut "son bakım" bilgisi geçmişin ilk satırı olarak taşınıyor; yoksa
-- bugüne kadar "yapıldı" denmiş bakımlar listede hiç görünmezdi.
INSERT INTO "maintenance_logs" ("tenant_id", "record_id", "done_at", "cost_kurus", "document_url", "note")
SELECT "tenant_id", "id", "last_done_at", "last_cost_kurus", "document_url", NULL
FROM "maintenance_records"
WHERE "last_done_at" IS NOT NULL;
