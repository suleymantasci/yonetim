-- Ödemenin girdiği banka hesabı — PROJE-DURUMU §5.2, sıra 6.
--
-- SORUN: `payments.method` "havale" diyordu ama **hangi hesaba** yattığını
-- söylemiyordu. Bir site birden fazla hesap tutuyor (aidat, demirbaş, proje
-- havuzu) ve mutabakat "bu ödeme hangi hesabın ekstresinde görünmeli"
-- sorusunu cevaplayamıyordu. Eşleştirme yalnız tutar ve tarihle yapıldığı
-- için iki hesapta aynı gün aynı tutar varsa yanlış eşleşme mümkündü.
--
-- NULLABLE, ÇÜNKÜ NAKİT TAHSİLATIN BANKA HESABI YOK. Zorunlu kılmak,
-- kasaya giren para için uydurma bir hesap seçtirmek olurdu ve o kayıt
-- ekstrede hiç görünmeyeceği için mutabakatı kalıcı olarak bozardı.
--
-- ON DELETE SET NULL: kapanan bir hesabın kaydı silinse bile ödeme kaydı
-- durmalı. Ödeme geçmişi, hesap kaydından daha uzun ömürlü bir gerçek.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "bank_account_id" uuid;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_bank_account_id_fkey'
  ) THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_bank_account_id_fkey"
      FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint

-- "Bu hesaba bu dönemde ne girdi" sorgusu mutabakat ekranının ana sorgusu.
CREATE INDEX IF NOT EXISTS "idx_payments_bank_account"
  ON "payments" ("bank_account_id", "paid_at");
