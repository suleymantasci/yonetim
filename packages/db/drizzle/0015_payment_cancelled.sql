-- =============================================================================
-- 0015 — payment_status enum'a 'cancelled' değerini ekle
-- Elle girilen hatalı tahsilatın iptali: kayıt silinmez, durumu 'cancelled'
-- olur ve mahsupları geri alınır (iz `payments.metadata.voided` + denetim
-- kütüğü). 'refunded' kart iadesi içindir; para dışarı çıkmadığı için ayrı.
-- =============================================================================

ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'cancelled';
