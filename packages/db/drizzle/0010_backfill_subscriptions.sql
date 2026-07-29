-- Aboneliksiz sitelere abonelik satırı üretir (tek seferlik veri dolgusu).
--
-- NEDEN GEREKLİ: `subscriptions` tablosu baştan beri şemadaydı ama ona yazan
-- hiçbir kod yoktu; abonelik satırını kurulum akışına ekleyen değişiklik
-- (`signup.service.ts` → `openTrialSubscription`) yalnız **bundan sonra**
-- açılan siteleri kapsıyor. Dolgu yapılmazsa daha önce açılmış siteler süper
-- admin panelinde "abonelik yok" görünür, MRR/ARR onları saymaz ve faturalama
-- job'ları onları hiç tanımaz — yani ödemesi gelmeyen eski bir müşteri
-- sonsuza kadar sessizce ücretsiz kalırdı.
--
-- PLAN DAİRE SAYISINDAN TÜRÜYOR: `plans` tablosundaki kademe aralıkları
-- (`min_units`/`max_units`) uygulama tarafındaki `planForUnitCount` ile aynı
-- veriyi taşıyor, bu yüzden eşleme burada da yapılabiliyor. Kademe altında
-- kalan küçük apartmanlar ilk kademeye giriyor (uygulama tarafındaki kuralın
-- aynısı).
--
-- FİYAT LİSTE FİYATI: eski sitelere geçmişe dönük kampanya indirimi
-- uydurulmuyor. `discount_kurus` 0 ve `applied_campaign_id` boş — indirim
-- kaydı olmayan bir indirim yazmak, gelir raporunu açıklanamaz hâle
-- getirirdi.
--
-- DURUM SİTEDEN TÜRÜYOR: denemedeki site `trialing`, aktif site `active`,
-- askıdaki `suspended`. Hepsini `active` yapmak, ödemesi hiç alınmamış
-- hesapları MRR'a eklemek olurdu.
INSERT INTO subscriptions (
  tenant_id, plan_id, status, billing_period, unit_count_snapshot,
  price_kurus, list_price_kurus, discount_kurus,
  trial_ends_at, current_period_start, current_period_end
)
SELECT
  t.id,
  p.id,
  (CASE t.status
     WHEN 'trial'     THEN 'trialing'
     WHEN 'active'    THEN 'active'
     WHEN 'past_due'  THEN 'past_due'
     WHEN 'suspended' THEN 'suspended'
     WHEN 'archived'  THEN 'archived'
     WHEN 'cancelled' THEN 'cancelled'
     ELSE 'trialing'
   END)::subscription_status,
  'yearly',
  t.unit_count,
  p.yearly_price_kurus,
  p.yearly_price_kurus,
  0,
  t.trial_ends_at,
  t.current_period_start,
  t.current_period_end
FROM tenants t
CROSS JOIN LATERAL (
  -- Daire sayısına uyan kademe; hiçbiri uymuyorsa (aralık altı) en küçük
  -- kademe. `ORDER BY tier` + `LIMIT 1` iki koşulun da tek sorguda
  -- çözülmesini sağlıyor.
  SELECT pl.id, pl.yearly_price_kurus
  FROM plans pl
  WHERE pl.is_active
    AND pl.is_custom = false
    AND pl.tier > 0
  ORDER BY
    (t.unit_count >= pl.min_units
       AND (pl.max_units IS NULL OR t.unit_count <= pl.max_units)) DESC,
    pl.tier
  LIMIT 1
) AS p
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id);
