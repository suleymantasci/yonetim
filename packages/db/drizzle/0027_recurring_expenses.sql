-- =============================================================================
-- 0027 — tekrarlayan (ileri tarihli) faturalar: her ay belirli günde
-- kendiliğinden ödenecek gider kaydı açan tanım. `last_period` idempotans:
-- aynı dönem iki kez üretilmez.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "recurring_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"description" varchar(240) NOT NULL,
	"category_id" uuid,
	"vendor_id" uuid,
	"staff_id" uuid,
	"amount_kurus" bigint NOT NULL,
	"vat_rate" numeric(4, 2) DEFAULT '0.20' NOT NULL,
	"day_of_month" integer DEFAULT 1 NOT NULL,
	"start_period" varchar(7) NOT NULL,
	"end_period" varchar(7),
	"last_period" varchar(7),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "recurring_expenses_day_check" CHECK ("day_of_month" BETWEEN 1 AND 28),
	CONSTRAINT "recurring_expenses_amount_check" CHECK ("amount_kurus" > 0)
);--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recurring_expenses_tenant" ON "recurring_expenses" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "recurring_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_expenses_recurring_period" ON "expenses" USING btree ("recurring_id", "period") WHERE "recurring_id" IS NOT NULL AND "deleted_at" IS NULL;
