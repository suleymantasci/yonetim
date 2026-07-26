CREATE TABLE "user_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid,
	"kind" varchar(20) DEFAULT 'correspondence' NOT NULL,
	"label" varchar(60),
	"line1" varchar(200) NOT NULL,
	"line2" varchar(200),
	"district" varchar(80),
	"city" varchar(80),
	"postal_code" varchar(12),
	"country_code" varchar(2) DEFAULT 'TR' NOT NULL,
	"ptt_code" varchar(20),
	"kep_address" varchar(160),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(30) DEFAULT 'custom' NOT NULL,
	"locale" varchar(5) DEFAULT 'tr' NOT NULL,
	"whatsapp_body" text,
	"whatsapp_template_name" varchar(120),
	"whatsapp_approval_status" varchar(20) DEFAULT 'none' NOT NULL,
	"whatsapp_rejection_reason" text,
	"sms_body" text,
	"email_subject" varchar(200),
	"email_body" text,
	"in_app_title" varchar(200),
	"in_app_body" text,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"channel_priority" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"prefix" varchar(12) NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rate_limit_per_minute" integer DEFAULT 60 NOT NULL,
	"last_used_at" timestamp with time zone,
	"request_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emergency_contact_name" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emergency_contact_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "land_share_numerator" integer;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "land_share_denominator" integer;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "late_fee_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "late_fee_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "parent_debt_id" uuid;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "installment_no" integer;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "installment_count" integer;--> statement-breakpoint
ALTER TABLE "dues_plans" ADD COLUMN "late_fee_daily_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "icon" varchar(40);--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "default_vat_rate" numeric(4, 2);--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "debtor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_addresses_user" ON "user_addresses" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "idx_user_addresses_tenant" ON "user_addresses" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_message_templates_scope_code" ON "message_templates" USING btree ("tenant_id","code","locale");--> statement-breakpoint
CREATE INDEX "idx_message_templates_category" ON "message_templates" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_api_keys_hash" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_api_keys_tenant" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_debtor_user_id_users_id_fk" FOREIGN KEY ("debtor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_expense_categories_parent" ON "expense_categories" USING btree ("parent_id");