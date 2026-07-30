# PROJE-DURUMU.md — Tek Kaynak: Ne Yapıldı, Ne Değişti, Sırada Ne Var

> **Bu dosya neden var:** Proje büyüdükçe `SPEC.md`, `GAP-ANALYSIS.md`,
> `GAP-DURUM.md`, `MIMARI-PLAN.md`, `UI-MODERNIZASYON-PLANI.md` ve
> `RAKIP-ANALIZI-VE-EKSIK-MODULLER-2026-07-28.md` olmak üzere 6 ayrı doküman
> birikti. Her biri kendi yazıldığı ana ait bir "durum" fotoğrafı ve bazı
> kararlar birden fazla dosyada **çelişecek** şekilde güncellendi (özellikle
> grafik motoru, Radix kullanımı, form kütüphanesi). Bu dosya onların **yerine
> geçmiyor** (tarihsel gerekçeler hâlâ eskilerde duruyor) ama **güncel durumun
> tek doğru özeti** budur — yeni bir konuşmaya başlarken önce bu dosya okunmalı.
>
> Eski dosyaların rolü bundan sonra: **SPEC.md** = orijinal ürün şartnamesi
> (değişmedi), **GAP-ANALYSIS.md** = 2026-07-26 tarihli ilk boşluk tespiti
> (tarihsel), **GAP-DURUM.md** = Sprint 1 sonrası ilk uygulama turu (tarihsel),
> **MIMARI-PLAN.md** = backend bölünmesi + tasarım sistemi planı (çoğu
> uygulandı, ayrıntılı gerekçe için hâlâ referans), **UI-MODERNIZASYON-PLANI.md**
> = landing+panel görsel yenileme planı (tamamlandı, uygulama detayları ve
> ölçümler için referans), **RAKIP-ANALIZI...md** = 2026-07-28 canlı rakip
> incelemesi (Dijiyon + Yönetimcell — yeni özellik fikirlerinin kaynağı).

---

## 1. Özet — bugün proje nerede

- **Backend tamamen bölündü:** `apps/api` (NestJS) veritabanının **tek
  sahibi**. `apps/app` (panel) ve `apps/web` (pazarlama) artık `@yonetim/db` /
  `drizzle-orm` import **edemiyor** — hem lint kuralı hem
  `dependency-cruiser` grafiği bunu fiziksel olarak imkânsız kılıyor.
- **`apps/worker`** BullMQ ile ayrı süreç; eski 19 Vercel cron job'ı
  repeatable job'a döndü, olay→bildirim politikası ve uzun-iş (ilerleme +
  iptal) altyapısı kuruldu.
- **UI baştan aşağı yenilendi:** marka paleti değişti, `apps/web` landing'i
  motion (hareket) katmanıyla yeniden yazıldı, `apps/app` panelinde grafikler
  Recharts'a taşındı, dört tekrar eden tablo tek `DataTable` mimarisine
  indirildi, overlay ailesi (modal/drawer/sheet) Radix Dialog'a geçti.
  **Bu, kullanıcının daha önce istediği "UI görünümde özgünlük" talebinin
  karşılığıdır — tamamlandı.**
- **Gözlemlenebilirlik kısmen kuruldu:** Sentry (api+worker+app), istek-izi
  korelasyonu, Web Vitals, bundle bütçesi CI kapısı var; OpenTelemetry/
  PostHog/Lighthouse CI **bilinçli olarak ertelendi** (gerekçe §4).
- **Rakip incelemesi (Dijiyon + Yönetimcell, canlı demo) yeni özellik
  adayları çıkardı** — bunlar henüz **yapılmadı**, §4'te tek listede.
- **✅ 2026-07-29'da kapatılan büyük boşluk: panelin salt-okunur yarısı.**
  10 modülde ekran ve okuma ucu vardı ama **yazma yolu hiç yoktu** — personel,
  talep/arıza, bakım, sayaç, rezervasyon, anket, toplantı, mesaj, banka
  hesabı, ayarlar. Onunun da yazma akışı yazıldı; ayrıca aidat planı ↔ toplu
  borç bağlantısı kuruldu, eksik çekmece rotaları tamamlandı ve entegrasyon
  rozetleri gerçek bağlantı durumuna bağlandı. Tespit, gerekçeler ve alınan
  kararlar §5'te. **Açık kalan:** hukuk ve belge yükleme (ikisi de Track E'deki
  bir ürün kararına bağlı) ve hâlâ boşta duran 9 yazma yetkisi — tek tek
  gerekçeleriyle §5.1'de.
- **✅ 2026-07-29 (ikinci tur): "uygulamaya girilemiyordu" sınıfı kapatıldı.**
  Kod baştan beri yazılıydı, hiçbir yere bağlanmamıştı:
  - **Kayıt yolu yoktu.** `apps/web`'in bütün CTA'ları `/kayit`'e, site
    landing sayfaları `/kayit-talebi`'ne bakıyordu — ikisi de 404. `/kurulum`
    ise sonsuz döngüdeydi: sitesi olmayan kullanıcı 401 alıp `/giris`e, giriş
    yapıp yine 401'e düşüyordu. Üçü de kuruldu (§5.8.4).
  - **Sakin panele giremiyordu.** `/panel` dashboard'u `report:read` istiyor;
    sakin hata sayfası görüyordu. `/panel` rol duyarlı yapıldı ve yedi sakin
    ekranı yazıldı (§5.8.2).
  - **🔒 Güvenlik açığı kapatıldı:** sakinin `message:read` izni vardı ve o
    izin site genelindeki **tüm** yazışmaları açıyordu (§5.8.1).
  - **Çoklu site yönetilemiyordu.** `company_admin`, `tenants.company_id`,
    `ctx.memberships`, `switchTenant()` yazılıydı ama hiçbiri bağlı değildi;
    site değiştirmek için çıkış yapmak gerekiyordu. Portföy ekranı ve site
    değiştirici kuruldu (§5.8.3).
  - API uçlarındaki Türkçe/İngilizce karışıklığı standartlandı (§5.8.5) ve
    komut paleti overlay'i düzeltildi (§5.8.6).
- **✅ 2026-07-29 (üçüncü tur): ekranlar ilk kez gerçek veriyle sürüldü.**
  §5.8'de yazılan sakin portalı tarayıcıda denendiğinde iki şey çıktı:
  - **Sakin `/panel`'e yine giremiyordu** — `/v1/panel/portal/me` 500
    veriyordu. Sebep ham `sql` şablonuna gömülmüş bir `Date` (§5.9.1). Aynı
    fonksiyon sakin duyuru ekranını da besliyordu.
  - **Yönetici gelen mesaja cevap veremiyordu.** `/panel/mesajlar` düz bir
    mesaj kütüğüydü: kimin yazdığı görünmüyor, aynı sakinin her mesajı ayrı
    satır, cevap yolu yok. Konuşma tabanlı gelen kutusuna çevrildi ve yazışma
    ekranı + cevap kutusu eklendi (§5.9.2).
- **Kalan büyük iş (Track E):** teknik altyapı hazır ama her biri bir ürün
  kararı bekliyor — PDF/KEP, bakım hatırlatma, göç sihirbazı, bordro kapsamı,
  landing builder (bkz. §6). Sakin tarafında oylama ve ödeme akışı hâlâ açık
  (§5.8.7).

---

## 2. Tamamlanan büyük işler

### 2.1 Backend bölünmesi (`MIMARI-PLAN.md` Track A) — ✅ TAMAMLANDI

| Aşama | İçerik |
| --- | --- |
| A0 | `apps/api` iskeleti, `packages/contracts` (Zod tek kaynak), `DbService`, ESLint yapılandırması (proje tarihinde ilk kez), advisory-lock'lu migration |
| A1 | Dikey dilim kanıtı: `property/unit` — RLS testcontainers ile doğrulandı |
| A2 | `finance` bağlamı: borç, ödeme, gider, aidat planı |
| A3 | `property/resident` + kimlik; **mobil access/refresh token** akışı (Faz 17 mobil için önceden hazırlandı) |
| A4 | `insight` (dashboard) + `governance/audit` |
| A5 | Kalan 24 sayfa + `/api/v1` dış sözleşmesi birebir taşındı; oturum açma/kapama, WhatsApp/iyzico webhook'ları, cron işleri, denetim kütüğü yazımı da **beklenenden fazla** olarak buraya taşındı (aynı ihlalin — apps/app'ten DB erişimi — farklı görünümleri oldukları için) |

**Sonuç:** `apps/app/package.json`'da `@yonetim/db`/`drizzle-orm` yok; bu artık
sadece kural değil, paket bağımlılığının yokluğuyla **fiziksel olarak** garanti
altında.

### 2.2 Worker ve kuyruk (Track B) — ✅ TAMAMLANDI

- `packages/jobs` → `apps/worker` (BullMQ). 19 cron job repeatable job'a döndü;
  `vercel.json` silindi.
- `NotificationPolicy` — "hangi olay hangi bildirimi doğurur" sorusunun **tek**
  cevabı (`packages/notifications/src/policy.ts`).
- Uzun-iş altyapısı: `job_runs` tablosu, ilerleme + **iptal bayrağı**
  (kuyruktan silme değil — yarım kalan işi tutarsız bırakmamak için).
- 16 iş hâlâ `skipped: no_handler` raporluyor — gövdeleri Track E'de ilgili
  özellikle birlikte gelecek (sessizce "başarılı" sayılmıyorlar).

### 2.3 UI modernizasyonu — ✅ TAMAMLANDI (Faz 0–2), Faz 3 kısmen

Ayrıntı ve ölçümler: `UI-MODERNIZASYON-PLANI.md`. Özet:

| Faz | Durum | Öne çıkanlar |
| --- | --- | --- |
| Faz 0 — ortak temel | ✅ | Marka paleti tazelendi (aday A: mürekkep lacivert + aksiyon mavisi + amber), eksik logo/favicon/OG görselleri üretildi, motion katmanı (`packages/ui/src/motion`, a11y kill-switch'e bağlı), grafik motoru 816 satırlık elle-SVG'den **Recharts**'a taşındı (5 dosyaya bölünerek: palette/frame/primitives/marks/lazy) |
| Faz 1 — `apps/web` landing | ✅ | Mobil menü eklendi, tüm sayfalar (ana sayfa, fiyatlandırma, özellikler, kampanyalar, blog, SSS, geçiş, KVKK) motion + gerçek görsellerle yeniden yazıldı; JS kapalıyken de çalışan fiyat formu korundu |
| Faz 2 — `apps/app` panel | ✅ | Kabuk yenilendi (gerçek `BrandMark`, yoğunluk tercihi, kullanıcı menüsü), 6 yeni grafik panosu, **4 tekrarlı tablo → tek `DataTable` mimarisi** (1131→848 satır), akış-içi çekmece (liste → yeni kayıt → ilişkili kayıt, sayfa değişmeden) |
| Faz 3 — hata/erişilebilirlik/kapılar | ⚙️ kısmen | 10 somut UI hatası düzeltildi (bkz. plan dosyası); **kalan**: `pnpm lint` CI adımı, `jest-axe` smoke testi |

**Sırasında bulunan ~25 kusur** (kontrast hataları, yapışkan başlık kayması,
Reveal animasyonunun içerik gizli bırakması, KVKK metninin yanlış
render edilmesi, vb.) hepsi düzeltildi — tam liste `UI-MODERNIZASYON-PLANI.md`
"Uygulama sırasında bulunan kusurlar" bölümünde.

**Kullanıcı notu için:** "UI görünüm tasarımda özgünlük" isteği bu Faz 0–2
kapsamında karşılandı — marka paleti özgün, landing hareketli/etkileşimli,
panel grafikleri modern, rakiplerin (Dijiyon/Yönetimcell) hâlâ 2015 seviyesi
statik arayüzlerinden görsel olarak ayrışıyoruz (bkz. rakip raporundaki
"görsel eskilik" gözlemi).

### 2.4 Tasarım sistemi kararları (Track C) — ⚙️ KISMEN, bilinçli sınırlı

| Alt madde | Durum |
| --- | --- |
| C0 — shadcn/design token altyapısı | ✅ ama shadcn'in kendisi **kurulmadı** — mevcut semantik token disiplini zaten yeterliydi, shadcn kendi renk sistemini dayatıp tek kaynağı bölerdi |
| C1 — Radix primitifleri | ✅ yalnız **Overlay** ailesi (Modal/Drawer/Sheet) Radix Dialog'a taşındı. Tabs/Select/Tooltip/Dropdown Radix'e taşınmadı — bugün kullanılmıyorlar, kullanılacakları an yazılmaları daha doğru |
| C2 — grafik motoru | ✅ ama plan "ECharts" diyordu, **Recharts** seçildi ve gerekçe blokları güncellendi (bkz. §3) |
| C3 — TanStack Table | ❌ yapılmadı, bilinçli erteleme — sayfa başına ≤50 satır, sanallaştırmanın çözeceği bir sorun yok |
| C4 — react-hook-form | ❌ **bilinçli olarak yapılmadı** — mevcut karar (RHF yok, sunucuda Zod) hâlâ geçerli, ekstra ~14 kB + JS kapalıyken çalışmayan form riski göze alınmadı |

### 2.5 Gözlemlenebilirlik (Track D) — ⚙️ KISMEN

**Yapılanlar:** `dependency-cruiser` mimari kapıları (apps/app→DB erişimi
fiziksel olarak engelleniyor), Sentry (api+worker+app, PII maskeli, TCKN/IBAN
deseni hata mesajından temizleniyor, yalnız 5xx gönderiliyor), istek-izi
korelasyonu (`x-request-id`, app→api→worker), kendi Web Vitals ucumuz (şablon
yola göre — daire kimliği metrik etiketine sızmıyor), bundle analyzer + CI
bütçe kapısı (250 kB eşiği).

**Bilinçli ertelenenler:** OpenTelemetry (toplayıcı altyapısı yok, kazanç
belirsiz), PostHog/Lighthouse CI (dış hesap + operasyon kararı gerektiriyor),
testcontainers RLS testi (mevcut `tests/integration/rls.test.ts` zaten CI'da
gerçek Postgres ile koşuyor, kazanç marjinal).

### 2.6 En son düzeltmeler (2026-07-28, henüz plana yazılmamış)

Git geçmişindeki son 3 commit: dev ortamında `apps/api` ESM çökmesi ve
`auth ↔ db` döngüsü giderildi; UI bileşenlerinde erişilebilirlik/stil
iyileştirmesi; landing sayfası güncellendi.

### 2.7 Rakip bulgularının uygulanması (2026-07-28) — ✅ TAMAMLANDI

§4.1'deki hızlı kazanımlar, §4.2'deki Karar Defteri, §4.3'teki bakiye trendi
ve §6'daki teknik borçlar uygulandı. Migration'lar `0003`–`0006`.

| İş | Ne yapıldı | Not |
| --- | --- | --- |
| Borç kategorileri | `debt_kind` enum'una **Kira / Depozito / İdari Ceza** eklendi | `penalty` (yönetim kararı) ile `admin_fine` (kamu kurumu) bilinçli ayrı; itiraz mercileri farklı. Sırasında `DEBT_KINDS`'in **dört ayrı kopyası** bulundu ve sözleşmeye indirildi; `MANUAL_DEBT_KINDS` / `BULK_DEBT_KINDS` alt kümeleri derleme-zamanı tip iddiasıyla kilitlendi |
| Riskli cari filtresi | `minOutstanding` (kuruş) eşiği; ekranda 500/1.000/2.000/5.000 ₺ hazır seçenek | Hem borç listesi hem daire özeti sekmesinde **aynı** anlamda |
| Kan grubu + acil durum raporu | `users.blood_type` + `/panel/sakinler/acil-durum` | **KVKK md.6 özel nitelikli (sağlık) veri**: açık rıza olmadan yazılmıyor (`acik_riza_saglik`), rıza çekilince alan NULL'lanıyor, her okuma `data_category='saglik_bilgisi'` ile ayrı kütüğe geçiyor. Ayrı ekran/ayrı uç olmasının sebebi bu |
| Kıdem/ihbar tazminatı | `packages/core/src/severance.ts` + 17 birim testi + `POST /v1/panel/staff/severance` + personel ekranı widget'ı | Kanunda sabit olanlar (30 gün/yıl, ihbar kademeleri, damga vergisi ‰7,59, kıdemin gelir vergisi istisnası) kodda; **yılda bir/iki kez değişenler** (kıdem tavanı, gelir vergisi oranı) `siteConfig.payroll`'da tarih damgalı ve ekranda gösteriliyor. Sonuç `isEstimate: true` — bordro değil |
| Demirbaş defteri | `inventory_items` + `/panel/demirbas` | Silme ucu **yok**: elden çıkan kalem `disposed`/`lost` ile düşülüyor. `disposed` ≠ `lost` ayrımı devir tesliminin asıl sorusu |
| **Karar Defteri** | `decision_book_entries` + `/panel/karar-defteri` | Mevcut `meeting_decisions` yerine geçmiyordu: numara toplantı içinde tekildi, toplantısız kararı (md.32/son) taşıyamıyordu ve değiştirilebilirdi. Yeni defter **site geneli sürekli numaralı** ve **ekleme-yalnız** — DB trigger'ı UPDATE/DELETE'i engelliyor, düzeltme yeni kayıt olarak yazılıyor |
| Bakiye trendi | Daire özeti satırlarında son 6 ayın ay sonu bakiyesi (sparkline) | Seri, `debts.created_at` ve `payments.paid_at` ayrı ayrı kesilerek **geçmişten yeniden kuruluyor**; mevcut bakiyeden türetilemez |

**RBAC:** `inventory:read/write` ve `decision:read/write` eklendi.
`decision:read` **sakin rolüne de** verildi — KMK md.32/son kat malikine
kararları görme hakkı tanıyor; bu bir ürün tercihi değil kanuni bir hak.

**§6 teknik borçları kapatıldı:**

- `pnpm lint` adımı `infra/ci/ci.yml`'de **zaten vardı**; asıl eksik dosyanın
  hiç kurulmamış olmasıydı — `.github/workflows/ci.yml` oluşturuldu, yani CI
  bugüne kadar **hiç koşmamış**.
- Ayrıca CI'a **uygulama tip kontrolü** eklendi: `tsconfig.check.json` yalnız
  `packages/*` ve `tests/*` kapsıyordu, `apps/api` hiçbir kapıdan geçmiyordu.
- `jest-axe` yerine `axe-core` doğrudan kullanıldı (proje vitest'te;
  `jest-axe` Jest'in `expect` genişletmesine bağlı). `tests/a11y-smoke.test.tsx`
  ortak bileşenleri denetliyor ve **kendi çalıştığını doğrulayan** bir test
  içeriyor. İlk koşusunda gerçek bir kusur yakaladı: `Tabs`, `linkComponent`
  verilmediğinde Next'e özgü `scroll` prop'unu düz `<a>`'ya sızdırıyordu.

**Kontrast denetimi bilinçli olarak kapsam dışı**: jsdom stil hesaplamıyor ve
CSS token'ları çözülmemiş kalıyor; sahte biçimde "geçirmek" yanlış güven
verirdi. O katman `tests/design-tokens.test.ts` içinde token düzeyinde ölçülüyor.

---

## 3. Değişen / geri alınan kararlar

Kararların **çoğu** `GAP-DURUM.md` §2'de alınmış, sonra `MIMARI-PLAN.md` §3'te
gözden geçirilmiş, bazıları uygulama sırasında **tekrar** değişmiştir. Güncel,
çelişkisiz tablo:

| Konu | İlk karar | Ara karar | **Güncel/nihai durum** |
| --- | --- | --- | --- |
| Grafik motoru | Elle SVG (Recharts ~100 kB'a değmez) | `MIMARI-PLAN.md`: ECharts'a geçilecek (C2) | **Recharts'a geçildi** (ECharts değil) — ECharts'ın canvas tabanlı olması `ChartFrame`'in zorunlu tablo-görünümü ilkesiyle daha az uyumluydu, Recharts SVG tabanlı ve tema token'larını (`var(--color-chart-N)`) doğrudan kabul ediyor |
| Overlay (modal/drawer/sheet) | Elle yazıldı (~250 satır) | Radix'e geçilecek (C1) | **Yalnız Overlay ailesi Radix'e geçti**; Tabs/Select/Tooltip/Dropdown hâlâ elle yazılı çünkü bugün proje içinde hiç kullanılmıyorlar |
| Form kütüphanesi (RHF) | Kullanılmıyor (gerekçe: duplikasyon) | `packages/contracts` ile duplikasyon gerekçesi ortadan kalktı, gündeme alınabilir dendi (C4) | **Hâlâ kullanılmıyor** — gündeme alındı ama karar değişmedi, ürün kararı gerektiriyor |
| Server Action vs REST | "Server Action UI için, REST dış dünya için" | Backend bölünmesiyle bu ayrım anlamsızlaştı | **Tek yol: REST.** Server Action'lar korunuyor ama artık SQL değil, `apps/api`'ye HTTP çağrısı yapıyor |
| Yoğunluk tercihi (compact/comfortable) | Plan: `localStorage` | — | **Çerezde** (`yonetim_a11y` içine 4. alan) — ilk HTML'de doğru yoğunlukla render olması gerekiyordu (CLS önleme); kolon görünürlüğü hâlâ `localStorage`'da |
| Kampanya süre sayacı | Plan: geri sayım gösterilecek | — | **Yapılmadı** — kampanya şablonlarında gerçek `endsAt` değeri yok, uydurma tarih yazmak sosyal-kanıt uydurmakla aynı sorun sayıldı; yerine ödül vurgusu + gerçek koşullar listesi kondu |
| Takvim ısı haritası (tahsilat yoğunluğu) | Plan: günlük ısı haritası | — | **Yapılmadı** — mevcut `dashboardCharts` sözleşmesi günlük çözünürlükte veri taşımıyor; yerine waterfall + bullet panosu kondu (mevcut veriden türetilebildikleri için) |
| Motion kütüphanesinin kapsamı | Plan: hem landing hem panelde | — | **Yalnız `apps/web`'de.** Panelde animasyon motoru yok, yalnız a11y tercihi okunuyor — panelde hareket "anlatı aracı" değil, karşılıksız bundle olurdu |
| RHF'nin panel formlarına etkisi (dolaylı) | — | — | Değişmedi, bkz. yukarı |
| `withBypassRls` kapsamı | Gerekçeli ama geniş | — | Daraltıldı: önce tenant içinden kimlik listesi çıkarılıyor, sonra yalnız o kimlikler için bypass yapılıyor (KVKK log ekranla birebir örtüşüyor) |
| ESLint yapılandırması | GAP-DURUM'da "eksik, kapsam dışı" not edildi | — | **Yapıldı** (Track A0'da, backend göçünün önkoşulu olarak) |

**İptal edilen / ürün kararına takılıp bekleyen** (yapılmayacak değil, **henüz
karar verilmedi**): §6'daki Track E listesi. Bunlarla karıştırılmaması gereken
**yarım kalmış uygulama** işleri §5'te.

---

## 4. Rakip incelemesinden gelen yeni özellik fikirleri (henüz yapılmadı)

Kaynak: `RAKIP-ANALIZI-VE-EKSIK-MODULLER-2026-07-28.md` (Dijiyon + Yönetimcell
canlı demo incelemesi, 2026-07-28). Bu liste GAP-ANALYSIS.md'deki eski
maddelerle **çakışmayan/yeni** olanları önceliklendirir.

### 4.1 Hızlı kazanımlar (düşük efor) — ✅ **TAMAMI YAPILDI** (bkz. §2.7)

- ~~Kan grubu / acil durum kişi alanı + basit rapor~~ ✅
- ~~Kıdem/İhbar tazminatı hesaplayıcı (personel modülüne widget)~~ ✅
- ~~Demirbaş/envanter basit CRUD listesi~~ ✅
- ~~Liste filtrelerine tutar eşikli hazır "riskli cari" filtreleri~~ ✅
- ~~Borç kategorilerine **Kira, Depozito, İdari Ceza** eklenmesi~~ ✅

### 4.2 Orta vadeli (GAP-DURUM zaten planlamıştı, rakip verisi önceliği doğruluyor)

- Banka hareket eşleştirme arayüzü + **Banka Talimatı Oluştur** (toplu ödeme
  talimatı üretimi — Yönetimcell'de var)
- Talep yönetimi (thread + SLA + atama)
- Toplu veri girişi / göç sihirbazı (Dijiyon'un "Toplu Tanımlamalar"ı ile
  doğrudan rakip)
- Anket/toplantı/hukuk tam akışları — ~~+ **Karar Defteri**~~ ✅ **yapıldı**
  (§2.7): site geneli sürekli numaralı, ekleme-yalnız defter. Anket/toplantı/
  hukuk tam akışları hâlâ açık

### 4.3 Yeni, hiçbir GAP dokümanında geçmeyen fikirler

- **Muhasebe raporları modülü** (Yevmiye/Kebir/Mizan/BA-BS tarzı) — **iki
  rakipte de** ayrı bir rapor grubu olarak var; yönetim şirketi / mali müşavir
  segmentine satış için muhtemelen gerekli. Kapsam büyük, ayrı ürün kararı
  gerektirir.
- **Firma ve Personel için ayrı "Ödeme ve Borçlanma" cari hesapları**
  (yalnızca sakinler değil, tedarikçiler ve personel de cari hesap)
- ~~**Kişi bazlı bakiye trend grafiği** (üye listesinde her satırda)~~ ✅
  **yapıldı** (§2.7) — borçların "daire özeti" sekmesinde satır içi sparkline
- **Vekaletname örneği, antetli evrak, adres etiketi** gibi hazır belge
  şablonları — bizde yalnız dosya deposu (`belgeler`) var, şablon üretimi yok
- **AI destekli Yönetim Asistanı** (metin+sesli, KMK/aidat sorularını
  `packages/dues/src/kmk.ts` kural motoruna bağlayan sohbet widget'ı) —
  Dijiyon'un "Dijital Yönetici" özelliğinden esinlenilmiş, WhatsApp-first +
  Audit Timeline'ın yanına üçüncü "vurucu özellik" adayı
- **Sesli Mesaj (robocall)** kanalı — SPEC'te zaten planlıydı (Bölüm 8.1),
  uygulanmadı; Dijiyon'da canlı çalışıyor, acil durum fallback'i olarak öncelik
  kazanabilir

### 4.4 Zaten önde olduğumuz, doğrulanmış alanlar (değişmedi, korunmalı)

- **WhatsApp-first bildirim mimarisi** — iki rakipte de yok
- **Audit Timeline** (gerekçeli borç değişikliği tarihçesi) — iki rakipte de yok
- **KVKK altyapısı** (veri erişim logu, immutable trigger) — iki rakipte de
  görünmüyor
- **Modern liste deseni** (URL durumu, toplu seçim, çöp kutusu) — rakiplerin
  ikisi de bunu öne çıkarmamış, arayüzleri görsel olarak eski

---

## 5. Yarım kalan modüller — 2026-07-29 denetimi ve kapatılması ✅

Bu bölüm §4'ten (yeni özellik fikirleri) ve §6'dan (ürün kararı bekleyenler)
**ayrı** bir kategori: burada ne fikir eksik ne karar. Tablo var, okuma ucu
var, ekran var — **yazma yolu hiç yazılmamış**tı. Panelde gezen biri için bu
"sayfa açılıyor ama hiçbir şey yapamıyorum" olarak görünüyordu.

**Durum:** §5.1–§5.6 tespitin kendisi (tarihsel kayıt olarak olduğu gibi
duruyor), **§5.7 ne yapıldığını ve neden öyle yapıldığını** anlatıyor. Sıradaki
işler için §5.2'deki tabloda hâlâ ❌ olan iki satıra bakın.

### 5.1 Kanıt: tanımlı ama hiç kullanılmayan yetkiler

Denetim anında `packages/core/src/rbac.ts` 74 yetki tanımlıyordu ve bunların
**21'i** `apps/api` ile `apps/app` içinde **tek bir yerde bile geçmiyordu** —
hepsi yazma yetkisi:

```
staff:write          request:write        request:assign
maintenance:write    reservation:write    reservation:approve
meter:write          bank:write           bank:reconcile
poll:write           poll:vote            meeting:write
message:write        legal:write          document:write
settings:write       payment:refund       debt:forgive
kvkk:manage          resident:invite      announcement:send_urgent
```

Bir yetkinin hiç kullanılmaması tesadüf değil, **o modülde yazma ucunun hiç
yazılmadığının** kanıtı. RBAC bu modülleri baştan planlamış; uygulama yalnız
okuma tarafında durmuştu.

**2026-07-29 sonrası:** bu 21'in **12'si** artık gerçek uçlarda kullanılıyor
(`staff:write`, `request:write`, `request:assign`, `maintenance:write`,
`reservation:write`, `reservation:approve`, `meter:write`, `bank:write`,
`poll:write`, `meeting:write`, `message:write`, `settings:write`).

Kalan **9'u hâlâ kullanılmıyor** ve her biri ayrı bir sebeple — sayıyı
"tamamlandı"ya yuvarlamamak için tek tek:

| Yetki | Neden hâlâ boşta |
| --- | --- |
| `legal:write` | Hukuk modülü açık — Track E'deki PDF/KEP kararına bağlı |
| `document:write` | Belge yükleme açık — dosya saklama politikası kararına bağlı |
| `poll:vote` | Oy **verme** sakin portalında olacak; panel oylamayı açıyor ve kapatıyor, oy kullanmıyor (Track E, sakin portalı kapsamı) |
| `bank:reconcile` | Elle eşleştirme arayüzü yazılmadı; hesap tanımı ve ödeme-hesap bağı bu turda geldi, eşleştirme ekranı §4.2'de duruyor |
| `payment:refund` | İade akışı yok — iyzico iade çağrısı ve muhasebe karşılığı ayrı bir iş |
| `debt:forgive` | Borç **silme/affetme** ayrı bir karar yüzeyi; bugün düzeltme (`debt:write` + gerekçe) üzerinden yapılıyor |
| `kvkk:manage` | KVKK talep kapatma akışı okuma tarafında duruyor, yazma tarafı Track E'deki "KVKK gelen kutusu" ile gelecek |
| `resident:invite` | Sakin daveti sakin portalıyla anlamlı; portal kapsamı kararı verilmeden davet göndermek boşluğa davet olurdu |
| `announcement:send_urgent` | Acil durum override'ı `announcementCreate.isUrgent` üzerinden çalışıyor ama **ayrı yetkiye bağlanmadı**: bugün `announcement:write` olan herkes acil gönderebiliyor. Küçük ama gerçek bir yetki boşluğu — kapatılmalı |

### 5.2 Modül-modül durum

| Modül | Ekran | Okuma ucu | Yazma ucu | DB tablosu | Sonuç |
| --- | --- | --- | --- | --- | --- |
| ~~Personel `/panel/personel`~~ | ✅ | ✅ | ✅ **2026-07-29** | `staff`, `staff_attendance`, `staff_leaves` | **TAMAMLANDI** — bkz. §5.7 |
| ~~Talep / arıza `/panel/talepler`~~ | ✅ | ✅ | ✅ **2026-07-29** | `requests`, `request_comments` | **TAMAMLANDI** — bkz. §5.7. (Arıza ayrı modül değil: `requests.category` alanı) |
| ~~Bakım `/panel/bakim`~~ | ✅ | ✅ | ✅ **2026-07-29** | `maintenance_records`, `maintenance_templates` | **TAMAMLANDI** — bkz. §5.7 |
| ~~Sayaçlar `/panel/sayaclar`~~ | ✅ | ✅ | ✅ **2026-07-29** | `meters`, `meter_readings` | **TAMAMLANDI** — bkz. §5.7. `meter` aidat formülü artık kullanılabilir |
| ~~Rezervasyon `/panel/rezervasyon`~~ | ✅ | ✅ | ✅ **2026-07-29** | `reservations`, `resources` | **TAMAMLANDI** — bkz. §5.7. Tesis tanımı da eklendi |
| ~~Anketler `/panel/anketler`~~ | ✅ | ✅ | ✅ **2026-07-29** | `polls`, `poll_votes` | **TAMAMLANDI** — bkz. §5.7 |
| ~~Toplantılar `/panel/toplantilar`~~ | ✅ | ✅ | ✅ **2026-07-29** | `meetings`, `meeting_decisions` | **TAMAMLANDI** — bkz. §5.7. (Karar Defteri ayrı modül — §2.7) |
| ~~Mesajlar `/panel/mesajlar`~~ | ✅ | ✅ | ✅ **2026-07-29** | `messages` | **TAMAMLANDI** — bkz. §5.7. Okuma tarafı sonradan konuşma tabanlı gelen kutusuna çevrildi (§5.9.2): yazma ucu vardı ama gelen mesaja **cevap** yolu yoktu |
| ~~Banka `/panel/banka`~~ | ✅ | ✅ | ✅ **2026-07-29** | `bank_accounts`, `bank_transactions`, `reconciliation_issues` | **TAMAMLANDI** — bkz. §5.7. Ödemeye `bank_account_id` de eklendi (migration `0007`) |
| ~~Ayarlar `/panel/ayarlar`~~ | ✅ | ✅ | ✅ **2026-07-29** | `tenants.settings` (JSONB) | **TAMAMLANDI** — bkz. §5.7. Entegrasyon rozetleri de gerçeğe bağlandı (§5.5) |
| Hukuk `/panel/hukuk` | ✅ liste | `GET /v1/panel/legal` | ❌ | `legal_cases` | İcra/dava dosyası açılamıyor |
| Belgeler `/panel/belgeler` | ✅ liste | `GET /v1/panel/documents` | ❌ | `documents` | Belge yüklenemiyor |

**Denetim anındaki karşılaştırma:** yazma yolu tamam olan modüller birimler,
sakinler, borçlar, giderler, aidat planları, duyurular, demirbaş, karar
defteri, geçiş — yani 9 modül tam, 12 modül yarımdı.

**Bugün:** 19 modül tam, **2 modül açık** (hukuk, belge yükleme) — ikisi de
ürün kararına bağlı.

### 5.3 Modal (çekmece) tutarsızlığı

Karar: liste ekranından açılan oluşturma/düzenleme akışları **sayfa
değiştirmeden çekmecede** açılmalı (§2.3 Faz 2, "akış-içi çekmece").
Uygulama bunun yalnızca bir bölümünü kapsıyor.

`apps/app/src/app/panel/@modal/` altında kesme (interception) rotası **olan**:

- `(.)birimler/yeni`, `(.)birimler/[id]/duzenle`
- `(.)sakinler/yeni`, `(.)sakinler/[id]/duzenle`
- `(.)giderler/yeni`

Kesme rotası **olmayan** (bu yüzden tam sayfaya atlıyordu — hepsi
2026-07-29'da eklendi, bkz. §5.7 madde 9):

- `/panel/borclar/yeni`, `/panel/borclar/toplu`, `/panel/borclar/[id]`
- `/panel/aidat/yeni`, `/panel/aidat/[id]/duzenle`
- `/panel/giderler/[id]/duzenle`, `/panel/giderler/kategoriler`
- `/panel/birimler/toplu`, `/panel/sakinler/acil-durum`

Not: `QUICK_ACTIONS` (komut paleti) bu adreslerin dördünü doğrudan
gösteriyor — yani en kısa yol olarak sunulan akış aynı zamanda en kırık olanı.
Desen hazır ve tekrarlanabilir (`RouteDrawer` + aynı server action'ı paylaşma);
eksik olan yalnız dosyalar.

### 5.4 Aidat planı ↔ toplu borçlandırma kopukluğu

İki ayrı mekanizma var ve **birbirini tanımıyorlar**:

| | Aidat planı (`/panel/aidat`) | Toplu borç (`/panel/borclar/toplu`) |
| --- | --- | --- |
| Ne | Tekrar eden borçlandırma **şablonu** (periyot, formül, vade, gecikme oranı, kapsam) | Tek seferlik toplu borçlandırma |
| Nasıl çalışır | `apps/worker` → `dues.generate-monthly` job'ı her dönem başında aktif planları koşturur; `dues_runs` tablosu aynı dönemin iki kez üretilmesini engeller | Yönetici formu doldurur → önizleme → uygula |
| Sözleşme | `duesPlanSave` | `debtBulkCreate` — içinde **`duesPlanId` alanı yok** |

Sonuç, kullanıcının sorduğu şey: denetim anında **hayır**, toplu borç
ekranında var olan bir planı seçip uygulayamıyordunuz. Plan yalnız worker'ın
cron'uyla, kendi takviminde çalışıyordu; elle "şimdi çalıştır" düğmesi de
yoktu. İki şey eksikti — **ikisi de 2026-07-29'da eklendi** (§5.7 madde 7b):

1. **"Plandan doldur"** — seçilen planın formül/tutar/vade/kapsam alanlarını
   toplu borç sihirbazına taşımak (tek seferlik sapma gerektiğinde).
2. **"Planı şimdi çalıştır"** — `dues.generate-monthly`'yi tek plan/tek dönem
   için elle tetiklemek. `dues_runs` idempotanslığı zaten koruduğu için
   güvenli; altyapı (`POST /v1/panel/platform/jobs/:job/run`) da hazır.

### 5.5 Ayarlar ve entegrasyonlar — "neye göre açık/kapalı?"

Kullanıcının sorusu haklı ve cevabı rahatsız edici: **hiçbir şeye göre.**
`/panel/ayarlar` içindeki entegrasyon rozetleri şu sabitten okunuyor:

```ts
const INTEGRATIONS = [
  { key: "whatsapp", enabled: siteConfig.features.whatsappBot }, // = sabit true
  { key: "sms",      enabled: siteConfig.features.smsNotify },
  { key: "payment",  enabled: true },                            // elle true
  { key: "bank",     enabled: siteConfig.features.bankIntegration },
  { key: "einvoice", enabled: false },                           // elle false
  { key: "kep",      enabled: false },                           // elle false
];
```

`siteConfig.features.*` **derleme zamanı** sabitleri (`packages/config`), site
başına değil tüm ürün için geçerli. Yani rozet "bu sitede WhatsApp bağlı"
demiyor, "bu üründe WhatsApp özelliği kodda var" diyor. Yönetici için bu
bilgi yanıltıcı. Gösterilmesi gereken: kimlik bilgisi tanımlı mı, webhook
doğrulaması geçti mi, son mesaj ne zaman gitti.

**WhatsApp numara modeli — açık bir ürün kararı, kodda örtük bir cevap var.**
Bugünkü uygulama tek bir **platform numarası** varsayıyor:
`packages/config/src/env.ts` içindeki `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` süreç düzeyinde ortam
değişkenleri — site başına alan yok, `tenants.settings` içinde de WhatsApp
kimlik bilgisi tutulmuyor. Yani bugün: **tek numara, bizim numaramız, tüm
siteler ortak.** Yönetici kendi numarasını giremez.

Bu tercihin sonuçları (karar verilirken tartılması gerekenler):

- *Tek platform numarası (bugünkü hâl):* kurulum sıfır, Meta iş doğrulaması
  bir kez bizde. Ama gönderen adı sitenin değil bizim; sakin "bu mesaj kimden"
  diye sorar ve şablon onayları ile mesaj kotası tüm siteler arasında paylaşılır
  — bir sitenin şikâyet oranı diğerlerinin teslimatını düşürebilir.
- *Site başına numara:* marka doğru görünür, kota ve itibar izole olur. Ama her
  site için ayrı WABA + Meta doğrulaması gerekir; küçük bir apartman yönetimi
  bunu yapmaz. Satın alma sürtünmesi ciddi.
- *Karma:* varsayılan platform numarası, isteyen site kendi WABA'sını
  bağlayabilir. `tenants.settings`'e opsiyonel WhatsApp kimlik bilgisi alanı
  eklemeyi gerektirir; gönderim katmanı (`packages/notifications`) site
  ayarı varsa onu, yoksa ortamı kullanır.

**✅ KARAR (2026-07-29): karma model.** Varsayılan platform numarası kalıyor,
site isterse kendi WABA'sını bağlayabiliyor. Uygulama gereksinimleri:

1. `tenants.settings` (JSONB) içine opsiyonel `whatsapp` bölümü:
   `phoneNumberId`, `accessToken`, `appSecret`, `verifyToken`. Token'lar
   **şifreli** saklanmalı (`PiiService` ile aynı yol) — JSONB'de açık token,
   yedeklerde ve log'larda açık token demektir.
2. `packages/notifications` gönderim katmanı: site ayarı varsa onu, yoksa
   ortam değişkenini kullanır. Seçimin **hangisi olduğu** gönderim kaydına
   yazılmalı, yoksa teslimat sorunu ayıklanamaz.
3. Gelen webhook'un hangi siteye ait olduğu artık numaradan çözülüyor:
   `phoneNumberId` → tenant eşlemesi gerekli. Bugün tek numara olduğu için
   bu adım yok.
4. Ayarlar ekranı **gerçek bağlantı durumunu** gösterir: kimlik bilgisi
   tanımlı mı, webhook doğrulaması geçti mi, son mesaj ne zaman gitti —
   "aktif/pasif" sabiti değil.

4. madde diğerlerinden bağımsız ve **hemen** yapılabilir: bugünkü ekran
yöneticiye yanlış bilgi veriyor ve bu, numara modelinden bağımsız bir kusur.

### 5.6 Sıra — bu bölümdeki işler hangi düzende yapılacak

Sıralama bağımlılığa göre: personel önce, çünkü talep ataması ve demirbaş
zimmeti personel kaydına bağlanıyor; banka hesabı ödemeden önce, çünkü
ödemenin hangi hesaba girdiği hesap tanımı olmadan sorulamaz.

| # | İş | Neden bu sırada |
| --- | --- | --- |
| ~~1~~ | ~~**Personel** yazma akışı~~ | ✅ **2026-07-29 tamamlandı** |
| ~~2~~ | ~~**Talep / arıza** (kayıt, atama, durum, yorum)~~ | ✅ **2026-07-29 tamamlandı** |
| ~~3~~ | ~~**Bakım** planlama/tamamlama~~ | ✅ **2026-07-29 tamamlandı** |
| ~~4~~ | ~~**Sayaç** tanımı + okuma girişi~~ | ✅ **2026-07-29 tamamlandı** |
| ~~5~~ | ~~**Rezervasyon** + onay~~ | ✅ **2026-07-29 tamamlandı** |
| ~~6~~ | ~~**Banka hesabı tanımı** + ödemede hesap seçimi~~ | ✅ **2026-07-29 tamamlandı** |
| ~~7~~ | ~~**Aidat planı ↔ toplu borç** bağlantısı (§5.4)~~ | ✅ **2026-07-29 tamamlandı** |
| ~~8~~ | ~~**Ayarlar** yazma + entegrasyon gerçek durumu (§5.5)~~ | ✅ **2026-07-29 tamamlandı** |
| ~~9~~ | ~~**Anket / toplantı / mesaj** yazma akışları~~ | ✅ **2026-07-29 tamamlandı** |
| ~~10~~ | ~~**Modal kesme rotaları** (§5.3)~~ | ✅ **2026-07-29 tamamlandı** |

Hukuk ve belge yükleme (§5.2 son iki satır) bu sıranın dışında bırakıldı:
ikisi de Track E'deki bir ürün kararına (PDF/KEP sağlayıcısı, dosya saklama
politikası) bağlı — bkz. §6.

### 5.7 Tamamlananlar ve ortaya çıkan desen (2026-07-29)

**1 — Personel.** Sözleşme `staffSave`/`staffDetail`; `POST/GET/PATCH/DELETE
/v1/panel/staff/:id` + `StaffWriteService`; panelde form, tam sayfa `yeni` ve
`[id]/duzenle`, her ikisinin çekmece sürümü, liste başlığında ekleme düğmesi,
satır içi düzenleme, komut paletine hızlı işlem.

Üç karar:
- **Net ücret ve SGK girilir, hesaplanmaz.** Gerçek bordro asgari geçim
  indirimi, kümülatif matrah ve teşviklere bağlı; burada hesaplamak mali
  müşavirin bordrosuyla çelişecek ikinci bir gerçek üretirdi.
- **TCKN/IBAN'da boş = dokunma.** Alanlar okuma ucundan hiç dönmediği için
  formda her zaman boş görünüyor; boşluğu "sil" saymak, formu açıp kaydeden
  herkesin kimlik bilgisini silmesi demekti. Silmek ayrı kutucuk.
- **Ayrılış tarihi tek kaynak**, ayrı "aktif mi" anahtarı yok — ikisi birlikte
  olsa "ayrıldı ama aktif" çelişkisi aylık maliyet toplamını şişirirdi.

TCKN/IBAN şifrelemesi sakinlerdeki **aynı** `PiiService` üzerinden;
`TenancyModule` bunun için `PropertyModule`'ü içeri alıyor. İkinci bir
şifreleme yolu, anahtar döndürme gününde iki ayrı yerin güncellenmesi demekti.

**2 — Talep / arıza.** `requestSave` / `requestStatusPatch` /
`requestAssignPatch` / `requestCommentCreate` / `requestDetail`; beş yeni uç
(`POST`, `GET :id`, `PATCH :id`, `PATCH :id/durum`, `PATCH :id/atama`,
`POST :id/yorum`) + `RequestWriteService`; panelde form, tam sayfa detay
(özet + düzenleme + eylemler), çekmece detay, liste bağlantıları.

Dört karar:
- **Kod ve SLA vadesi sunucuda.** Kod (`TLP-yyyy-nnnn`) site içinde tekil
  olmalı; vade `siteConfig.sla`'daki söz ve ölçütü sunucunun saati.
- **Öncelik değişince vade açılış anından yeniden hesaplanıyor**, "şimdi"den
  değil. Aksi hâlde geciken bir talebin önceliğini yükseltmek gecikmeyi
  silerdi — yükseltmenin cezası olmamalı ama ödülü de olmamalı.
- **Durum formda değil ayrı uçta.** Geçişin yan etkileri (ilk yanıt, çözüm,
  kapanış zamanı) form alanı olsalardı geçmişe dönük tarihle SLA ölçümü
  anlamsızlaştırılabilirdi. `firstResponseAt` bir kez yazılıyor.
- **Atama `request:assign` istiyor**, `request:write` değil: `staff` rolü
  talep açıp güncelleyebilir ama kimin hangi işi yapacağına karar vermek
  yönetimin işi. Sakin rollerine atama yapılamıyor — SLA sayacı yönetimin
  sorumlu olmadığı bir sürede işlerdi.

**3 — Bakım.** `maintenanceSave` / `maintenanceComplete` / `maintenanceDetail`;
beş uç + `MaintenanceWriteService`; panelde plan formu, "yapıldı" formu, tam
sayfa ve çekmece sürümleri. `maintenance.reminders` worker job'ı zaten
yazılıydı — bu iş hazır boru hattının kapalı olan girişini açtı.

- **Sıradaki vade yapıldığı tarihten ilerliyor**, planlanandan değil.
  Planlanandan zincirlenseydi üç ay geciken bir bakım tamamlandığı anda "yine
  gecikmiş" görünürdü.
- **Plan düzenleme ile "yapıldı" ayrı formda**: son bakım tarihi yasal
  denetimde sorulan şey ve planı düzelten biri onu yanlışlıkla
  değiştirebilmemeli.
- Şablon **doldurur, kilitlemez**: yasal şablon doğru başlangıç ama site
  gerçeği farklı olabilir (iki asansör, sözleşmeye bağlı daha sık bakım).

**4 — Sayaç.** `meterSave` / `meterReadingBatch` / `meterDetail`; beş uç +
`MeterWriteService`; panelde tanım formu ve **dönemsel toplu okuma** ekranı.
Bu modülün eksikliği tek bir ekranı değil bir **aidat formülünü** kapalı
tutuyordu: `dues_plan.formula = "meter"` bu veriye bağımlıydı.

- **Okuma girişi toplu ve tek işlem**: gerçek iş ayda bir binayı dolaşmak;
  sayaç başına ayrı istek 60 daireli binada yarım kalmış bir tur demekti.
- **Boş satır atlanır, sıfır sayılmaz.** Sıfır sayılsaydı okunamayan bir sayaç
  "bu ay hiç kullanmadı" olur ve bir sonraki dönemde iki dönemlik tüketim tek
  faturaya binerdi.
- **Takılış endeksi okuma girildikten sonra kilitli**: değişebilseydi ilk
  dönemin tüketimi geriye dönük değişir, faturası kesilmiş bir tutar sessizce
  başka bir şeye dönüşürdü.
- Negatif tüketim ve ani sıçrama **ayrı ayrı** işaretleniyor: sebepleri ve
  çözümleri farklı, tek "şüpheli" etiketi yöneticiyi yalnız bırakırdı.

**5 — Rezervasyon.** `resourceSave` / `reservationCreate` / `reservationDecide`;
yedi uç + `ReservationWriteService`; panelde tesis formu, rezervasyon formu,
karar ekranı, çekmece sürümleri. **Tesis tanımı da yoktu** — modülün girişi
kapalıydı, ekran yalnız boş bir liste gösterebiliyordu.

- **Ücret tarifeden ve süreden türüyor**, formda ücret alanı yok: aynı salon
  iki sakine iki farklı fiyata verilemesin.
- **Çakışma kontrolü yarı açık aralıkla** (`[start, end)`): bitişik iki
  rezervasyon çakışma değil, yoksa arka arkaya kullanım imkânsız olurdu.
  `pending` de yeri tutuyor — yönetici sonradan hakem olmak zorunda kalmasın.
- **İptal edilmiş rezervasyon yeniden onaylanamıyor**: aradaki sürede o saat
  başkasına verilmiş olabilir ve geri almak çakışma kontrolünü atlatmak olurdu.

**6 — Anket / toplantı / mesaj.** `pollSave` / `pollClose` / `meetingSave` /
`meetingDecisionSave` / `messageSend`; sekiz uç + `CommunicationWriteService`.

- **Seçenek kimlikleri sunucuda ve düzenlemede korunuyor**: oylar `option_id`
  ile saklandığı için kimlikleri baştan üretmek verilmiş oyları başka bir
  seçeneğe bağlardı.
- **Oylama sonucu kapatma anında hesaplanıp saklanıyor**: ağırlık modu ya da
  arsa payları sonradan değişirse kapanmış bir kararın sonucu değişmemeli.
- Yeter sayı tabanı kurala bağlı: `simple_majority` katılanlar üzerinden,
  nitelikli çoğunluklar **tüm kat malikleri** üzerinden. Hepsini katılanlar
  üzerinden hesaplamak, dört kişinin katıldığı toplantıda oybirliği kararı
  almayı mümkün kılardı.
- **WhatsApp 24 saatlik servis penceresi kapalıysa mesaj gönderilmiyor** ve
  sebebi ekrana yazılıyor. "Gönderildi" deyip ulaşmaması, bu ekranın
  verebileceği en pahalı yanlış bilgiydi.
- İkinci toplantı tarihi (KMK md.30) **otomatik doldurulmuyor**: kanuni asgari
  bir varsayılan değil.

**7 — Banka hesabı + ödemede hesap seçimi.** `bankAccountSave` /
`bankAccountDetail`; dört uç + `BankAccountWriteService`; **migration `0007`**
ile `payments.bank_account_id`. Tek şema değişikliği gerektiren iş buydu.

- Sorun: `method` "havale" diyordu ama **hangi hesaba** yattığını
  söylemiyordu. Site birden fazla hesap tutuyor ve eşleştirme yalnız tutar ve
  tarihle yapıldığı için iki hesapta aynı gün aynı tutar varsa yanlış
  eşleşiyordu.
- Kolon **nullable**: nakit tahsilatın banka hesabı yok ve uydurma bir hesap
  seçtirmek mutabakatı kalıcı olarak bozardı. Sunucu `cash` yönteminde hesabı
  zaten yok sayıyor.
- IBAN **mod-97 kontrol basamağıyla** doğrulanıyor ve aynı IBAN ikinci kez
  tanımlanamıyor (blind index): iki kayıt olsaydı gelen havale ikisiyle de
  eşleşir ve mutabakat hangisine yazacağını bilemezdi.
- Düzenlemede IBAN **yeniden giriliyor**: okuma uçları yalnız maskeyi
  döndürüyor ve maskeyle doldurulmuş bir alan kaydedilseydi maske gerçek
  IBAN'ın yerine yazılırdı.

**7b — Aidat planı ↔ toplu borç (§5.4).** İki yönlü bağlantı kuruldu:

- **"Planı şimdi çalıştır"** (`POST /v1/panel/dues-plans/:id/run`):
  üretim mantığı `packages/jobs`'taki **aynı** fonksiyondan geliyor; ikinci bir
  uygulama, elle çalıştırmayla cron'un zamanla ayrışması demekti. Önizleme
  varsayılan açık — borç üretmek geri alınması pahalı bir iş ve üretilen her
  borç sakine bildirim doğuruyor. İdempotanslık `dues_runs` (plan, dönem)
  tekil indeksinden.
- **"Plandan doldur"** (`/panel/borclar/toplu?plan=`): sihirbaz planın
  formül/tutar/vade/kapsam alanlarını **kopyalıyor, bağlamıyor**. Plana
  bağlansaydı üretilen borçlar planın dönemsel koşusuyla karışır ve
  `dues_runs` idempotanslığı iki farklı kaynaktan gelen aynı dönemi ayırt
  edemezdi. Ekran bu ayrımı kullanıcıya da anlatıyor.

**8 — Ayarlar + entegrasyon durumu (§5.5).** `tenantSettingsSave` +
`integrationStatusResponse`; `PATCH /v1/panel/settings` ve
`GET /v1/panel/settings/integrations` + `SettingsWriteService`.

- `settings` JSONB **birleştiriliyor**, ezilmiyor: sözlükte formun bilmediği
  anahtarlar da var (marka, landing görseli) ve nesneyi baştan yazmak onları
  sessizce silerdi.
- Gecikme oranı **%5 ile sınırlı** (KMK md.20); sınırı forma bırakmak kanuna
  aykırı bir oranın aylarca uygulanabilmesi demekti. Vade günü en fazla 28 —
  29–31 kısa aylarda kayardı.
- `slug`, daire sayısı ve abonelik alanları **bilinçle düzenlenemez**: ilki
  basılmış her bağlantıyı kırar, ikincisi `units` tablosundan türüyor,
  üçüncüsü faturalandırmanın sonucu.
- **Entegrasyon rozetleri artık gerçeği söylüyor.** Her satır üçünü ayırıyor:
  kimlik bilgisi tanımlı mı, hangi kapsamdan geliyor (site ayarı / platform)
  ve son gönderim ne zaman oldu. WhatsApp'ta `scope` karma modelin (2026-07-29
  kararı) hangi numarasının kullanıldığını söylüyor. e-Fatura ve KEP "kapalı"
  değil **"kurulmamış"** — "kapalı" demek onları açılabilir sanmaya yol açardı.

**9 — Modal kesme rotaları (§5.3).** Eksik olanların hepsi eklendi:
`borclar/yeni`, `aidat/yeni`, `aidat/[id]/duzenle`, `giderler/[id]/duzenle` —
ve yeni gelen sekiz modülün tamamı zaten çekmece sürümüyle birlikte geldi.
`DebtForm` ile `DuesPlanForm` bu iş sırasında çekmece-uyumlu hale getirildi
(`layout="modal"`, `stayOnSuccess`).

---

**Kalan modüllerde tekrarlanacak desen:**

1. `packages/contracts` — tek `*Save` şeması (oluşturma ve güncelleme aynı
   şemayı paylaşır), ayrı `*Detail` (form doldurma), yan etkili geçişler için
   ayrı `*Patch` şeması.
2. `apps/api` — okuma servisinden ayrı `*-write.service.ts`; türetilmiş
   değerler (kod, vade, zaman damgası) **istemciden alınmaz**.
3. Seçenek listeleri (daire, görevli, kategori) liste ucunun yanıtına
   eklenir — ekran ikinci çağrı yapmaz (§9a).
4. `apps/app` — `*-form.tsx`, tam sayfa `yeni` + `[id]/duzenle`, **ve** her
   ikisinin `@modal/(.)` çekmece sürümü, ortak `*-defaults.ts` eşleyici.
5. Liste başlığına ekleme düğmesi (yetki kontrollü), `EmptyState`'e aynı
   düğme, `QUICK_ACTIONS`'a hızlı işlem, tr+en çeviriler.

Her adımda kapılar: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm arch`,
`pnpm --filter @yonetim/app build`.

> **Typecheck kapısı hakkında uyarı:** kökteki `tsconfig.check.json` yalnız
> `packages/*` ve `tests/` kapsıyor — `apps/api` ve `apps/app` **dahil değil**
> (dosyanın kendi yorumunda gerekçesi yazılı: Nest dekoratörleri sahte hata
> üretiyordu). Uygulamalar ayrı ayrı `npx tsc --noEmit` ile kontrol edilmeli;
> yalnız kökteki komutu çalıştırıp "temiz" demek yanıltıcı.

---

## 5.8 Sakin portalı, firma konsolu ve kayıt akışları (2026-07-29)

Bu bölümdeki dört iş birbirine bağlı: hepsi "uygulama var ama içine
girilemiyor" sınıfından. Kod baştan beri yazılıydı, bağlanmamıştı.

### 5.8.1 Kapatılan güvenlik açığı — sakin tüm yazışmaları okuyabiliyordu

`RESIDENT_BASE` içinde `message:read` vardı ve
`GET /v1/panel/communication/messages` yalnız o izni istiyor; servis ise
sitedeki **tüm** mesajları döndürüyor. Yani her sakin, komşularının yönetimle
yazışmasını okuyabiliyordu. Menüde de görünüyordu (`/panel/mesajlar`).

Ekranı gizlemek çözüm değildi — uç kendisi açıktı. İzin `message:read_own`
ile daraltıldı (`debt:read_own`, `request:read_own` ile aynı desen) ve sakin
yalnız kendi yazışmasını döndüren `/v1/panel/portal/messages` ucuna bağlandı.

**Aynı sınıftan ikinci bulgu:** menü yalnız izne bakıyordu, oysa sakinde
`announcement:read`, `poll:read`, `meeting:read`, `document:read`,
`decision:read`, `reservation:read` izinleri de var — hepsi site geneline açık
içerik izinleri, ama işaret ettikleri sayfalar yönetim ekranı. `/panel/duyurular`
sakine besteci kutusu açıyordu.

Çözüm: `NavItem.audience` (`"staff" | "resident"`) ve `navItemsFor(roles)` —
görünürlük artık **izin ∧ kitle**. Varsayılan `["staff"]`, yani yeni bir
yönetim sayfası eklendiğinde sakine sızmıyor; unutulduğunda güvenli tarafa
düşen varsayılan bu.

### 5.8.2 `/panel` rol duyarlı, sakin ekranları kuruldu

Sakin `/panel`'e girdiğinde **hata sayfası** görüyordu: dashboard'u besleyen
`/v1/panel/dashboard` `report:read` istiyor, sakinde yok (ve olmamalı — site
geneli tahsilat/gider rakamları). Eski `/sakin` portalı ise tek sayfalık
kalmıştı: ödeme geçmişi, talepler, mesajlar, bilgiler hiç yoktu.

`/panel` artık ortak adres; `audienceOf(ctx.roles)` sonucuna göre yönetim
dashboard'u ya da sakin özeti render ediliyor. `/sakin` → `/panel` (301).

| Ekran | Yol | Uç |
| --- | --- | --- |
| Özet | `/panel` | `GET /v1/panel/portal/me` |
| Borçlarım | `/panel/borclarim` | `GET /v1/panel/portal/debts` |
| Ödemelerim | `/panel/odemelerim` | `GET /v1/panel/portal/payments` |
| Taleplerim | `/panel/taleplerim` (+`yeni`, `[id]`) | `/v1/panel/portal/requests*` |
| Mesajlarım | `/panel/mesajlarim` | `/v1/panel/portal/messages` |
| Bilgilerim | `/panel/bilgilerim` | `GET/PATCH /v1/panel/portal/profile` |
| Yönetim bilgileri | `/panel/yonetim-bilgileri` | `GET /v1/panel/portal/management` |
| Duyurular | `/panel/duyurular` (ortak) | mevcut uç, besteci yetkiyle gizli |

Üç karar:

- **Kapsam izinle değil sorguyla daraltılıyor.** `PortalService`'in hiçbir
  metodu dışarıdan `unitId`/`userId` almıyor; hepsi oturumdan çözülüyor
  (`activeUnit()` tek giriş kapısı). İzin ile sorgu birbirinin yedeği —
  biri unutulursa diğeri hâlâ tutuyor.
- **Başkasının talebi 404, 403 değil.** 403 dönmek "böyle bir kayıt var ama
  senin değil" bilgisini sızdırırdı; sahiplik `where` koşulunun içinde.
- **TCKN ve telefon kendi kaydında da maskeli.** Ham değer uçtan çıktığı anda
  sunucu loglarına, hata izlerine ve tarayıcı önbelleğine giriyor; "kaydım
  doğru mu" sorusuna maskeli metin yetiyor. Telefon `PATCH /profile`'da hiç
  değişmiyor: numara oturum kimliğinin kendisi (OTP oraya gidiyor),
  doğrulamasız değişiklik hesabı devretmenin yolu olurdu.

### 5.8.3 Yönetim firması konsolu

`company_admin`/`company_operator` rolleri, `tenants.company_id`,
`ctx.memberships` ve `switchTenant()` baştan beri yazılıydı — **hiçbiri bir
uca ya da ekrana bağlı değildi**. Birden fazla site yöneten bir kullanıcı,
site değiştirmek için çıkış yapıp yeniden girmek zorundaydı.

- `GET /v1/panel/portfolio` — yönetilen sitelerin özeti. Kapsam izinle değil
  **üyelikle**: sorgu `m.user_id = ?` ile sınırlı (`company_id` üzerinden
  kurulmadı, çünkü bir yönetici şirkete bağlı olmayan siteleri de yönetiyor
  olabilir). Sayaçlar `LATERAL` ile tek turda — 20 siteli portföyde site
  başına dört sorgu 80 gidiş-dönüş demekti.
- `POST /v1/auth/web/switch-tenant` — **üyelik burada doğrulanıyor**;
  `switchTenant()` tek başına oturum satırını körlemesine güncelliyor, yani
  kontrol atlansa kullanıcı hiç üyesi olmadığı bir siteyi aktif yapabilirdi.
  Oturum önbelleği hemen düşürülüyor.
- `/panel/portfoy` — liste **risk skoruna göre** sıralı (tahsilat oranı, SLA
  ihlali, geciken bakım birlikte). Alfabetik bir liste 20 satırda hiçbir şey
  söylemiyordu; buradaki tek iş "bugün nereye bakmalıyım" sorusunu ilk satırda
  cevaplamak.
- Kabukta site değiştirici; tek üyelikte hiç render edilmiyor.

### 5.8.4 Kayıt akışları ve düzeltilen sonsuz döngü

`apps/web`'in bütün CTA'ları `/kayit`'e, site landing sayfaları
`/kayit-talebi`'ne bakıyordu; **ikisi de 404 veriyordu.** Pazarlama sitesinin
tamamı ölü bir düğmeye çıkıyordu.

- **`/kayit`** — site veya yönetim firması kaydı. Firma seçilirse `companies`
  kaydı açılıyor, ilk kullanıcı `company_admin` oluyor ve sonraki siteler aynı
  firmaya bağlanıp portföyde tek listede görünüyor. `?kampanya=` ve `?gecis=`
  tenant ayarlarına yazılıyor — hangi kanalın dönüştüğü ancak burada
  öğrenilebiliyor. **Kayıt oturum açmıyor:** doğrulama kodu giriş akışının
  aynı ucundan gidiyor; doğrulamasız site açılabilseydi başkasının adresiyle
  site açıp o kişiyi kilitlemek mümkün olurdu.
- **`/kayit-talebi`** — sakin erişim talebi (`access_requests`, migration
  `0008`). Üyeliği başvuran değil **yönetici** açıyor; otomatik onay "3. daire"
  yazan herkesi o dairenin sakini yapardı ve o kişi duyuruları, karar defterini
  ve tutanakları okurdu. Yanıt her koşulda aynı ("iletildi") — site bulunamasa
  da, talep zaten beklese de; aksi halde uç "bu sitede bu numara kayıtlı mı"
  sorusunun sorulabildiği bir yüzey olurdu. Onay kuyruğu
  `GET /v1/panel/residents/access-requests` (`resident:invite`).
- **`/kurulum` — düzeltilen sonsuz döngü.** `requireContext()` sitesi olmayan
  kullanıcıyı buraya yönlendiriyordu, ama bağlam çözücü üyeliksiz kullanıcı
  için hiç kimlik üretmiyor (`resolveTenantForUser` tenant bulamayınca `null`),
  yani 401 dönüyordu → `/giris` → giriş → yine 401 → `/giris`. Kullanıcı
  hiçbir zaman içeri giremiyordu. Artık çerez varsa `/kurulum`'a gidiliyor ve
  setup ucu oturumu çerezden kendisi çözüyor (`@Public()` ama oturum zorunlu —
  `web/logout` ile aynı desen).

### 5.8.5 Endpoint dil standardı

Controller taban yolları zaten İngilizceydi ama alt segmentler karışıktı:
`/v1/panel/units/secenekler`, `/v1/panel/operations/talepler/:id/durum` gibi
yollarda tek bir uçta iki dil vardı. 45 segment çevrildi, 212 çağrı noktası
ve kontrat dokümantasyonu güncellendi (`secenekler→options`,
`talepler→requests`, `bakim→maintenance`, `sayaclar→meters`,
`toplu/onizleme→bulk/preview`, `dagitim→allocation`,
`gecikme-muafiyeti→late-fee-waiver` …). `apps/app` tarafında
`/api/oturum/cikis` → `/api/session/logout`.

**Sayfa adresleri bilinçli olarak Türkçe kalıyor** (`/panel/borclar`,
`/giris`, `/kayit`): onlar kullanıcıya görünen ve `apps/web`'in SEO
bağlantılarının işaret ettiği yüzey.

### 5.8.6 Komut paleti overlay'i

Palet, kabuğun üst şeridinin içinde render ediliyordu ve o şeritte
`backdrop-blur` var. `backdrop-filter` bir öğeyi `fixed` torunları için
**içeren blok** yapıyor; sonuç: `inset-0` verilmiş backdrop tüm ekran yerine
yalnız 64 piksellik başlığı kaplıyor, dışına tıklamak da kapatmıyordu.
`packages/ui`'ye `CommandOverlay` eklendi (Radix `Dialog.Portal`) — dosyanın
kendi yorumunda zaten "Track C1'de Radix Dialog bunu devralıyor" yazıyordu.

### 5.8.7 Sırada — bu bölümden çıkan açık işler

- **Sakin oylama ekranı yok.** Özet kartında "oy bekleyen anket" sayısı
  gösteriliyor ama bağlantı verilmiyor: `/panel/anketler` yönetim ekranı.
  `poll:vote` izni tanımlı, hiçbir uçta kullanılmıyor.
- **Sakin ödeme akışı bağlanmadı.** `/v1/panel/portal/payment` uçları var
  (`portal-payment.controller.ts`), "Borçlarım" ekranından ödeme düğmesi yok.
- **Telefon değiştirme akışı yok** — doğrulama gerektiriyor (§5.8.2).
- **Toplantı/karar defteri/belgeler sakine kapalı**: içerik site geneline açık
  ve izinleri var, ama sayfaları yönetim ekranı olduğu için `audience: staff`
  bırakıldı. Sakin sürümleri ayrıca yazılmalı.
- **Erişim talebi bildirimi yok**: talep geldiğinde yöneticiye bildirim
  gitmiyor, kuyruğu görmesi için ekrana girmesi gerekiyor. Nav rozeti de yok.
- **Entegrasyon testi yok**: portal kapsam sınırı (sakin komşusunun verisini
  göremiyor) ve erişim talebi onayı `tests/integration`'a yazılmalı — bu
  bölümdeki en kritik iki davranış ve ikisi de yalnız elle doğrulandı.

---

## 5.9 Sakin portalı 500'ü ve yönetici gelen kutusu (2026-07-29)

§5.8 ekranları tarayıcıda ilk kez gerçek veriyle sürüldüğünde iki şey çıktı:
sakin `/panel`'e giremiyordu ve yönetici gelen mesajlara cevap veremiyordu.
İkisi de "kod yazılmış ama bir kez çalıştırılmamış" sınıfından.

### 5.9.1 `/v1/panel/portal/me` 500 veriyordu — `sql` şablonuna gömülü `Date`

Sakin `/panel`'e girdiğinde uç 500, ekran "Beklenmeyen bir hata oluştu."
dönüyordu. Sebep `PortalService.recentAnnouncements` içindeki tek satır:

```ts
sql`${announcements.publishedAt} <= ${now}`   // now: Date
```

Drizzle'ın postgres-js sürücüsü **ham `sql` şablonundaki** parametreleri
`client.unsafe()` üzerinden geçiriyor; orada kolon tipi bilinmediği için
`Date` serileştirilmiyor ve sorgu bind aşamasında patlıyor:

```
TypeError: The "string" argument must be of type string or an instance of
Buffer or ArrayBuffer. Received an instance of Date
```

Kolon operatörleri (`lte`, `gte`, `eq`) aynı değeri kolonun tipine göre
çeviriyor; hata yalnız ham şablona özgü. Düzeltme `isNotNull` + `lte`.

**Sınıfın kendisi:** ham `sql` içine JS değeri gömmek yalnız `string`/`number`
için güvenli. Kod tabanı tarandı, `Date` gömen tek yer buydu (`${polls.id}`,
`${userId}` gibi kalan interpolasyonlar kolon referansı ya da metin).

Neden testler yakalamadı: portal uçlarının hiç entegrasyon testi yok (§5.8.7
son madde) ve `tsc` bu hatayı göremiyor — `sql` şablonu `unknown` alıyor. Hata
yalnız veritabanına gerçekten gidildiğinde çıkıyor.

Aynı fonksiyon `/v1/panel/portal/announcements`'ı da besliyordu; sakin
duyuru ekranı da bu yüzden açılmıyordu.

### 5.9.2 `/panel/mesajlar` gelen kutusu oldu — düz kütük değil konuşma

Sakin `/panel/mesajlarim`'dan yazdığında mesaj yöneticiye ulaşıyordu ama
ekran onu kullanılabilir kılmıyordu: `GET /v1/panel/communication/messages`
düz bir mesaj kütüğü döndürüyordu, yani aynı sakinin üç mesajı üç ayrı satır,
hiçbirinde **kimin yazdığı yok** ve cevap yolu yok. Yeni mesaj düğmesi vardı
ama alıcıyı listeden yeniden seçtiriyordu — gelen kutusu olmayan bir gelen
kutusu.

- **Yanıt artık konuşma listesi.** `messageListResponse.rows` → `threads`;
  her satır bir muhatap (`messageThreadRow`): ad, daire etiketi
  (`A Blok · 9`), maskeli telefon, son mesaj, mesaj sayısı ve
  `awaitingReply`. `totals`'a cevap bekleyen yazışma sayısı eklendi.
- **Kümeleme serviste, SQL'de değil.** `DISTINCT ON` ile son mesajı çekmek
  aynı listeyi verirdi ama "cevap bekliyor mu" kararı yine serviste olurdu;
  tek yerde durması okunurluğu kazandırıyor. Muhatap adı `leftJoin` ile
  geliyor: `user_id` boş bir mesaj (tanınmayan numaradan gelen WhatsApp)
  listeden düşmemeli — yönetici onu da görmeli, yalnız cevaplayamaz.
- **`GET /v1/panel/communication/messages/:userId`** — tek sakinle yazışmanın
  tamamı, eskiden yeniye. `/panel/mesajlar/[userId]` bunu baloncuklu akışla
  gösteriyor ve altında cevap kutusu var.
- **Cevap formunda alıcı seçimi yok.** `MessageForm` opsiyonel `recipient`
  alıyor; verildiğinde `userId` gizli alandan gidiyor. Yanlış kişiye yazmanın
  en kolay yolu, cevap yazarken açık duran bir alıcı listesidir.
- **Eşleşmemiş numaralar tek başlıkta ve bağlantı değil.** Gönderilecek
  `userId` olmadığı için satır tıklanabilir yapılmadı: boş bir yazışma açmak
  "cevaplayabilirsin" demenin yanlış yolu olurdu.

`awaitingReply` ölçüsü "son söz sakinde mi" — ayrı bir okundu tablosu yok ve
bu ölçü rozetin sorduğu şeye ("dönmem gereken var mı") yetiyor. Gerçek okundu
bilgisi istenirse `messages`'a okuma damgası eklemek gerekir.

### 5.9.3 Sırada

- **Portal uçları için entegrasyon testi** — §5.8.7'de zaten açıktı, 5.9.1 onu
  teorik olmaktan çıkardı: uçlar bir kez bile veritabanına karşı
  koşulmadığı için hata kullanıcıda çıktı. `tests/integration`'a
  `/v1/panel/portal/*` duman testi (her uç 200) eklenmeli; bu tek test
  5.9.1'i yakalardı.
- **Cevap bekleyen yazışma için nav rozeti ve bildirim yok.** Yönetici
  `/panel/mesajlar`'a girmedikçe yeni mesajdan haberdar olmuyor.
- **Yazışmada sayfalama yok**: liste son 300, yazışma son 200 mesajla sınırlı;
  `messageCount` de bu pencere içinde sayıyor.
- **Kanal yazışma başlığında son mesajdan alınıyor** — sakin WhatsApp'tan
  yazıp yönetici uygulama içinden cevaplarsa başlıktaki kanal rozeti
  değişiyor. Bugünkü veride tek kanal kullanıldığı için sorun görünmüyor.

---

## 5.10 Site yaşam döngüsü, abonelik yazma yolu ve süper-admin paneli (2026-07-30)

Tetikleyen gözlem: süper-admin hesabıyla girişte `/kurulum`'a yönlendirildi
(hesabın hiç sitesi yoktu), mecburen demo site eklendi ve **eklenen site bir
daha kaldırılamadı**. Oradan çıkan denetim, üç ayrı boşluğu ortaya koydu.

### 5.10.1 Kanıt: şema vardı, yazma yolu yoktu

| Şemada duran | Yazan kod | Sonuç |
| --- | --- | --- |
| `tenant_status` içinde `archived`, `cancelled`; `tenants.archived*`, `cancelled_at`, `suspension_reason` | **yok** | Yönetici bir siteyle işini bitirdiğinde yapabileceği hiçbir şey yoktu |
| `subscriptions` tablosunun tamamı | **yok** (tek geçtiği yer platform özetinin `SELECT`'i) | MRR/ARR kartları her koşulda 0; faturalama job'ları neye bakacağını bilemezdi |
| `sessions.impersonated_by`, `audit_logs.impersonated_by`, `createSession({impersonatedBy})`, `impersonationAudit()` | **başlatan uç yok** | `/yonetim`'deki impersonation kutusu yalnız bilgi metniydi |

Ayrıca **hiçbir kod yolu `tenant_status`'a bakmıyordu**: bir siteyi arşivlemek
satırda etiket değiştirmekten öteye gitmeyecekti — faturalama durup erişim
durmazsa ücretsiz sınırsız kullanım kapısı açılırdı.

### 5.10.2 Alınan kararlar (2026-07-30)

- **Abonelik site başına kalıyor.** Yönetim firmasına konsolide *abonelik*
  değil, konsolide *görünüm* veriliyor. Firma indirimi kampanya motorundan
  geçiyor.
- **Üç seviye, iki sorumlu:** arşivle (yönetici, `tenant:archive`) → 90 gün
  geri kurtarma → kalıcı sil (yalnız süper-admin, `tenant:delete`).
  `tenant:archive` ile `tenant:delete` bilinçli ayrı: geri alınabilir bir karar
  ile geri alınamaz bir imhayı tek yetkiyle ifade etmek, yöneticiye arşivleme
  hakkı verirken geçmişi silme hakkı vermek olurdu.
- **Ek paket satışı var:** `tenant_addons` (SMS / WhatsApp kredisi).

### 5.10.3 Yapılanlar

**Şema (`0009`, `0010`)** — `tenants`'a `archived_at/archived_by/
purge_after_at/status_before_archive`; `tenant_addons` tablosu (bakiye negatife
düşemez, CHECK constraint). `purge_after_at` süreyi **satırda** tutuyor: config
sonradan kısaltılsa da arşivde bekleyen siteye verilmiş tarih değişmiyor.
`status_before_archive`: geri açış "aktif yap" değil "eski hâline döndür" —
denemedeyken arşivlenen site geri açıldığında ücretliye geçmiyor.
`0010` tek seferlik dolgu: aboneliksiz kalmış eski siteler için abonelik satırı
üretiyor (plan daire sayısından, durum siteden türüyor).

**`TenantWritableGuard`** (4. global guard) — pasif/arşiv/iptal sitede
**yazma** reddediliyor (`tenant_read_only:<durum>`), okuma serbest kalıyor
(geçmiş rapor, borç dökümü, karar defteri okunmaya devam ediyor). Platform
rolleri muaf; kurtarma uçları `@AllowArchived()` ile açıkça beyan ediliyor.
`RequestContext.tenantStatus` bunun için eklendi ve durum değişince o sitenin
oturum önbellekleri düşürülüyor — yoksa arşivleme 60 sn gecikmeli etkili olurdu.

**Abonelik yazma yolu** — `signup.service` hem `/kayit` hem `/kurulum`'da
`trialing` abonelik açıyor. MRR sorgusu düzeltildi: `trialing` çıkarıldı
(deneme fiyatı satırda dolu ama gelir değil), `past_due`/`grace` eklendi.

**Süper-admin paneli** — `/yonetim/hesaplar` (liste, aciliyete göre sıralı) ve
`/yonetim/hesaplar/[key]` (siteler + abonelik + SMS kotası, kullanıcılar,
faturalar, ek paketler, aksiyonlar). "Hesap" birimi ne kullanıcı ne tenant:
`companies` satırları + firmaya bağlı **olmayan** siteler tek listede
(`company:<id>` / `tenant:<id>` anahtarı). Aksiyonlar: süre uzat, ek paket
tanımla, hesabı dondur/aktifleştir/kapat, siteyi arşivle/geri aç/kalıcı sil,
hesaba geç. **Hepsinde gerekçe zorunlu** (≥10 karakter, denetim kütüğüne).

**Impersonation** — 30 dk ömürlü oturum, hedef kullanıcının üyeliği şart,
platform kullanıcısına ve kendine geçiş yasak. Yöneticinin kendi jetonu ayrı
bir çerezde (`yonetim_admin_session`) saklanıyor; kabuktaki uyarı bandına
"geçişten çık" düğmesi eklendi (JS'siz de çalışan `<form>`).

**Çoklu site indirimi** — `CampaignConditions.minTenantCount` +
`TenantSnapshot.managedTenantCount`; `coklu_site_5_plus` (%10) ve
`coklu_site_15_plus` (%20) şablonları, `stackable: true` (ölçek indirimi,
kazanım kampanyasının yerine geçmemeli).

### 5.10.4 Uçlar veritabanına karşı koşuldu — üç hata orada çıktı

§5.9.1'in dersi uygulandı: her uç gerçek veriye karşı çağrıldı ve **statik
kapılardan geçen üç hata** ancak orada göründü.

1. **`memberships` join'i toplamları çarpıyordu** — 24 daireli, 3 üyelikli site
   72 daire ve 3 katı fiyat gösteriyordu. `COUNT(DISTINCT)` kendini koruyor,
   `SUM` korumuyor: toplamların yanında satır çoğaltan join durmamalı.
   Kullanıcı sayımı hesap düzeyinde ayrı CTE'ye taşındı.
2. **`= ANY(${dizi}::uuid[])` geçersiz SQL üretiyordu** — Drizzle diziyi tek
   dizi parametresine değil virgüllü parametre listesine açıyor. `uuidList()`
   yardımcısı eklendi (boş listede `IN (NULL)`; koşulu düşürmek tüm platformun
   verisini döndürürdü).
3. **`sql` şablonuna gömülü `Date`** — §5.9.1'deki hatanın aynısı tekrarlandı.
   Zaman damgaları `now()`'a, kurtarma penceresi SQL `interval`'ına taşındı;
   bu ayrıca tek transaction'daki satırlara aynı damgayı veriyor.
4. **Ham SQL zaman damgalarını `Date` değil `string` döndürüyor** — bu dördüncü
   hata ilk turda **kaçtı**, çünkü yalnız arşivlenmiş sitede tetikleniyordu:
   `tx.execute` satırları `as unknown as` ile elle tiplenmiş ve o tipler
   `Date` diyordu; sözleşme tarafı `z.coerce.date()` ile metni sessizce
   düzelttiği için her şey çalışıyor görünüyordu. Üzerinde **aritmetik** yapan
   tek yer `daysLeft()` idi ve `purge_after_at` boşken erken dönüyordu — alan
   ilk kez arşivde dolduğunda `getTime is not a function` ile 500 verdi ve
   hata `/yonetim/hesaplar/[key]` ekranını açılamaz yaptı. Ham satır tipleri
   `RawTimestamp = Date | string | null` ile gerçeği söyleyecek hâle getirildi,
   dönüşüm `toDate()` ile eşleme sınırında yapılıyor (yanıt artık ISO taşıyor).
   Kod tabanının kalanı tarandı: ham SQL ile tarih aritmetiğini birleştiren
   başka yer yok — `document.service` ve `context-resolver` query builder
   kullanıyor, yani gerçek `Date` alıyorlar.

   **Ders:** `as unknown as` ile elle tiplenen her satır bir **iddia**, kanıt
   değil. Bu yolda tip kontrolü koruma sağlamıyor; testin nullable alanların
   **dolu** olduğu durumu da kapsaması gerekiyor.

### 5.10.5 Yol boyunca kapatılan mevcut açık

**Çıkış oturum önbelleğini düşürmüyordu.** `POST /v1/auth/web/logout`
`destroySession` çağırıyor ama Redis'teki çözülmüş kimlik 60 sn daha
yaşadığı için jeton çıkıştan sonra bir dakika geçerli kalıyordu — dosyanın
kendi açıklaması ("yalnız çerezi düşürmek çalınmış jetonu geçersiz kılmaz")
tam bu yüzden geçerli değildi. `switch-tenant` bu düşürmeyi zaten yapıyordu,
çıkışta atlanmıştı. Hata impersonation çıkışını doğrularken görüldü (silinen
oturum hâlâ 200 dönüyordu); iki yer birden düzeltildi.

### 5.10.6 Sırada

- **Faturalama job'larının handler'ı hâlâ yok.** `billing.trial-expiry`,
  `billing.dunning`, `billing.renewal` tanımlı (`packages/jobs/src/definitions.ts`)
  ve saf hesap fonksiyonları yazılı (`packages/jobs/src/dunning.ts`) ama worker
  tarafında karşılıkları yok. Yani **deneme süresi dolan hesap hâlâ kendiliğinden
  askıya alınmıyor**; askı ancak süper-admin panelinden elle yapılıyor. Abonelik
  satırı artık var, yani bu iş artık yazılabilir durumda.
- **`billing.archive-purge` job'ı yok.** `LifecycleService.purgeCandidates()`
  süresi dolmuş arşivleri listeliyor ama kimse çağırmıyor; silme kararı bilinçle
  insanda bırakıldı, ancak kuyruğa düşürecek job yazılmalı.
- **Kampanya/kupon yazma yolu yok.** Motor, tablolar ve şablonlar hazır;
  kampanya oluşturma ve kupon uygulama uçları hâlâ yazılmadı — yani çoklu site
  indirimi tanımlı ama **panelden aktive edilemiyor**.
- **Ek paket bakiyesi düşmüyor.** `tenant_addons.remaining_quantity` tutuluyor
  ama bildirim gönderimi onu azaltmıyor; `packages/notifications` tarafına
  düşme adımı eklenmeli.
- **Bu bölüm için entegrasyon testi yok.** Uçlar elle (curl + psql) doğrulandı;
  `tests/integration`'a yaşam döngüsü ve platform uçları için duman testi
  eklenmeli. §5.10.4'teki dört hata da tam olarak bu testin yakalayacağı
  türden — ve dördüncüsü testin **arşivlenmiş** bir siteyi de kapsaması
  gerektiğini gösteriyor: "her uç 200" yetmiyor, nullable alanların dolu
  olduğu durum ayrıca kurulmalı.
- `0009` ve `0010` **yerel** veritabanında çalıştırıldı (0008 dâhil, o da
  üretimde çalışmamıştı); üretime uygulanmadı.

---

## 5.11 Giriş parolaya taşındı, OTP tek bayrağa bağlandı (2026-07-30)

**Karar:** giriş artık **parola** soruyor. Tek kullanımlık kod ikinci adım ve
`AUTH_OTP_ENABLED` ile açılıp kapanıyor (varsayılan `false`).

**Neden:** SMS sağlayıcısı (Netgsm / İleti Merkezi) henüz sözleşmeye
bağlanmadı ve ikisi de boş. Boş bırakıldığında `packages/sms` konsola yazan
sağlayıcıya düşüyor — yani parolasız giriş, üretimde **kimsenin göremeyeceği**
bir koda dayanıyordu. Parola bu bağımlılığı kaldırıyor; sağlayıcı bağlanınca
ikinci faktör tek satır ortam değişkeniyle açılıyor.

### 5.11.1 Yapılanlar

- `POST /v1/auth/web/password` → yanıt `status: "session"` (oturum açıldı) ya
  da `status: "otp_required"` (kod gönderildi). **Bayrağı yalnız sunucu
  okuyor**: panel de okusaydı, oturumun açılıp açılmayacağı iki sürecin aynı
  değişkeni doğru okumasına bağlı olurdu.
- `POST /v1/auth/web/password/otp` → ikinci adım. Kodun amacı `login_otp`,
  parolasız akışın `otp`'sinden **ayrı**: aynı havuzu paylaşsalardı
  `web/request` ile parola bilmeden alınan bir kod ikinci faktörü geçerdi.
- Kayıt (`/kayit`) artık parola alıyor ve `checkPasswordPolicy` sunucuda
  uygulanıyor. Parola **yalnız yeni kullanıcıda** yazılıyor — var olan kaydın
  parolasını kayıt formundan ezmek, başkasının e-postasıyla hesap devralmak
  olurdu.
- `POST /v1/panel/portal/profile/password` + "Bilgilerim" ekranında parola
  kutusu. Parolası olanda mevcut parola zorunlu, olmayanda değil; kural şemada
  değil serviste, çünkü "parolası var mı" sorusunun cevabı veritabanında.
- Kullanıcı sayımına (enumeration) karşı: kayıtsız kimlik, parolasız hesap ve
  yanlış parola aynı 401'i veriyor **ve** kullanıcı bulunamadığında da scrypt
  çalıştırılıyor (`burnPasswordTime`). Aksi hâlde fark yanıt metninden değil
  **süresinden** okunurdu.
- Seed demo yöneticisine parola veriyor (`SEED_DEMO_PASSWORD`, varsayılan
  `OrnekSite2026`) ve konsola yazıyor.

### 5.11.2 Bilerek korunan yol ve kabul edilen risk

Parolasız akış (`web/request` + `web/verify`) **kaldırılmadı**: kayıt
doğrulaması ve "parolamı bilmiyorum" kurtarması ondan geçiyor, ilk parolayı
belirlemenin başka yolu yok. Karşılığı şu: e-posta kutusuna (ya da hatta)
erişen biri parolayı bilmeden de girebiliyor. Kapatmak isteniyorsa kurtarma
akışının ayrı bir bayrağa bağlanması gerekir — o zaman parolasını unutan
kullanıcının tek çıkışı yönetici olur.

### 5.11.3 Uçlar veritabanına karşı koşuldu

§5.10.4'ün dersi uygulandı; sekiz senaryo curl + psql ile doğrulandı: doğru
parola (oturum), yanlış parola ve olmayan kullanıcı (aynı 401), OTP açıkken
`otp_required` → konsol SMS kodu → oturum, aynı kodun ikinci kullanımı
(`used`), parolasız akıştan alınan kodun ikinci adımda reddi (`wrongPurpose`),
parola değiştirme (mevcut parola yok/yanlış/zayıf/geçerli) ve parolası olmayan
kullanıcının ilk parolasını belirlemesi. Bu turda yeni hata çıkmadı.

**Açık kalan:** bu akışın entegrasyon testi yok; `tests/integration`'a hem
`AUTH_OTP_ENABLED` kapalı hem açık durumla eklenmeli.

---

## 5.12 Üretim derlemesi koşuldu — worker `build`'i kırıyordu (2026-07-30)

`pnpm dev` dışında, gerçek build çıktısıyla çalıştırma denendi ve **derleme
hiç geçmiyordu**: `apps/worker` `RequestContext.tenantStatus` alanını
doldurmuyordu (§5.10'da eklenmişti). `tsx` tip kontrolü yapmadığı için
geliştirmede görünmüyor, `pnpm build`'de turbo'yu tümüyle durduruyordu — yani
**projenin üretim derlemesi bir süredir alınamıyordu.**

Düzeltmede uydurma değer kullanılmadı; durum gerçekten okunuyor:

- `JobRegistry` zaten yazılabilir siteleri (`trial`/`active`/`past_due`)
  sorguluyordu; aynı sorguya `status` eklendi. Sabit `"active"` yazmak,
  `past_due` bir sitenin job'ını kütükte olduğundan iyi göstermek olurdu.
  `only` (tek site) yolu da aynı sorgudan geçiyor: elle tetiklenen koşunun,
  zamanlanmış koşunun atladığı siteye yazması tutarsızdı.
- `EventProcessor` durumu olay yükünden değil, işi koştuğu anda veritabanından
  okuyor: olay kuyrukta beklerken site askıya alınmış olabilir. Sitesi
  silinmiş olay `tenant_missing` ile atlanıyor.

**Doğrulama (yerel üretim yığını):** `pnpm build` → `migrate` → api :3100,
worker, app :3001, web :3000, `NODE_ENV=production`, Redis + MinIO container.
`/health/ready` `database:true, redis:true`; worker zamanlanmış işleri 4 site
için koştu (`maintenance.reminders` ok:4); `/panel` oturum çerezi ile üretim
SSR'ından gerçek veriyle render oldu; parola ekranı ve giriş uçtan uca çalıştı.
Adımlar `CALISTIRMA.md`'ye yazıldı.

**Not:** `apps/api`'nin `migrate` npm betiği yalnız repo kökünden çalışıyor
(`packages/db/drizzle`'ı çalışma dizinine göre arıyor; container'da kök budur).
`pnpm --filter @yonetim/api migrate` bu yüzden yerelde hata veriyor —
düzeltilmedi, `CALISTIRMA.md`'de belgelendi.

---

## 5.13 Panelde iki sessiz kırık: sekmeler ve form başarı yolu (2026-07-30)

Kullanıcı bildirdi, üretim derlemesinde gerçek Chrome ile (CDP) tekrarlandı ve
düzeltildi. İkisi de "hata vermeyen" kırıklar: ekran bir şey söylemiyor, iş
olmuyor (ya da olduğu görünmüyor).

### 5.13.1 Sekmeler tıklamayı yutuyordu

`?sekme=` bağlantıları ilk tıklamadan sonra çalışmıyordu ("bazen çift tık,
bazen hiç"). Ölçüm: tıklama doğru `<a>`'ya ulaşıyor, `next/link`
`preventDefault` çağırıyor, RSC isteği gidip **200** dönüyor, adres ve içerik
değişmiyor. Gezinme yönlendiricinin içinde düşüyor.

- **Detay ekranları** (`sakinler/[id]`, `birimler/[id]`) artık hiç gezinmiyor:
  yeni `TabView` (`packages/ui`) panelleri sunucudan alıp istemcide değiştiriyor.
  Tüm veri zaten **tek** API çağrısıyla geliyordu — `birimler/[id]`
  başlığındaki "sekme geçişi anlık" notu bunu söylüyordu ama kod öyle
  çalışmıyordu. URL `history.replaceState` ile korunuyor: `?sekme=kvkk`
  paylaşılabilir ve yenilemede aynı sekme açılıyor.
- **Borçlar görünüm sekmeleri** her görünümde farklı veri çektiği için gezinmek
  zorunda; orada düz `<a>` kullanılıyor (`components/nav-tabs.tsx`) ve tam
  sayfa gezinme güvenilir çalışıyor.
- Denenip **işe yaramayanlar** (kayda geçsin diye): sekme şeridini `"use
  client"` yapmak ve `next/link`'i doğrudan import etmek. Sıralama başlıkları
  aynı sayfada sorunsuz çalışıyor, yani sorun "aynı yol + arama parametresi"
  gezinmesinin tamamında değil.

### 5.13.2 `revalidatePath` form başarı yolunu öldürüyordu

"Kaydettim ama form kapanmadı, işleniyor deyip kaldı" şikâyetinin sebebi:
server action `revalidatePath` çağırınca Next yanıtla birlikte ağacı yeniden
üretiyor, form yeniden monte oluyor ve `useActionState` durumu `idle`'a
düşüyor. Sonuç: sunucu `{"status":"ok"}` dönmesine rağmen `ActionForm`'un
başarı etkisi **hiç çalışmıyor** — bildirim yok, `onSuccess` yok (çekmece
kapanmıyor), yönlendirme yok. Kayıt ise atılmış oluyor.

Ölçüm tahsilat çekmecesinde yapıldı: `revalidatePath` varken çekmece açık
kalıyor ve bildirim çıkmıyor; çağrı kaldırılınca ikisi de çalışıyor.

`apps/app` aksiyonlarındaki **112 çağrı kaldırıldı** (30 dosya). Kayıp yok:
panelin **104 sayfasının tamamı** `force-dynamic`, yani geçersiz kılınacak bir
rota önbelleği hiç yoktu; tazeleme `ActionForm`'un başarıda çağırdığı
`router.refresh()` ile, yanıttan sonra yapılıyor. Gerekçe `action-form.tsx`
başlığında — yeni aksiyon yazan kişi oraya bakmalı.

`components/shell/actions.ts`'teki iki çağrı **duruyor**: bildirim rozetini
tazeliyorlar ve bir forma bağlı değiller.

### 5.13.3 Sakin formunda ölü karşılaştırma

"Bağımsız bölüm yok" seçildiğinde form "işaretli alanları düzeltin" diyor ama
hiçbir alan işaretlenmiyordu. Şema `relation` için `"vacant"` bekliyordu, form
`"none"` gönderiyordu — `vacant` birimin `ownershipType` sözlüğünden gelme,
sakin ilişkisiyle karışmış. Hata `relation` alanına düşüyor, ekranda o adla
alan olmadığı için görünmüyordu. Enum düzeltildi, `errorMap` eklendi (ham Zod
metni "Invalid enum value…" kullanıcıya gösteriliyordu) ve radyo grubu
`FormField` ile sarıldı.

### 5.13.4 Doldurulmamış çeviri yer tutucuları

`app.expenses.description` ekranda ham anahtar olarak görünüyordu: mesaj
`{count}` bekliyor, çağrı argümansız. Tarama yazıldı ve **yedi** örnek çıktı
(`polls.closesAt` form etiketi olarak, `reservations.capacity` yanlış argüman
adıyla, `legal.candidatesDescription` argümansız, birim kalıbı ipuçlarında
ICU kaçışı eksik…). Hepsi düzeltildi; tarama artık sıfır sonuç veriyor ve
tekrarını yakalamak için `pnpm test` içindeki mesaj paritesi testi zaten
yer tutucu tutarlılığını kontrol ediyor.

### 5.13.5 Sırada

- **Tahsilat girişi** artık sakin ve birim ekranlarından açılıyor
  (`components/collect-payment.tsx`); eskiden yalnız borç detayındaydı.
  Çok birimli sakinde önce birim seçiliyor. Sakin detayının borç satırları
  bunun için `unitId` de taşıyor (daire **numarası** birim kimliği değil).
- Bu bölümün hiçbiri için otomatik test yok; doğrulama tarayıcıda elle
  (CDP betikleri) yapıldı. Sekme geçişi ve form başarı yolu, `tests/` altına
  bir Playwright/CDP duman testi olarak eklenmeye değer — ikisi de tip
  kontrolünden ve birim testlerinden geçen, yalnız tarayıcıda görünen
  kırıklardı.

---

## 5.14 Kasa: "tahsilat girdim ama bakiye 0" (2026-07-30)

Kullanıcı bildirdi: `/panel/banka` hesap listesindeki **Bakiye** sütunu, tahsilat
girilmiş bir sitede 0 ₺ gösteriyordu.

**Sebep.** O sütun `bank_accounts.balance_kurus` alanını okuyordu. Bu alan
yalnız **open banking senkronizasyonu** yazıyor; panelden tahsilat ya da gider
girilince hiç değişmiyor. Sağlayıcı bağlı olmayan her sitede kalıcı olarak
sıfır. Yani sütun yanlış hesaplanmıyordu — yanlış soruyu cevaplıyordu.

Veritabanında doğrulandı (demo kiracı): `bank_accounts.balance_kurus = 0` iken
`payments` tablosunda 3.650 ₺ tamamlanmış tahsilat vardı.

**Yapılan.** Bakiye artık **sitenin kendi kayıtlarından** türetiliyor
(`IntegrationService.bankOverview` → `cashbox`):

- **giren** = `status = 'completed'` tahsilatlar, `refunded_kurus` düşülmüş.
  `initiated`/`failed` sayılsaydı kasa hiç gerçekleşmemiş parayla şişerdi.
- **çıkan** = `paid_at IS NOT NULL` olan, reddedilmemiş giderler.
  Ölçüt `status = 'paid'` **değil**: iki alan formda bağımsız doldurulabiliyor
  ve ikisini birlikte şart koşmak "durumu ödendi ama kutusu işaretsiz"
  kayıtları hem çıkan hem ödenmemiş havuzunun dışında bırakıyordu.
- Kovalama tek `GROUP BY` ile: `COALESCE(bank_account_id::text, …)`. Hesap
  başına ayrı sorgu atılmıyor. Kova adları sorguya **düz metin** giriyor;
  `${}` ile verilseydi bağlı parametre olur ve `GROUP BY` içinde tipi belirsiz
  kalırdı.

Ekranda üç satır türü var: her banka hesabı, **nakit kasa** (hesap seçilmeden
girilen kayıtlar) ve **hesabı belirtilmemiş** (nakit olmadığı hâlde hesabı
seçilmemiş — kalırsa düzeltilmesi gereken bir durum, sessizce nakde yazmak
kasayı yanıltırdı). Altında toplam satırı. Silinmiş hesaba bağlı kayıtlar
"hesabı belirtilmemiş" havuzuna katlanıyor; kovası düşürülse toplam eksik
kalırdı.

**Bankadan gelen bakiye ayrı sütunda duruyor, birleştirilmedi.** İki rakamın
çelişmesi bilgi: fark, kayda geçmemiş bir hareket ya da eksik mutabakat
demektir. Sağlayıcı bağlı değilse "Bağlantı yok" yazıyor — sıfır göstermek tam
olarak şikâyet edilen yanılgıydı.

**Ödenmemiş gider** ayrı gösteriliyor: kasadan çıkmadığı için bakiyeye
girmiyor ama yöneticinin bileceği bir yük. Gösterilmeseydi "girdiğim gider
nerede" sorusu doğardı.

**Hesap listesindeki Bakiye sütunu kaldırıldı.** Aynı ekranda iki farklı
anlamda bakiye göstermek, tam da şikâyet edilen karışıklığı üretiyordu. O kart
artık yalnız hesabın **tanımı** (banka, IBAN, amaç); paranın hareketi kasa
kartında.

**Giderde ödeme kaynağı.** `expenses.bank_account_id` şemada vardı ama hiçbir
yerden yazılmıyordu; `paid_via` serbest metin ("havale") hangi hesap olduğunu
söylemiyor. Alan sözleşmeye, yazma deposuna ve gider formuna eklendi (boş =
nakit kasa). Hesap listesi dört ekranı besliyor, bu yüzden
`apps/app/src/lib/bank-accounts.ts` altında tek yerde: `bank:read` yetkisi
yoksa liste boş dönüyor ve alan hiç sorulmuyor — gider girebilen ama banka
modülünü görmeyen kullanıcı kaydını yine de tamamlayabilmeli. Düzenlemede
kapatılmış hesap seçenek olarak kalıyor; aksi hâlde form sessizce "nakit"e
düşer ve dokunulmamış bir alanı bozardı.

**Test yok.** Doğrulama şema + gerçek veriyle SQL üzerinden yapıldı; kasa
toplamları `tests/` altına birim testi olarak eklenmeye değer.

---

## 6. Bekleyen ürün kararları (Track E — teknik altyapı hazır, karar bekliyor)

Bu maddeler **yapılmadı** çünkü kod değil, iş kararı eksik. Karar verilirse
her biri artık tek modül işi (altyapı: contracts, worker, iptal/ilerleme hazır).

| Madde | Bekleyen karar |
| --- | --- |
| Borcu Yoktur PDF + KEP | KEP sağlayıcısı (PTT/TNB?), PDF saklama politikası, Türkçe font lisansı |
| Bakım hatırlatma (T-30/-15/-7/-0/+3) | Hatırlatma kime gidecek (yönetici mi görevli mi), kanal önceliği |
| ~~Sakin portalı kapsamı~~ | **karara bağlandı** (§5.8.2): görüntüleme + talep açma + yazışma yapıldı; **oylama ve ödeme** hâlâ açık (§5.8.7) |
| ~~Site kapatma / abonelik birimi / ek paket~~ | **karara bağlandı** (§5.10.2): abonelik site başına; arşiv → 90 gün → kalıcı silme; `tenant_addons` ile SMS/WhatsApp kredisi satılıyor |
| Sakin IBAN görünürlüğü | "Yönetim bilgileri" ekranı IBAN'ı maskeli gösteriyor (yönetim ekranıyla aynı çizgi), ama ekranın amacı "nereye yatıracağım". Açık IBAN gösterilecek mi? |
| Göç sihirbazı (Excel import) | Kabul edilecek şablonlar, çakışma politikası (üzerine yaz / atla / sor) |
| Personel bordrosu | Tam SGK/vergi hesabı mı, yalnız kayıt mı |
| Landing builder | Blok kütüphanesi kapsamı, yayınlama akışı |

Öncelik sırası (GAP-ANALYSIS §6'yı izler, rakip bulgularıyla güçlendirildi):
1. Borcu Yoktur PDF/KEP + bütçe simülatörü
2. Bakım planı + duyuru zamanlama
3. WhatsApp paneli + talep/SLA + KVKK gelen kutusu
4. ~~**Sakin portalı**~~ → **büyük kısmı yapıldı** (§5.8.2). Ayrı bir istemci
   olarak değil, panelin rol duyarlı hâli olarak kuruldu: tek kabuk, tek
   bildirim zili, tek tema/erişilebilirlik ayarı. Kalan: oylama + ödeme (§5.8.7)
5. Rezervasyon takvimi + sayaç okuma + banka eşleştirme
6. Bordro + anket/toplantı/hukuk tam akış + denetim diff görselleştirme
7. Raporlar modülü (+ rakipten gelen **Muhasebe Raporları** fikri burada
   değerlendirilmeli) + widget dashboard + göç sihirbazı
8. Landing builder + `apps/web` motion genişletmesi

---

## 7. Hâlâ açık, küçük teknik borçlar

- ~~`pnpm lint` CI adımı değil~~ → **kapatıldı** (§2.7): adım zaten vardı,
  eksik olan workflow dosyasının kurulmamış olmasıydı; `.github/workflows/ci.yml`
  eklendi ve CI'a uygulama tip kontrolü de kondu
- ~~`jest-axe` erişilebilirlik smoke testi yazılmadı~~ → **kapatıldı** (§2.7):
  `axe-core` ile `tests/a11y-smoke.test.tsx`
- **`siteConfig.payroll` yer tutucu değerler içeriyor** — kıdem tazminatı
  tavanı ve ihbar gelir vergisi oranı üretime çıkmadan **güncel resmî
  değerlerle** doldurulmalı. Tavan 6 ayda bir değişiyor; yürürlük tarihi
  ekranda gösteriliyor ama değerin kendisi doğrulanmadı
- 375px mobil kart görünümü, JS-kapalı akış, klavye turu paneldeki tüm
  ekranlarda **ölçülmedi** (kod yolu Faz 1'dekiyle aynı ama panelde tarayıcıda
  doğrulanmadı). Yeni gelen `/panel/demirbas` ve `/panel/karar-defteri`
  ekranları da bu kapsamda
- 16 worker job'ı hâlâ `skipped: no_handler` (Track E maddeleriyle birlikte dolacak)
- Demirbaş ve Karar Defteri için **entegrasyon testi yok**; karar defterinin
  değişmezlik trigger'ı elle (psql) doğrulandı, `tests/integration`'a taşınmalı
- **`tsconfig.check.json` uygulamaları kapsamıyor** — `packages/*` ve `tests/`
  dışında kalan `apps/api` ve `apps/app` ayrı ayrı kontrol edilmek zorunda
  (§5.7 sonundaki uyarı). Kök komut tek başına "temiz" dediğinde uygulamalarda
  hata olabilir; `pnpm typecheck` bu üçünü birlikte çalıştıracak şekilde
  düzeltilmeli
- **Sakin portalı ve erişim talebi için entegrasyon testi yok** (§5.8.7) —
  kapsam sınırı ve onay akışı yalnız elle doğrulandı. §5.9.1'den sonra bu
  madde artık teorik değil: uçların bir kez bile veritabanına karşı
  koşulmaması kullanıcıya 500 olarak yansıdı
- `0008_access_requests` migration'ı **üretim veritabanında çalıştırılmadı**;
  bu oturumda yalnız yazıldı ve tip/lint kapılarından geçirildi

---

## 8. Bu dosyayı güncel tutma kuralı

Yeni bir karar alındığında veya bir madde tamamlandığında **önce burası**
güncellenir; ayrıntılı gerekçe gerekiyorsa ilgili eski plan dosyasına link
verilir. Beş dosyaya (`GAP-ANALYSIS`, `GAP-DURUM`, `MIMARI-PLAN`,
`UI-MODERNIZASYON-PLANI`, `RAKIP-ANALIZI...`) paralel yeni madde eklemek
yerine, o dosyalar **kapandı** sayılır — yalnız tarihsel referans olarak kalır.
