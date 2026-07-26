CREATE TYPE "public"."bank_tx_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'paused', 'expired');--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('free_trial_extension', 'x_months_free', 'x_percent_off', 'x_amount_off', 'free_first_period', 'referral_reward', 'partner_bundled', 'migration_credit', 'custom');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('whatsapp', 'sms', 'email', 'push', 'in_app', 'voice');--> statement-breakpoint
CREATE TYPE "public"."debt_kind" AS ENUM('dues', 'utility', 'reservation', 'penalty', 'late_fee', 'extra', 'legal_cost');--> statement-breakpoint
CREATE TYPE "public"."debt_status" AS ENUM('pending', 'partial', 'paid', 'overdue', 'in_legal', 'written_off', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."document_category" AS ENUM('contract', 'license', 'meeting_minutes', 'invoice', 'maintenance_report', 'management_plan', 'insurance', 'legal', 'kvkk', 'identity', 'other');--> statement-breakpoint
CREATE TYPE "public"."dues_formula" AS ENUM('equal', 'land_share', 'area', 'person_count', 'meter', 'mixed', 'custom');--> statement-breakpoint
CREATE TYPE "public"."dues_period" AS ENUM('monthly', 'quarterly', 'semiannual', 'yearly', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('draft', 'pending_approval', 'approved', 'paid', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'paid', 'overdue', 'void', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."kvkk_request_status" AS ENUM('received', 'in_progress', 'fulfilled', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."kvkk_request_type" AS ENUM('access', 'rectification', 'erasure', 'objection', 'portability');--> statement-breakpoint
CREATE TYPE "public"."legal_stage" AS ENUM('warning_letter', 'notice_served', 'lawsuit', 'judgment', 'enforcement', 'seizure', 'collection', 'closed');--> statement-breakpoint
CREATE TYPE "public"."meter_type" AS ENUM('water', 'hot_water', 'gas', 'electric', 'heat_calorimeter');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'scheduled', 'sent', 'delivered', 'read', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ownership_type" AS ENUM('owner', 'tenant', 'vacant');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('card', 'bank_transfer', 'auto_debit', 'cash', 'credit_balance', 'offset');--> statement-breakpoint
CREATE TYPE "public"."payment_processor" AS ENUM('iyzico', 'paytr', 'param', 'manual', 'bank');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('initiated', 'pending_3ds', 'authorized', 'completed', 'failed', 'refunded', 'chargeback');--> statement-breakpoint
CREATE TYPE "public"."poll_visibility" AS ENUM('open', 'secret');--> statement-breakpoint
CREATE TYPE "public"."poll_weight" AS ENUM('equal', 'land_share');--> statement-breakpoint
CREATE TYPE "public"."quorum_rule" AS ENUM('simple_majority', 'absolute_majority', 'two_thirds', 'four_fifths', 'unanimous');--> statement-breakpoint
CREATE TYPE "public"."request_priority" AS ENUM('critical', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('open', 'assigned', 'in_progress', 'waiting_resident', 'resolved', 'closed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'support_agent', 'company_admin', 'company_operator', 'manager', 'auditor', 'accountant', 'staff', 'owner', 'tenant_resident');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('kapici', 'guvenlik', 'temizlik', 'bahcivan', 'teknik', 'diger');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'grace', 'suspended', 'cancelled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('trial', 'active', 'past_due', 'suspended', 'archived', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tenant_type" AS ENUM('apartment', 'site', 'residence', 'plaza', 'avm', 'office', 'vakif', 'dernek');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('flat', 'shop', 'office', 'depot', 'garage', 'villa', 'common_area');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(60) NOT NULL,
	"tax_number" varchar(11),
	"tax_office" varchar(100),
	"email" varchar(200),
	"phone" varchar(20),
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" "tenant_type" DEFAULT 'apartment' NOT NULL,
	"unit_count" integer DEFAULT 0 NOT NULL,
	"manager_id" uuid,
	"company_id" uuid,
	"city" varchar(60),
	"district" varchar(60),
	"neighborhood" varchar(120),
	"address_line" text,
	"postal_code" varchar(10),
	"latitude" varchar(20),
	"longitude" varchar(20),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "tenant_status" DEFAULT 'trial' NOT NULL,
	"plan_id" uuid,
	"trial_started_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"suspension_reason" text,
	"migrated_from" varchar(40),
	"landing_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid NOT NULL,
	"kind" varchar(60) NOT NULL,
	"granted" boolean NOT NULL,
	"document_version" varchar(20) NOT NULL,
	"ip" varchar(45),
	"user_agent" text,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"title" varchar(80),
	"is_primary" boolean DEFAULT false NOT NULL,
	"invited_by" uuid,
	"invited_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"active_tenant_id" uuid,
	"token" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" varchar(45),
	"user_agent" text,
	"device" varchar(120),
	"impersonated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"email_verified_at" timestamp with time zone,
	"phone" varchar(20),
	"phone_verified_at" timestamp with time zone,
	"password_hash" text,
	"first_name" varchar(80),
	"last_name" varchar(80),
	"tckn_encrypted" text,
	"tckn_index" varchar(64),
	"avatar_url" text,
	"locale" varchar(5) DEFAULT 'tr' NOT NULL,
	"platform_role" "user_role",
	"two_factor_secret" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"whatsapp_opt_in_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"purpose" varchar(40) NOT NULL,
	"tenant_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"floor_count" integer DEFAULT 1 NOT NULL,
	"unit_count" integer DEFAULT 0 NOT NULL,
	"has_elevator" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" varchar(40) NOT NULL,
	"capacity" integer,
	"fee_kurus" integer DEFAULT 0 NOT NULL,
	"fee_unit" varchar(10) DEFAULT 'hour' NOT NULL,
	"deposit_kurus" integer DEFAULT 0 NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"max_hours_per_booking" integer DEFAULT 4 NOT NULL,
	"max_bookings_per_month" integer DEFAULT 4 NOT NULL,
	"open_hour" integer DEFAULT 8 NOT NULL,
	"close_hour" integer DEFAULT 23 NOT NULL,
	"rules_text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "unit_occupancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"relation" "ownership_type" NOT NULL,
	"ownership_pct" numeric(6, 3) DEFAULT '100' NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"debt_transfer_policy" varchar(20) DEFAULT 'owner' NOT NULL,
	"contract_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"block_id" uuid,
	"number" varchar(20) NOT NULL,
	"floor" integer DEFAULT 0 NOT NULL,
	"type" "unit_type" DEFAULT 'flat' NOT NULL,
	"area_m2" numeric(8, 2),
	"land_share" numeric(10, 6),
	"room_count" varchar(10),
	"resident_count" integer DEFAULT 0 NOT NULL,
	"ownership_type" "ownership_type" DEFAULT 'owner' NOT NULL,
	"current_owner_id" uuid,
	"current_tenant_id" uuid,
	"dues_exempt" boolean DEFAULT false NOT NULL,
	"dues_multiplier" numeric(5, 3) DEFAULT '1' NOT NULL,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bank_name" varchar(80) NOT NULL,
	"iban_encrypted" text NOT NULL,
	"iban_masked" varchar(40) NOT NULL,
	"iban_index" varchar(64),
	"account_name" varchar(160),
	"purpose" varchar(40) DEFAULT 'dues' NOT NULL,
	"provider" varchar(40),
	"provider_ref" varchar(120),
	"balance_kurus" bigint DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"sync_status" varchar(20) DEFAULT 'idle' NOT NULL,
	"sync_error" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" varchar(120) NOT NULL,
	"direction" "bank_tx_direction" NOT NULL,
	"amount_kurus" bigint NOT NULL,
	"balance_after_kurus" bigint,
	"counterparty" varchar(200),
	"counterparty_iban" varchar(40),
	"description" text,
	"transaction_at" timestamp with time zone NOT NULL,
	"matched_payment_id" uuid,
	"matched_unit_id" uuid,
	"match_status" varchar(20) DEFAULT 'unmatched' NOT NULL,
	"match_confidence" numeric(4, 3),
	"provider" varchar(40) NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"category_id" uuid,
	"planned_kurus" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_debt_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"change_type" varchar(30) NOT NULL,
	"old_amount_kurus" bigint,
	"new_amount_kurus" bigint,
	"old_due_date" timestamp with time zone,
	"new_due_date" timestamp with time zone,
	"changed_by" uuid,
	"reason" text,
	"visible_to_resident" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"debtor_user_id" uuid,
	"dues_plan_id" uuid,
	"dues_run_id" uuid,
	"kind" "debt_kind" DEFAULT 'dues' NOT NULL,
	"period" varchar(7),
	"description" varchar(200) NOT NULL,
	"amount_kurus" bigint NOT NULL,
	"paid_kurus" bigint DEFAULT 0 NOT NULL,
	"late_fee_kurus" bigint DEFAULT 0 NOT NULL,
	"late_fee_calculated_at" timestamp with time zone,
	"due_date" timestamp with time zone NOT NULL,
	"status" "debt_status" DEFAULT 'pending' NOT NULL,
	"legal_case_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dues_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"period" "dues_period" DEFAULT 'monthly' NOT NULL,
	"formula" "dues_formula" DEFAULT 'equal' NOT NULL,
	"total_amount_kurus" bigint,
	"base_amount_kurus" bigint,
	"mix_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"due_day_of_month" integer DEFAULT 10 NOT NULL,
	"applies_to" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"late_fee_monthly_pct" numeric(5, 2) DEFAULT '5' NOT NULL,
	"start_period" varchar(7) NOT NULL,
	"end_period" varchar(7),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dues_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dues_plan_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"generated_count" integer DEFAULT 0 NOT NULL,
	"total_kurus" bigint DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'completed' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"parent_id" uuid,
	"distribution" "dues_formula" DEFAULT 'equal' NOT NULL,
	"is_shared" boolean DEFAULT true NOT NULL,
	"color" varchar(9),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid,
	"vendor_id" uuid,
	"vendor_name" varchar(160),
	"description" varchar(240) NOT NULL,
	"amount_kurus" bigint NOT NULL,
	"vat_rate" numeric(4, 2) DEFAULT '0.20' NOT NULL,
	"vat_kurus" bigint DEFAULT 0 NOT NULL,
	"withholding_kurus" bigint DEFAULT 0 NOT NULL,
	"invoice_no" varchar(60),
	"einvoice_uuid" varchar(60),
	"expense_date" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_via" varchar(40),
	"bank_account_id" uuid,
	"attachment_url" text,
	"status" "expense_status" DEFAULT 'approved' NOT NULL,
	"distributed_at" timestamp with time zone,
	"period" varchar(7),
	"created_by" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"amount_kurus" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid,
	"payer_user_id" uuid,
	"amount_kurus" bigint NOT NULL,
	"platform_fee_kurus" bigint DEFAULT 0 NOT NULL,
	"processor_fee_kurus" bigint DEFAULT 0 NOT NULL,
	"method" "payment_method" NOT NULL,
	"processor" "payment_processor" DEFAULT 'manual' NOT NULL,
	"processor_ref" varchar(120),
	"conversation_id" varchar(120),
	"status" "payment_status" DEFAULT 'initiated' NOT NULL,
	"installment" integer DEFAULT 1 NOT NULL,
	"card_last4" varchar(4),
	"card_brand" varchar(20),
	"receipt_url" text,
	"receipt_no" varchar(30),
	"failure_reason" text,
	"refunded_kurus" bigint DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"idempotency_key" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" varchar(40) NOT NULL,
	"severity" varchar(10) DEFAULT 'warning' NOT NULL,
	"payment_id" uuid,
	"bank_transaction_id" uuid,
	"expected_kurus" bigint,
	"actual_kurus" bigint,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category" "document_category" DEFAULT 'other' NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"owner_type" varchar(40),
	"owner_id" uuid,
	"url" text NOT NULL,
	"mime_type" varchar(100),
	"size_bytes" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"previous_version_id" uuid,
	"expires_at" timestamp with time zone,
	"visibility" varchar(20) DEFAULT 'managers' NOT NULL,
	"search_text" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "maintenance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid,
	"equipment_type" varchar(80) NOT NULL,
	"label" varchar(160) NOT NULL,
	"location" varchar(120),
	"vendor_id" uuid,
	"interval_days" integer NOT NULL,
	"last_done_at" timestamp with time zone,
	"next_due_at" timestamp with time zone NOT NULL,
	"last_cost_kurus" bigint DEFAULT 0 NOT NULL,
	"document_url" text,
	"checklist_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "maintenance_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"equipment_type" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"interval_days" integer NOT NULL,
	"regulatory_ref" text,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reminder_days" jsonb DEFAULT '[30,15,7,0,-3]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"meter_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"previous_value" numeric(12, 3) NOT NULL,
	"current_value" numeric(12, 3) NOT NULL,
	"consumption" numeric(12, 3) NOT NULL,
	"amount_kurus" bigint DEFAULT 0 NOT NULL,
	"reading_date" timestamp with time zone NOT NULL,
	"photo_url" text,
	"ocr_confidence" numeric(4, 3),
	"anomaly_flag" boolean DEFAULT false NOT NULL,
	"read_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid,
	"type" "meter_type" NOT NULL,
	"serial_no" varchar(60),
	"is_common" boolean DEFAULT false NOT NULL,
	"unit_price_kurus" bigint DEFAULT 0 NOT NULL,
	"initial_value" numeric(12, 3) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "request_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"attachment_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid,
	"created_by_user_id" uuid,
	"code" varchar(20) NOT NULL,
	"category" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"priority" "request_priority" DEFAULT 'normal' NOT NULL,
	"status" "request_status" DEFAULT 'open' NOT NULL,
	"assigned_to_user_id" uuid,
	"assigned_vendor_id" uuid,
	"sla_due_at" timestamp with time zone,
	"sla_breached_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"cost_kurus" bigint DEFAULT 0 NOT NULL,
	"photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"satisfaction_score" integer,
	"source" varchar(20) DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"unit_id" uuid,
	"user_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"guest_count" integer DEFAULT 1 NOT NULL,
	"fee_kurus" bigint DEFAULT 0 NOT NULL,
	"deposit_kurus" bigint DEFAULT 0 NOT NULL,
	"deposit_returned_at" timestamp with time zone,
	"status" "reservation_status" DEFAULT 'pending' NOT NULL,
	"debt_id" uuid,
	"note" text,
	"approved_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"full_name" varchar(160) NOT NULL,
	"role" "staff_role" DEFAULT 'kapici' NOT NULL,
	"phone" varchar(20),
	"tckn_encrypted" text,
	"iban_encrypted" text,
	"gross_salary_kurus" bigint DEFAULT 0 NOT NULL,
	"net_salary_kurus" bigint DEFAULT 0 NOT NULL,
	"sgk_premium_kurus" bigint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"annual_leave_days" integer DEFAULT 14 NOT NULL,
	"used_leave_days" integer DEFAULT 0 NOT NULL,
	"advance_balance_kurus" bigint DEFAULT 0 NOT NULL,
	"shift_plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "staff_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"check_in_at" timestamp with time zone NOT NULL,
	"check_out_at" timestamp with time zone,
	"method" varchar(20) DEFAULT 'mobile' NOT NULL,
	"latitude" varchar(20),
	"longitude" varchar(20),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_leaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"kind" varchar(30) DEFAULT 'annual' NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"days" integer NOT NULL,
	"approved_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category" varchar(60) NOT NULL,
	"name" varchar(160) NOT NULL,
	"contact_name" varchar(120),
	"phone" varchar(20),
	"email" varchar(200),
	"tax_number" varchar(11),
	"contract_url" text,
	"contract_ends_at" timestamp with time zone,
	"rating_avg" numeric(3, 2),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "announcement_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"audience" varchar(20) DEFAULT 'all' NOT NULL,
	"audience_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"channels" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
	"is_urgent" boolean DEFAULT false NOT NULL,
	"attachment_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"kvkk_flagged" boolean DEFAULT false NOT NULL,
	"kvkk_findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variant" varchar(4),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversation_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"phone" varchar(20) NOT NULL,
	"user_id" uuid,
	"state" varchar(40) DEFAULT 'idle' NOT NULL,
	"slots" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_intent" varchar(40),
	"service_window_ends_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"decision_no" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"quorum_rule" "quorum_rule" DEFAULT 'simple_majority' NOT NULL,
	"votes_for" numeric(12, 6) DEFAULT '0' NOT NULL,
	"votes_against" numeric(12, 6) DEFAULT '0' NOT NULL,
	"abstentions" numeric(12, 6) DEFAULT '0' NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"ledger_page_no" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"kind" varchar(20) DEFAULT 'ordinary' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"second_call_at" timestamp with time zone,
	"location" varchar(200),
	"online_url" text,
	"agenda" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attendance_share" numeric(6, 4),
	"quorum_met" boolean,
	"minutes_url" text,
	"status" varchar(20) DEFAULT 'planned' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"thread_id" uuid,
	"user_id" uuid,
	"channel" "channel" DEFAULT 'in_app' NOT NULL,
	"direction" varchar(3) NOT NULL,
	"body" text,
	"media_url" text,
	"external_id" varchar(120),
	"intent" varchar(40),
	"intent_confidence" numeric(4, 3),
	"handled_by_bot" boolean DEFAULT false NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid,
	"channel" "channel" NOT NULL,
	"template" varchar(60) NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"subject" varchar(200),
	"body" text,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"priority" varchar(10) DEFAULT 'normal' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"provider" varchar(40),
	"provider_ref" varchar(120),
	"cost_kurus" bigint DEFAULT 0 NOT NULL,
	"resource_type" varchar(40),
	"resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nps_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"period" varchar(7) NOT NULL,
	"score" integer NOT NULL,
	"comment" text,
	"theme" varchar(60),
	"channel" "channel" DEFAULT 'whatsapp' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"poll_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"user_id" uuid,
	"voter_hash" varchar(64),
	"option_id" varchar(40) NOT NULL,
	"weight" numeric(12, 6) DEFAULT '1' NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"meeting_id" uuid,
	"question" text NOT NULL,
	"description" text,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weight_mode" "poll_weight" DEFAULT 'equal' NOT NULL,
	"quorum_rule" "quorum_rule" DEFAULT 'simple_majority' NOT NULL,
	"visibility" "poll_visibility" DEFAULT 'open' NOT NULL,
	"allow_multiple" boolean DEFAULT false NOT NULL,
	"owners_only" boolean DEFAULT true NOT NULL,
	"opens_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"result_json" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid,
	"action" varchar(60) NOT NULL,
	"resource" varchar(60) NOT NULL,
	"resource_id" uuid,
	"diff" jsonb,
	"reason" text,
	"ip" varchar(45),
	"user_agent" text,
	"impersonated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"subject_user_id" uuid NOT NULL,
	"accessor_user_id" uuid,
	"data_category" varchar(60) NOT NULL,
	"action" varchar(20) NOT NULL,
	"purpose" varchar(120),
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_breaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"affected_user_count" integer DEFAULT 0 NOT NULL,
	"data_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"board_notified_at" timestamp with time zone,
	"subjects_notified_at" timestamp with time zone,
	"mitigation" text,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debt_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"requested_by" uuid,
	"result" varchar(20) NOT NULL,
	"outstanding_kurus" bigint DEFAULT 0 NOT NULL,
	"as_of_date" timestamp with time zone NOT NULL,
	"serial_no" varchar(30) NOT NULL,
	"pdf_url" text,
	"kep_recipient" varchar(200),
	"kep_sent_at" timestamp with time zone,
	"kep_fee_kurus" bigint DEFAULT 0 NOT NULL,
	"verification_code" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kvkk_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid,
	"requester_email" varchar(255),
	"type" "kvkk_request_type" NOT NULL,
	"status" "kvkk_request_status" DEFAULT 'received' NOT NULL,
	"detail" text,
	"due_at" timestamp with time zone NOT NULL,
	"fulfilled_at" timestamp with time zone,
	"response_note" text,
	"export_url" text,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lawyers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"bar_no" varchar(40),
	"bar_city" varchar(60),
	"phone" varchar(20),
	"email" varchar(200),
	"commission_pct" numeric(5, 2) DEFAULT '10' NOT NULL,
	"contract_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"stage" "legal_stage" NOT NULL,
	"title" varchar(200) NOT NULL,
	"note" text,
	"document_url" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_id" uuid,
	"debtor_user_id" uuid,
	"lawyer_id" uuid,
	"case_no" varchar(60),
	"stage" "legal_stage" DEFAULT 'warning_letter' NOT NULL,
	"principal_kurus" bigint DEFAULT 0 NOT NULL,
	"interest_kurus" bigint DEFAULT 0 NOT NULL,
	"costs_kurus" bigint DEFAULT 0 NOT NULL,
	"collected_kurus" bigint DEFAULT 0 NOT NULL,
	"collection_score" integer,
	"score_factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_action_at" timestamp with time zone,
	"next_action_note" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "campaign_type" NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"audience" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reward" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"per_tenant_limit" integer DEFAULT 1 NOT NULL,
	"show_on_pricing_page" boolean DEFAULT true NOT NULL,
	"badge" varchar(20),
	"stackable" boolean DEFAULT false NOT NULL,
	"hero_image_url" text,
	"slug" varchar(80) NOT NULL,
	"ab_group" varchar(10),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(60) NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_pct" integer DEFAULT 0 NOT NULL,
	"tenant_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"credentials_encrypted" text,
	"status" varchar(20) DEFAULT 'disconnected' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid,
	"invoice_no" varchar(30) NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"subtotal_kurus" bigint NOT NULL,
	"discount_kurus" bigint DEFAULT 0 NOT NULL,
	"vat_kurus" bigint DEFAULT 0 NOT NULL,
	"total_kurus" bigint NOT NULL,
	"sms_overage_count" integer DEFAULT 0 NOT NULL,
	"sms_overage_kurus" bigint DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"einvoice_uuid" varchar(60),
	"einvoice_sent_at" timestamp with time zone,
	"pdf_url" text,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" varchar(30) NOT NULL,
	"file_name" varchar(200),
	"file_url" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"imported_rows" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(80) NOT NULL,
	"tier" integer NOT NULL,
	"min_units" integer NOT NULL,
	"max_units" integer,
	"yearly_price_kurus" bigint NOT NULL,
	"sms_quota_yearly" integer DEFAULT 0 NOT NULL,
	"competitor_yearly_price_kurus" bigint,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_code_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"campaign_id" uuid,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid,
	"discount_kurus" bigint DEFAULT 0 NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"code" varchar(30) NOT NULL,
	"discount_type" varchar(20) NOT NULL,
	"discount_value" numeric(12, 2) NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"restricted_to_tenant_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_tenant_id" uuid NOT NULL,
	"referred_tenant_id" uuid,
	"code" varchar(20) NOT NULL,
	"invitee_email" varchar(255),
	"invitee_phone" varchar(20),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reward_kurus" bigint DEFAULT 0 NOT NULL,
	"reward_paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"billing_period" varchar(20) DEFAULT 'yearly' NOT NULL,
	"processor" varchar(20) DEFAULT 'iyzico' NOT NULL,
	"processor_sub_id" varchar(120),
	"unit_count_snapshot" integer DEFAULT 0 NOT NULL,
	"price_kurus" bigint NOT NULL,
	"list_price_kurus" bigint NOT NULL,
	"discount_kurus" bigint DEFAULT 0 NOT NULL,
	"applied_campaign_id" uuid,
	"applied_promo_code" varchar(30),
	"price_locked_until" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"dunning_step" integer DEFAULT 0 NOT NULL,
	"dunning_started_at" timestamp with time zone,
	"sms_used_this_period" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_occupancies" ADD CONSTRAINT "unit_occupancies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_occupancies" ADD CONSTRAINT "unit_occupancies_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_occupancies" ADD CONSTRAINT "unit_occupancies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_current_owner_id_users_id_fk" FOREIGN KEY ("current_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_current_tenant_id_users_id_fk" FOREIGN KEY ("current_tenant_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_payment_id_payments_id_fk" FOREIGN KEY ("matched_payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_unit_id_units_id_fk" FOREIGN KEY ("matched_unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_debt_changes" ADD CONSTRAINT "audit_debt_changes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_debt_changes" ADD CONSTRAINT "audit_debt_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_debtor_user_id_users_id_fk" FOREIGN KEY ("debtor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_dues_plan_id_dues_plans_id_fk" FOREIGN KEY ("dues_plan_id") REFERENCES "public"."dues_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_dues_run_id_dues_runs_id_fk" FOREIGN KEY ("dues_run_id") REFERENCES "public"."dues_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_plans" ADD CONSTRAINT "dues_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_plans" ADD CONSTRAINT "dues_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_runs" ADD CONSTRAINT "dues_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_runs" ADD CONSTRAINT "dues_runs_dues_plan_id_dues_plans_id_fk" FOREIGN KEY ("dues_plan_id") REFERENCES "public"."dues_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_issues" ADD CONSTRAINT "reconciliation_issues_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_template_id_maintenance_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."maintenance_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_read_by_users_id_fk" FOREIGN KEY ("read_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_comments" ADD CONSTRAINT "request_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_comments" ADD CONSTRAINT "request_comments_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_comments" ADD CONSTRAINT "request_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_states" ADD CONSTRAINT "conversation_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_decisions" ADD CONSTRAINT "meeting_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_decisions" ADD CONSTRAINT "meeting_decisions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nps_responses" ADD CONSTRAINT "nps_responses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nps_responses" ADD CONSTRAINT "nps_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_certificates" ADD CONSTRAINT "debt_certificates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_certificates" ADD CONSTRAINT "debt_certificates_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_certificates" ADD CONSTRAINT "debt_certificates_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kvkk_requests" ADD CONSTRAINT "kvkk_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lawyers" ADD CONSTRAINT "lawyers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_case_events" ADD CONSTRAINT "legal_case_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_case_events" ADD CONSTRAINT "legal_case_events_case_id_legal_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."legal_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_debtor_user_id_users_id_fk" FOREIGN KEY ("debtor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_lawyer_id_lawyers_id_fk" FOREIGN KEY ("lawyer_id") REFERENCES "public"."lawyers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_companies_slug" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tenants_slug" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_tenants_status" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tenants_period_end" ON "tenants" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX "idx_tenants_company" ON "tenants" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_tenants_city_district" ON "tenants" USING btree ("city","district");--> statement-breakpoint
CREATE INDEX "idx_consents_user_kind" ON "consents" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "idx_consents_tenant" ON "consents" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_memberships_tenant_user_role" ON "memberships" USING btree ("tenant_id","user_id","role");--> statement-breakpoint
CREATE INDEX "idx_memberships_tenant" ON "memberships" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_memberships_user" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sessions_token" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_phone" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_users_tckn_index" ON "users" USING btree ("tckn_index");--> statement-breakpoint
CREATE INDEX "idx_verification_identifier" ON "verification_tokens" USING btree ("identifier","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_verification_token_hash" ON "verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_blocks_tenant" ON "blocks" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_blocks_tenant_name" ON "blocks" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "idx_resources_tenant" ON "resources" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_occupancy_tenant_unit" ON "unit_occupancies" USING btree ("tenant_id","unit_id");--> statement-breakpoint
CREATE INDEX "idx_occupancy_user" ON "unit_occupancies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_occupancy_active" ON "unit_occupancies" USING btree ("unit_id","end_date");--> statement-breakpoint
CREATE INDEX "idx_units_tenant" ON "units" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_units_tenant_block_number" ON "units" USING btree ("tenant_id","block_id","number");--> statement-breakpoint
CREATE INDEX "idx_units_owner" ON "units" USING btree ("current_owner_id");--> statement-breakpoint
CREATE INDEX "idx_units_tenant_resident" ON "units" USING btree ("current_tenant_id");--> statement-breakpoint
CREATE INDEX "idx_bank_accounts_tenant" ON "bank_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bank_tx_external" ON "bank_transactions" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "idx_bank_tx_tenant_date" ON "bank_transactions" USING btree ("tenant_id","transaction_at");--> statement-breakpoint
CREATE INDEX "idx_bank_tx_match_status" ON "bank_transactions" USING btree ("tenant_id","match_status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_budgets_tenant_year_cat" ON "budgets" USING btree ("tenant_id","year","category_id");--> statement-breakpoint
CREATE INDEX "idx_debt_changes_debt" ON "audit_debt_changes" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX "idx_debt_changes_tenant_created" ON "audit_debt_changes" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_debts_tenant_unit" ON "debts" USING btree ("tenant_id","unit_id");--> statement-breakpoint
CREATE INDEX "idx_debts_status_due" ON "debts" USING btree ("tenant_id","status","due_date");--> statement-breakpoint
CREATE INDEX "idx_debts_debtor" ON "debts" USING btree ("debtor_user_id");--> statement-breakpoint
CREATE INDEX "idx_debts_period" ON "debts" USING btree ("tenant_id","period");--> statement-breakpoint
CREATE INDEX "idx_dues_plans_tenant" ON "dues_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_dues_plans_active" ON "dues_plans" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_dues_runs_plan_period" ON "dues_runs" USING btree ("dues_plan_id","period");--> statement-breakpoint
CREATE INDEX "idx_dues_runs_tenant" ON "dues_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_expense_categories_tenant" ON "expense_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_expense_categories_tenant_name" ON "expense_categories" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "idx_expenses_tenant_date" ON "expenses" USING btree ("tenant_id","expense_date");--> statement-breakpoint
CREATE INDEX "idx_expenses_category" ON "expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_expenses_period" ON "expenses" USING btree ("tenant_id","period");--> statement-breakpoint
CREATE INDEX "idx_alloc_payment" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "idx_alloc_debt" ON "payment_allocations" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX "idx_payments_tenant_paid" ON "payments" USING btree ("tenant_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_payments_processor_ref" ON "payments" USING btree ("processor","processor_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_payments_idempotency" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_payments_unit" ON "payments" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_payments_status" ON "payments" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_recon_tenant_open" ON "reconciliation_issues" USING btree ("tenant_id","resolved_at");--> statement-breakpoint
CREATE INDEX "idx_documents_tenant_category" ON "documents" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "idx_documents_expires" ON "documents" USING btree ("tenant_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_maintenance_tenant_due" ON "maintenance_records" USING btree ("tenant_id","next_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_maintenance_templates_code" ON "maintenance_templates" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_meter_readings_meter_period" ON "meter_readings" USING btree ("meter_id","period");--> statement-breakpoint
CREATE INDEX "idx_meter_readings_tenant_period" ON "meter_readings" USING btree ("tenant_id","period");--> statement-breakpoint
CREATE INDEX "idx_meters_tenant_type" ON "meters" USING btree ("tenant_id","type");--> statement-breakpoint
CREATE INDEX "idx_meters_unit" ON "meters" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_request_comments_request" ON "request_comments" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_requests_tenant_code" ON "requests" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_requests_tenant_status" ON "requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_requests_sla" ON "requests" USING btree ("tenant_id","sla_due_at");--> statement-breakpoint
CREATE INDEX "idx_requests_unit" ON "requests" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_reservations_resource_time" ON "reservations" USING btree ("resource_id","start_at","end_at");--> statement-breakpoint
CREATE INDEX "idx_reservations_tenant_status" ON "reservations" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_reservations_user" ON "reservations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_staff_tenant" ON "staff" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_attendance_staff_date" ON "staff_attendance" USING btree ("staff_id","check_in_at");--> statement-breakpoint
CREATE INDEX "idx_staff_leaves_staff" ON "staff_leaves" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_vendors_tenant_category" ON "vendors" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ann_reads_unique" ON "announcement_reads" USING btree ("announcement_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_announcements_tenant_published" ON "announcements" USING btree ("tenant_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_conversation_phone" ON "conversation_states" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_decisions_meeting_no" ON "meeting_decisions" USING btree ("meeting_id","decision_no");--> statement-breakpoint
CREATE INDEX "idx_meetings_tenant_date" ON "meetings" USING btree ("tenant_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_messages_tenant_created" ON "messages" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_thread" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_messages_external" ON "messages" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_tenant_created" ON "notifications" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_status_sched" ON "notifications" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_nps_tenant_period" ON "nps_responses" USING btree ("tenant_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_nps_user_period" ON "nps_responses" USING btree ("user_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_poll_votes_unique_unit" ON "poll_votes" USING btree ("poll_id","unit_id");--> statement-breakpoint
CREATE INDEX "idx_poll_votes_poll" ON "poll_votes" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "idx_polls_tenant_closes" ON "polls" USING btree ("tenant_id","closes_at");--> statement-breakpoint
CREATE INDEX "idx_audit_tenant_created" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_resource" ON "audit_logs" USING btree ("resource","resource_id");--> statement-breakpoint
CREATE INDEX "idx_audit_user" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_dal_subject" ON "data_access_logs" USING btree ("subject_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_dal_tenant" ON "data_access_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_breach_tenant" ON "data_breaches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_debt_cert_tenant_unit" ON "debt_certificates" USING btree ("tenant_id","unit_id");--> statement-breakpoint
CREATE INDEX "idx_debt_cert_serial" ON "debt_certificates" USING btree ("serial_no");--> statement-breakpoint
CREATE INDEX "idx_kvkk_tenant_status" ON "kvkk_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_kvkk_due" ON "kvkk_requests" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "idx_lawyers_tenant" ON "lawyers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_legal_events_case" ON "legal_case_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_legal_tenant_stage" ON "legal_cases" USING btree ("tenant_id","stage");--> statement-breakpoint
CREATE INDEX "idx_legal_unit" ON "legal_cases" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_campaigns_code" ON "campaigns" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_campaigns_slug" ON "campaigns" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_campaigns_status_dates" ON "campaigns" USING btree ("status","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_flags_key" ON "feature_flags" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_integrations_tenant_provider" ON "integrations" USING btree ("tenant_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invoices_no" ON "invoices" USING btree ("invoice_no");--> statement-breakpoint
CREATE INDEX "idx_invoices_tenant" ON "invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_migration_tenant" ON "migration_jobs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plans_code" ON "plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_redemptions_tenant" ON "promo_code_redemptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_redemptions_code_tenant" ON "promo_code_redemptions" USING btree ("promo_code_id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_promo_codes_code" ON "promo_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_referrals_code" ON "referrals" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_referrals_referrer" ON "referrals" USING btree ("referrer_tenant_id");--> statement-breakpoint
CREATE INDEX "idx_subs_tenant" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_subs_status_period" ON "subscriptions" USING btree ("status","current_period_end");