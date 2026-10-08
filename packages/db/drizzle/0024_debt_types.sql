-- =============================================================================
-- 0024 — borç türü tanımları (kullanıcı tanımlı borçlandırma seçenekleri):
-- borçlu kuralı (oturan/malik), tür başına gecikme türü ve oranı, muhasebe
-- kodu. Daire istisnası: aidatı maliğe yaz. tenant_id taşıdığı için RLS event
-- trigger ile otomatik bağlanır.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "debt_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"base_kind" "debt_kind" DEFAULT 'extra' NOT NULL,
	"debtor" varchar(10) DEFAULT 'occupant' NOT NULL,
	"late_fee_mode" varchar(10) DEFAULT 'monthly' NOT NULL,
	"late_fee_monthly_pct" numeric(5, 2),
	"account_code" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "debt_types_debtor_check" CHECK ("debtor" IN ('occupant', 'owner')),
	CONSTRAINT "debt_types_late_fee_mode_check" CHECK ("late_fee_mode" IN ('none', 'monthly', 'daily')),
	CONSTRAINT "debt_types_late_fee_pct_check" CHECK ("late_fee_monthly_pct" IS NULL OR ("late_fee_monthly_pct" >= 0 AND "late_fee_monthly_pct" <= 5))
);--> statement-breakpoint
ALTER TABLE "debt_types" ADD CONSTRAINT "debt_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_debt_types_tenant" ON "debt_types" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_debt_types_name" ON "debt_types" USING btree ("tenant_id","name") WHERE "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "debt_type_id" uuid;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_debt_type_id_debt_types_id_fk" FOREIGN KEY ("debt_type_id") REFERENCES "public"."debt_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_debts_type" ON "debts" USING btree ("debt_type_id");--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "owner_pays_dues" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Varsayılan türler mevcut sitelere; yeni siteler ilk kullanımda alır
-- (`ensureDefaultDebtTypes`). Liste packages/db/src/debt-types.ts ile aynı.
INSERT INTO "debt_types" ("tenant_id", "name", "base_kind", "debtor", "late_fee_mode", "sort_order")
SELECT t.id, v.name, v.kind::debt_kind, v.debtor, v.mode, v.ord
FROM "tenants" t
CROSS JOIN (VALUES
	('Aidat', 'dues', 'occupant', 'monthly', 1),
	('Yakıt', 'utility', 'occupant', 'monthly', 2),
	('Demirbaş', 'extra', 'owner', 'monthly', 3),
	('Ek gider', 'extra', 'occupant', 'monthly', 4),
	('Kira', 'rent', 'occupant', 'monthly', 5),
	('Depozito', 'deposit', 'occupant', 'none', 6),
	('İdari ceza', 'admin_fine', 'owner', 'none', 7)
) AS v(name, kind, debtor, mode, ord)
WHERE t.deleted_at IS NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Eski borçlar: türü belli olanlar varsayılan türe bağlanır (ek gider
-- belirsiz — demirbaş mı ek gider mi bilinmiyor, boş kalır).
UPDATE "debts" d SET "debt_type_id" = dt.id
FROM "debt_types" dt
WHERE dt.tenant_id = d.tenant_id AND dt.deleted_at IS NULL AND d.debt_type_id IS NULL
	AND ((d.kind = 'dues' AND dt.name = 'Aidat') OR (d.kind = 'utility' AND dt.name = 'Yakıt')
		OR (d.kind = 'rent' AND dt.name = 'Kira') OR (d.kind = 'deposit' AND dt.name = 'Depozito')
		OR (d.kind = 'admin_fine' AND dt.name = 'İdari ceza'));
