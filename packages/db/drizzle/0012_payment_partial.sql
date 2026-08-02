-- =============================================================================
-- 0012 — payment_status enum'a 'partial' değerini ekle (M-30)
-- İyzico webhook'ta amount drift durumunda kullanılır; tahsilat tamamlanmadı
-- ama bir kısmı alındı. Reconciliation gerekir.
-- =============================================================================

ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'partial';
