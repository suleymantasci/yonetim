-- =============================================================================
-- 0025 — harici tahsilat grupları (kullanıcı tanımlı: kira, reklam, vadeli
-- hesap faizi…). Her grup ayrı gelir alt hesabı (602.1x). Kasa gelir
-- hareketi gruba bağlanır; sabit kategoriler (income_category) korunur.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "income_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"account_code" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "income_groups_account_code_check" CHECK ("account_code" ~ '^6[0-9]{2}(\.[0-9]{1,3})?$')
);--> statement-breakpoint
ALTER TABLE "income_groups" ADD CONSTRAINT "income_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_income_groups_tenant" ON "income_groups" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_income_groups_name" ON "income_groups" USING btree ("tenant_id", lower("name")) WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_income_groups_code" ON "income_groups" USING btree ("tenant_id", "account_code") WHERE "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "income_group_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_income_group_id_income_groups_id_fk" FOREIGN KEY ("income_group_id") REFERENCES "public"."income_groups"("id") ON DELETE restrict ON UPDATE no action;
