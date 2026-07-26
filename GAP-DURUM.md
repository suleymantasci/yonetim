# GAP-DURUM.md — Uygulama Durumu ve Alınan Kararlar

> Bu dosya [`GAP-ANALYSIS.md`](./GAP-ANALYSIS.md) maddelerinin **hangilerinin
> uygulandığını**, hangi mimari kararların alındığını ve GAP dokümanındaki
> hatalı/eksik varsayımları kaydeder. GAP-ANALYSIS.md ister dokümanı olarak
> olduğu gibi bırakıldı.

**Doğrulama durumu:** `pnpm exec tsc --noEmit -p tsconfig.check.json` temiz ·
`pnpm test` 263/263 geçiyor (öncesi 228) · `apps/app` ve `apps/web` production
build başarılı.

---

## 1. Tamamlanan maddeler

### Altyapı

| GAP | Ne yapıldı | Dosyalar |
| --- | --- | --- |
| Sprint 1 · UI kit v2 | Modal/Drawer/Sheet (odak tuzağı + ESC + backdrop), Toast (yığın + geri al + duraklatma), Combobox (TR duyarlı arama, listbox ARIA), MoneyInput (POS mantığı, kuruş), PhoneInput (uluslararası), TcknInput/IbanInput (algoritmik doğrulama + maske), DateInput/PeriodInput, Switch/RadioGroup/CheckboxGroup, FileInput (drag-drop), RangeInput, Chip, Skeleton/Spinner, Pagination/Breadcrumb/Tabs/SortableTh, Timeline, StageTracker, BulkActionBar, DataCard, ErrorState | `packages/ui/src/components/{overlay,toast,fields,navigation,list-toolbar,timeline,skeleton,error-state,chart}.tsx` |
| TD-01 · Form deseni | `runAction` sarmalayıcısı (yetki → Zod → iş → denetim → durum zarfı), yeniden kullanılabilir alan şemaları, `ActionForm`/`FormField`/`SubmitButton` | `apps/app/src/lib/form.ts`, `apps/app/src/components/form/action-form.tsx` |
| 4.4.1–4.4.3 · Kabuk | Tek bileşen iki görünüm: masaüstünde kalıcı sidebar, mobilde soldan çekmece (ESC/route/backdrop ile kapanır, gövde kaydırması kilitli). Aktif link vurgusu (sol kenar çubuğu), collapsible grup, sayı rozetleri, pinlenebilir öğeler, ⌘K/`/` komut paleti, bildirim merkezi, tenant durumu rozeti | `apps/app/src/components/shell/*`, `apps/app/src/components/app-shell.tsx` |
| 4.6 · Geri bildirim | ToastProvider panel kabuğunda, `error.tsx` (panel) + `global-error.tsx` (kök) + `not-found.tsx` + `loading.tsx` iskeleti | `apps/app/src/app/panel/{error,loading,not-found}.tsx`, `apps/app/src/app/global-error.tsx` |
| 4.7.1–4.7.2 · Erişilebilirlik | Yazı ölçeği (S/M/L/XL), yüksek karşıtlık, hareket azaltma — çerezde saklanır, paint öncesi betikle uygulanır. İçeriğe atla bağlantısı, `forced-colors` desteği | `packages/ui/src/theme/a11y-preferences.tsx`, `packages/ui/src/styles/tokens.css` |
| 4.3.1 · Liste deseni | Durum URL'de: arama (350 ms debounce), filtre çipleri, sıralanabilir sütun, sayfalama, çöp kutusu görünümü, toplu seçim + sticky aksiyon çubuğu, mobil kart görünümü | `apps/app/src/lib/list-params.ts`, `apps/app/src/components/list/*` |

### Modüller

| GAP | Ne yapıldı |
| --- | --- |
| **4.1.1 Birim CRUD** | Liste (arama/filtre/sıralama/sayfalama/toplu seçim/çöp kutusu), `/yeni`, `/[id]` 6 sekmeli detay (özet · sakinler · borçlar · ödemeler · sayaçlar · belgeler), `/[id]/duzenle`, `/toplu` canlı önizlemeli üretim sihirbazı, `/bloklar` drawer içi blok CRUD, soft-delete + geri yükleme, toplu %10 zam / muafiyet |
| **4.1.2 Sakin CRUD** | Liste ("tek cari": bir kişi tek satır, birim rozetleriyle), `/yeni` (KVKK onayı zorunlu + ilk ilişki aynı formda), `/[id]` 5 sekmeli detay, `/[id]/duzenle`, ilişki ekleme/kapatma drawer'ı, TCKN şifreleme + maskeli gösterim, WhatsApp opt-in toplu değişimi + rıza kaydı |
| **4.1.3 Borçlandırma** | Tek borç (malik/kiracı/yarı-yarıya/hisseye göre paylaşım + taksitlendirme), toplu sihirbaz (formüle göre dağıtım, **önizleme zorunlu**), borç detayında **audit timeline**, gerekçeli düzeltme, tahsilat + mahsup, toplu iptal, gecikme muafiyeti toplu değişimi, aidat planı CRUD |
| **4.1.4 Gider** | Hiyerarşik kategori CRUD (iki seviye, ikon/renk/KDV/formül), gider ekle/düzenle/detay, onay-red-ödendi akışı, **gider → daire dağıtımı** (önizlemeli, tek kez, geri alınamaz), kategori kırılımı grafiği |
| **4.3.4 Dashboard** | SVG grafikler: tahakkuk/tahsilat/gider sütun, tahsilat oranı alan, gecikme yaşı yatay sütun, nakit akışı tahmini (kesikli forecast bölgesi), tahsilat durumu halka. Yetkiye göre hızlı işlem butonları |
| **4.8.3 API v1** | `/api/v1/{units,units/[id],debts,expenses,residents}` + OpenAPI 3.1 (`/api/v1`). API anahtarı (hash'li, scope'lu, kendi hız sınırı) veya oturum çerezi ile kimlik; tek hata zarfı `{error:{code,message,details}}` |
| **5.2 Audit Timeline** (VURUCU) | Borç detayında görsel kronoloji: eski tutar → yeni tutar, değiştiren, tarih, **gerekçe**. Artışlar uyarı tonunda. Kayıtlar append-only tablodan; arayüz hiçbirini gizleyemez |

### Veri modeli

| GAP | Karar |
| --- | --- |
| 4.2.1 | `expense_categories`: `depth`, `icon`, `default_vat_rate`, `is_active`, `metadata` eklendi. Hiyerarşi **iki seviyeyle sınırlı** — daha derini "dağıtım formülü hangi seviyeden geliyor?" sorusunu belirsizleştiriyor |
| 4.2.3 | `land_share` ondalık **kanonik** kaldı; `land_share_numerator`/`denominator` girdi ve gösterim için eklendi. Kesir verilirse ondalık ondan türetilir (tapu otoritedir) |
| 4.2.4 | `debt_transfer_policy` için **motor yazıldı**: kiracı çıkışında `owner` → borçlar aktif malike geçer, `next_tenant` → devir işaretlenir, `keep` → değişmez. Karar denetim kütüğüne yazılır, gerekçe alanı var |
| 4.2.5 | Üç düzeyde muafiyet: `units.late_fee_exempt`, `debts.late_fee_exempt`, plan oranı. Herhangi biri muaf diyorsa faiz işlemez (fail-safe). Taksitlendirmede otomatik kapanır |
| 4.2.8 | `payments.debtor_user_id` eklendi. Ödeyen ≠ borçlu ise sakin detayında "başkası adına" rozetiyle görünür |
| 4.2.9 | `user_addresses` tablosu (fatura/tebligat/KEP ayrımı, PTT kodu, yurt dışı için ülke kodu) |
| 4.2.10 | `message_templates` tablosu **oluşturuldu** — kanal başına ayrı gövde (WhatsApp/SMS/e-posta/uygulama içi), Meta onay durumu, tipli değişken tanımı |
| 4.1.3 · Q4 | `dues_plans.late_fee_daily_mode` eklendi |
| 4.8.3 · TD-03 | `api_keys` tablosu (hash'li anahtar, prefix, scope listesi, anahtar başına hız sınırı, kullanım sayacı) |

Migration: `packages/db/drizzle/0001_gap_schema_additions.sql`.
RLS: `message_templates` için platform-geneli okuma politikası, `user_addresses`
için fail-closed politika `packages/db/sql/rls.sql` içinde tanımlandı.

---

## 2. Alınan mimari kararlar (GAP bunları bize bırakmıştı)

**1. react-hook-form kullanılmadı.** React 19 `useActionState` + sunucuda Zod.
Gerekçe: RHF eklemek aynı doğrulama kurallarını istemcide ikinci kez yazmak,
~14 kB bundle ve JS kapalıyken çalışmayan form demekti. Anlık ipuçları
`packages/ui` alanlarının içinde (TCKN/IBAN/telefon), **bağlayıcı karar
sunucuda**. Tek doğruluk kaynağı Zod şeması.

**2. Grafik kütüphanesi kullanılmadı.** Recharts ~100 kB gzip getiriyor;
ihtiyacımız olan dört form (çizgi, sütun, alan, halka) düz SVG ile yazıldı.
Sonuç: sayfa başına toplam ~158 kB First Load JS.

**3. Radix kullanılmadı.** Overlay ailesi (odak tuzağı, ESC, backdrop, ARIA)
elle yazıldı — ~250 satır ve tek davranış kümesi.

**4. Grafik paleti değiştirildi (doğrulanmış).** Mevcut `--t-chart-*` paleti
renk körlüğü ayrımı testinden **düşüyordu** (deutan ΔE 4.9; kabul eşiği 8) ve
marka lacivertinin açıklığı seri bandı dışındaydı. Doğrulanmış 6 tonluk palet
konuldu; her iki temada tüm eşikler geçiyor. Açık temada 3 seri rengi 3:1
kontrastın altında kaldığı için grafikler **her zaman lejant + tablo görünümü**
sunuyor (`ChartFrame` bunu zorunlu tutuyor). Marka rengi seri rengi olarak
kullanılmıyor; kimliği butonlar ve başlıklar taşıyor.

**5. Server Action UI için, REST dış dünya için.** Panel ekranları Server
Action kullanıyor (tek round-trip, tip güvenli); `/api/v1` yalnız muhasebe
yazılımı / yönetim şirketi paneli / mobil (Faz 17) için. REST uçları aynı sorgu
katmanını çağırıyor, kendi iş mantığı yok.

**6. Liste durumu URL'de, istemci state'inde değil.** Filtreli görünüm
paylaşılabilir, geri tuşu çalışıyor, sunucu tarafında sayfalanıyor (200 daire
tarayıcıya gitmiyor).

**7. Telefon şifrelenmedi (bilinçli).** Telefon aynı zamanda giriş kimliği
(OTP), üzerinde tekillik kısıtı var ve gelen WhatsApp/SMS webhook'u numarayı
ters aramayla kullanıcıya bağlıyor. Şifreleme bu üçünü kırıyordu; deterministik
şifreleme ise şifrelemenin faydasını sıfırlıyordu. Azaltıcı önlemler: ekranda
maskeleme, `data_access_logs` kaydı, RLS. **TCKN ve IBAN şifreli** (AES-256-GCM
+ blind index).

**8. Yıkıcı işlemlerde önizleme zorunlu.** Toplu borçlandırma ve gider dağıtımı
"Kaydet" düğmesi önizleme alınmadan pasif. Gerekçe: 120 daireye yanlış formülle
borç yazmanın telafisi tek tek iptal etmek. Önizleme **sunucudaki aynı**
dağıtım fonksiyonunu çağırıyor — ekranda görülen tutar kaydedilecek tutar.

**9. Gerekçesiz düzeltme yolu yok.** Borç tutarı/vadesi değiştirmek en az 10
karakterlik gerekçe istiyor; gerekçe `app.change_reason` oturum değişkenine
yazılıyor ve DB trigger'ı timeline'a taşıyor. Toplu borç iptali de gerekçe
istiyor.

**10. KDV girilmiyor, hesaplanıyor.** Gider formu KDV dahil toplamı alıyor,
oranı uygulayıp KDV'yi ayırıyor. İki sayı sormak her zaman uyuşmazlık
üretiyordu.

**11. Sakin API'sinde yazma ucu yok.** Sakin kaydı KVKK aydınlatma onayı
gerektiriyor (md.10) ve o onayın kime/ne zaman/hangi metin sürümüyle verildiği
kayda geçmeli. Bir API anahtarının "onay alındı" demesi bu yükümlülüğü
karşılamıyor. Okuma ucunda telefon maskeli, TCKN hiç dönmüyor.

**12. Kalıcı silme arayüzde hiç yok.** Her silme soft-delete; API `DELETE` de
soft-delete yapıyor. KVKK saklama süresi imhası ayrı bir cron işi.

**13. Nakit akışı tahmini deterministik.** Gelecek 6 ay, açık borç vadelerine
son 6 ayın **gerçekleşmiş** tahsilat oranı uygulanarak hesaplanıyor; giderler
6 ay ortalaması. Model/AI yok (SPEC 9.3) — sayının nereden geldiği grafiğin
altında yazılı.

**14. `withBypassRls` her çağrıda gerekçe etiketli ve kapsamı daraltılmış**
(TD-02 / GAP 4.2.7). Önceki `residents/page.tsx` filtresiz `users` sorgusu
yapıyordu; artık önce tenant içinden kimlik listesi çıkarılıyor, sonra yalnız o
kimlikler için bypass yapılıyor. KVKK erişim kaydı **ekranda görünen** kişi
kümesiyle birebir örtüşüyor (önceden ilk 50 kişi körü körüne loglanıyordu).

---

## 3. GAP-ANALYSIS.md'de düzeltilen varsayımlar

| GAP maddesi | İddia | Gerçek |
| --- | --- | --- |
| 4.2.10 | "`templates` tablosu WhatsApp/Mail için **var**" | Tablo yoktu; yalnız `packages/notifications` içinde kanal yönlendirme mantığı vardı. `message_templates` sıfırdan oluşturuldu |
| 4.1.6 | Duyuru için "zamanlama, hedef kitle, kanal seçimi **yok**" | Şema tarafında `scheduled_at`, `audience`, `audience_filter`, `channels` **vardı**; eksik olan yalnızca arayüzdü |
| 4.2.8 | "`payments.debtorUserId` yok; sadece `payerUserId` var" | Doğru — ama `debts.debtorUserId` zaten vardı; eklenen `payments` tarafı |
| 4.7.2 | "ARIA labels (radix default — mevcut)" | Radix bağımlılık listesinde yoktu; ARIA elle yazıldı |
| 4.1.4 | "`expenseCategories` … **paylaşım formülü alanı yok**" | `distribution` alanı vardı; eksik olan `icon`, `is_active`, `default_vat_rate`, `depth` |
| Q4 | "Gecikme tazminatı günlük mü aylık mı?" | **Aylık varsayılan** seçildi (KMK md.20 dilini izliyor); günlük mod bayrakla açılıyor ve aylık oranı 30'a bölüyor — üst sınır aşılmıyor |
| Q1 | "Tenant başına birden fazla yönetici olabilir mi?" | `memberships` tablosu çoklu üyeliği zaten destekliyor; kod bu varsayımla yazıldı |
| Kabul kriteri 9.1 | "Mevcut **167** birim testi" | Başlangıçta 228 test vardı; şimdi 263 |

---

## 4. Henüz yapılmayanlar

GAP-ANALYSIS.md'nin Sprint 2–4 kapsamındaki şu maddeler **bu turda ele
alınmadı**; altyapı (UI kit, form deseni, liste deseni, grafik bileşenleri,
API katmanı) hazır olduğu için her biri artık tek modül işi:

**Sprint 2 kalanı**
- 5.3 "Borcu Yoktur" PDF üretimi + KEP entegrasyonu (`certificate-form.tsx` var, PDF motoru yok)
- 5.4 Bütçe simülatörü arayüzü (`packages/dues/simulator.ts` var, form + forecast grafiği yok — grafik bileşenleri artık hazır)
- 5.5 / 4.1.10 Bakım planı oluşturma + T-30/T-15/T-7/T-0/T+3 hatırlatma
- 5.1 WhatsApp yönetim paneli (şablon tablosu artık var; Meta onay akışı ve conversation log arayüzü yok)
- 4.1.6 Duyuru zamanlama + hedef kitle arayüzü (şema hazır)

**Sprint 3 kalanı**
- 4.3.4 Widget mimarisi / sürükle-bırak dashboard düzeni (grafikler sabit düzende)
- 4.6.5 Bildirim merkezi **arayüzü hazır**, bildirim **üretimi** (hangi olay hangi bildirimi doğurur) bağlanmadı
- 5.8 Site landing page builder (fotoğraf slider, NPS widget, QR)
- 4.1.14 Denetim kütüğü diff görselleştirme (`Timeline` bileşeni hazır, ekran yok)
- 6.13 Raporlar modülü

**Sprint 4 kalanı**
- 4.1.16 Sakin portalı (`/sakin` içerik sayfaları) — en büyük kalan parça
- 4.1.9 Talep yönetimi (thread, atama, SLA paneli)
- 4.1.8 Rezervasyon takvim görünümü
- 4.1.11 Personel bordrosu
- 4.1.5 Sayaç okuma girişi + tüketim trendi
- 4.1.7 Anket/toplantı/hukuk tam akışları
- 4.1.13 KVKK talep gelen kutusu + 72 saat geri sayım
- 4.1.15 Banka hareket eşleştirme arayüzü
- 4.1.17 Göç sihirbazı (Excel import + alan eşleme)
- 4.5 Landing page motion/görseller (`apps/web`)
- 4.8.1–4.8.2 Sentry, Web Vitals, PostHog, Lighthouse CI, bundle analyzer

**Ayrıca çözülmesi gereken, GAP'ta geçmeyen bir eksik:** `apps/app` ve
`apps/web` için **ESLint yapılandırması yok** — `pnpm lint` interaktif kurulum
istiyor ve hata kodu döndürüyor. CI'da lint adımı olması bekleniyorsa
`eslint.config.mjs` yazılmalı. (Bu turda kapsam dışı bırakıldı; kod
`tsc --noEmit` ile denetlendi.)

**Dosya yükleme:** `FileInput` bileşeni ve gider formundaki yükleme alanı hazır
ama depolama (R2) bağlanmadı; şimdilik alanlar bağlantı (URL) kabul ediyor.
Depolama açıldığında aynı bileşen doğrudan kullanılabilir.
