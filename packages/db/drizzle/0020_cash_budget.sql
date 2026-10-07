-- =============================================================================
-- 0020 — kasa hareketleri (virman, harici tahsilat), kasa devir tutanağı,
-- işletme projesi (bütçe) başlık + kalemleri.
-- Yeni tablolar tenant_id taşıdığı için RLS event trigger ile otomatik bağlanır.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"movement_date" timestamp with time zone NOT NULL,
	"amount_kurus" bigint NOT NULL,
	"from_account" varchar(10),
	"from_bank_account_id" uuid,
	"to_account" varchar(10) NOT NULL,
	"to_bank_account_id" uuid,
	"income_category" varchar(30),
	"payer_name" varchar(160),
	"description" text,
	"document_no" varchar(60),
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_amount_positive" CHECK ("amount_kurus" > 0),
	CONSTRAINT "cash_movements_kind" CHECK ("kind" IN ('transfer', 'income')),
	CONSTRAINT "cash_movements_accounts" CHECK (
		("to_account" = 'cash' AND "to_bank_account_id" IS NULL OR "to_account" = 'bank' AND "to_bank_account_id" IS NOT NULL)
		AND ("kind" = 'income' AND "from_account" IS NULL
			OR "kind" = 'transfer' AND ("from_account" = 'cash' AND "from_bank_account_id" IS NULL OR "from_account" = 'bank' AND "from_bank_account_id" IS NOT NULL))
	)
);--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_from_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("from_bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_to_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("to_bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_movements_tenant_date" ON "cash_movements" USING btree ("tenant_id","movement_date");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cash_handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"handover_date" timestamp with time zone NOT NULL,
	"from_name" varchar(160) NOT NULL,
	"to_name" varchar(160) NOT NULL,
	"note" text,
	"snapshot" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_handovers_tenant" ON "cash_handovers" USING btree ("tenant_id","handover_date");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "operating_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"start_period" varchar(7) NOT NULL,
	"end_period" varchar(7) NOT NULL,
	"formula" varchar(20) DEFAULT 'land_share' NOT NULL,
	"mix_equal_pct" integer DEFAULT 50 NOT NULL,
	"reserve_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone,
	"approval_note" text,
	"dues_plan_id" uuid,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "operating_budgets_period_order" CHECK ("start_period" <= "end_period")
);--> statement-breakpoint
ALTER TABLE "operating_budgets" ADD CONSTRAINT "operating_budgets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_budgets" ADD CONSTRAINT "operating_budgets_dues_plan_id_dues_plans_id_fk" FOREIGN KEY ("dues_plan_id") REFERENCES "public"."dues_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_budgets" ADD CONSTRAINT "operating_budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operating_budgets_tenant" ON "operating_budgets" USING btree ("tenant_id","start_period");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "operating_budget_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"category_id" uuid,
	"is_staff" boolean DEFAULT false NOT NULL,
	"label" varchar(160) NOT NULL,
	"planned_kurus" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operating_budget_lines_planned_nonneg" CHECK ("planned_kurus" >= 0)
);--> statement-breakpoint
ALTER TABLE "operating_budget_lines" ADD CONSTRAINT "operating_budget_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_budget_lines" ADD CONSTRAINT "operating_budget_lines_budget_id_operating_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."operating_budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_budget_lines" ADD CONSTRAINT "operating_budget_lines_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operating_budget_lines_budget" ON "operating_budget_lines" USING btree ("budget_id");
