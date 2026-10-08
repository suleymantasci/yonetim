-- =============================================================================
-- 0023 — banka hareketi: gönderenin yazdığı açıklama ayrı alan; eşleştirme
-- önerisinin gerekçeleri (kuyrukta "neden bu daire" gösterilir).
-- =============================================================================

ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "payer_note" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "match_reasons" jsonb;
