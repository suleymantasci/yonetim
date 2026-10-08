-- =============================================================================
-- 0022 — banka dökümü içe aktarma: hesap başına eşleştirme profili; çıkan
-- hareketin gider olarak kaydı.
-- =============================================================================

ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "import_profile" jsonb;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "matched_expense_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_expense_id_expenses_id_fk" FOREIGN KEY ("matched_expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;
