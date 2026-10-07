-- =============================================================================
-- 0017 — toplantı tebliği + hazirun, belge iptali, sayaç borç bağı,
--        tedarikçi kartı, kargo ve ziyaretçi defteri
-- Yeni tablolar tenant_id taşıdığı için rls.sql'deki event trigger
-- tenant_isolation politikasını otomatik bağlar.
-- =============================================================================

ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "notice_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "notice_method" varchar(30);--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "status_reason" text;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "meeting_attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"owner_name" varchar(160) NOT NULL,
	"proxy_name" varchar(160),
	"proxy_document_url" text,
	"land_share" numeric(10, 6) DEFAULT '0' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "meeting_attendances" ADD CONSTRAINT "meeting_attendances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendances" ADD CONSTRAINT "meeting_attendances_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendances" ADD CONSTRAINT "meeting_attendances_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendances" ADD CONSTRAINT "meeting_attendances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_meeting_attendance_unit" ON "meeting_attendances" USING btree ("meeting_id","unit_id");--> statement-breakpoint

ALTER TABLE "debt_certificates" ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "debt_certificates" ADD COLUMN IF NOT EXISTS "void_reason" text;--> statement-breakpoint
ALTER TABLE "debt_certificates" ADD COLUMN IF NOT EXISTS "voided_by" uuid;--> statement-breakpoint
ALTER TABLE "debt_certificates" ADD CONSTRAINT "debt_certificates_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "meter_readings" ADD COLUMN IF NOT EXISTS "debt_id" uuid;--> statement-breakpoint

ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "tax_office" varchar(80);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "iban" varchar(34);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "address" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "notes" text;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "parcels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid,
	"recipient_name" varchar(160) NOT NULL,
	"carrier" varchar(60),
	"tracking_no" varchar(80),
	"note" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by" uuid,
	"delivered_at" timestamp with time zone,
	"delivered_to" varchar(160),
	"delivered_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_delivered_by_users_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_parcels_tenant_open" ON "parcels" USING btree ("tenant_id","delivered_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_parcels_unit" ON "parcels" USING btree ("unit_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "visitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid,
	"visitor_name" varchar(160) NOT NULL,
	"phone" varchar(20),
	"plate" varchar(20),
	"purpose" varchar(120),
	"note" text,
	"arrived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visitors_tenant_arrived" ON "visitors" USING btree ("tenant_id","arrived_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visitors_unit" ON "visitors" USING btree ("unit_id");
