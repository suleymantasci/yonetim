-- =============================================================================
-- 0014 — User PII encryption (M-19, M-20)
-- Telefon, acil durum telefonu ve TOTP secret artık AES-256-GCM ile şifreli
-- (FIELD_ENCRYPTION_KEY, tenant scope). Eski plaintext `twoFactorSecret`
-- kaldırıldı; phone/emergency_contact_phone sütunları provider eşleme için
-- korunuyor.
-- =============================================================================

-- M-20: TOTP secret encrypted storage
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  two_factor_secret_encrypted text;

-- M-19: Phone encrypted + blind index
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_index varchar(64);

-- M-19: Emergency contact phone encrypted + blind index
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  emergency_contact_phone_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  emergency_contact_phone_index varchar(64);

-- Eski plaintext TOTP sütunu kaldırıldı. Migration sonrası tüm TOTP
-- secret'ler yeni sütuna taşınmış olmalı; taşınmamışsa kullanıcı TOTP'yi
-- yeniden kurmalı (MFA sıfırlama akışı).
ALTER TABLE users DROP COLUMN IF EXISTS two_factor_secret;
