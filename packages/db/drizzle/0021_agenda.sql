-- =============================================================================
-- 0021 — ajanda: takvimde görev ve notlar (site/daireye bağlı, hatırlatmalı).
-- tenant_id taşıdığı için RLS event trigger ile otomatik bağlanır.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "agenda_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid,
	"kind" varchar(10) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"day" date,
	"remind_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"shared" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "agenda_items_kind_check" CHECK ("kind" IN ('task', 'note')),
	CONSTRAINT "agenda_items_remind_needs_day" CHECK ("remind_at" IS NULL OR "day" IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agenda_tenant_day" ON "agenda_items" USING btree ("tenant_id","day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agenda_due_reminder" ON "agenda_items" USING btree ("remind_at") WHERE "reminded_at" IS NULL AND "deleted_at" IS NULL;
