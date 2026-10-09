-- =============================================================================
-- 0026 — daire kartı: hane halkı (dairede yaşayan, panel kullanıcısı olmayan
-- kişiler) ve araç plakaları. tenant_id taşıdıkları için RLS otomatik.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "household_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"relation" varchar(20) DEFAULT 'other' NOT NULL,
	"birth_year" integer,
	"phone" varchar(20),
	"note" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_members_relation_check" CHECK ("relation" IN ('spouse', 'child', 'parent', 'relative', 'other')),
	CONSTRAINT "household_members_birth_year_check" CHECK ("birth_year" IS NULL OR ("birth_year" BETWEEN 1900 AND 2100))
);--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_household_unit" ON "household_members" USING btree ("tenant_id", "unit_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unit_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"plate" varchar(16) NOT NULL,
	"description" varchar(120),
	"owner_name" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "unit_vehicles" ADD CONSTRAINT "unit_vehicles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_vehicles" ADD CONSTRAINT "unit_vehicles_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_unit_vehicles_plate" ON "unit_vehicles" USING btree ("tenant_id", "plate");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_unit_vehicles_unit" ON "unit_vehicles" USING btree ("tenant_id", "unit_id");
