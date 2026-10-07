-- =============================================================================
-- 0018 — personel carisi, açılış fişi
-- Maaş ödemesi/avans gider olarak kalır (expenses.staff_id); tahakkuk, mahsup
-- ve açılış personel defterinde. Kasa/banka/tedarikçi açılışı opening_entries.
-- Yeni tablolar tenant_id taşıdığı için RLS event trigger ile otomatik bağlanır.
-- =============================================================================

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "staff_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "staff_kind" varchar(20);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_staff" ON "expenses" USING btree ("staff_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "staff_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"entry_date" timestamp with time zone NOT NULL,
	"period" varchar(7),
	"amount_kurus" bigint NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text
);--> statement-breakpoint
ALTER TABLE "staff_ledger_entries" ADD CONSTRAINT "staff_ledger_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_ledger_entries" ADD CONSTRAINT "staff_ledger_entries_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_ledger_entries" ADD CONSTRAINT "staff_ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_staff_ledger_staff" ON "staff_ledger_entries" USING btree ("staff_id","entry_date");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "opening_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"as_of_date" timestamp with time zone NOT NULL,
	"account" varchar(20) NOT NULL,
	"bank_account_id" uuid,
	"vendor_id" uuid,
	"amount_kurus" bigint DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "opening_entries" ADD CONSTRAINT "opening_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_entries" ADD CONSTRAINT "opening_entries_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_entries" ADD CONSTRAINT "opening_entries_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_entries" ADD CONSTRAINT "opening_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_opening_entries_tenant" ON "opening_entries" USING btree ("tenant_id");--> statement-breakpoint

-- Kart üzerindeki elle yazılmış avans bakiyesi açılış kaydı olarak taşınıyor;
-- bundan sonra avans bakiyesi cari hareketlerinden hesaplanır.
INSERT INTO "staff_ledger_entries" ("tenant_id", "staff_id", "kind", "entry_date", "amount_kurus", "description")
SELECT "tenant_id", "id", 'opening_advance', COALESCE("started_at", now()), "advance_balance_kurus", 'Önceki avans bakiyesi (personel kartından taşındı)'
FROM "staff"
WHERE "advance_balance_kurus" > 0 AND "deleted_at" IS NULL;
