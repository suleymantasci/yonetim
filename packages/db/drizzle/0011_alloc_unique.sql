-- =============================================================================
-- 0011 — payment_allocations(payment_id, debt_id) unique index
-- H-12 (SECURITY-REVIEW.md): Aynı ödeme aynı borca iki kez mahsup
-- edilemesin. İyzico webhook'unun SERIALIZABLE olmayan transaction'ında
-- ikinci insert DB tarafından reddedilir; controller `ON CONFLICT DO NOTHING`
-- ile idempotent.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_alloc_payment_debt
  ON payment_allocations (payment_id, debt_id);
