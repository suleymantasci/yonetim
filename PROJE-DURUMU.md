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
  adayları çıkardı** — bunlar henüz **yapılmadı**, §5'te tek listede.
- **Kalan büyük iş (Track E):** teknik altyapı hazır ama her biri bir ürün
  kararı bekliyor — PDF/KEP, bakım hatırlatma, sakin portalı kapsamı, göç
  sihirbazı, bordro kapsamı, landing builder (bkz. §6).

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
| Kıdem/ihbar tazminatı | `packages/core/src/severance.ts` + 17 birim testi + `POST /v1/panel/staff/tazminat` + personel ekranı widget'ı | Kanunda sabit olanlar (30 gün/yıl, ihbar kademeleri, damga vergisi ‰7,59, kıdemin gelir vergisi istisnası) kodda; **yılda bir/iki kez değişenler** (kıdem tavanı, gelir vergisi oranı) `siteConfig.payroll`'da tarih damgalı ve ekranda gösteriliyor. Sonuç `isEstimate: true` — bordro değil |
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
karar verilmedi**): §6'daki Track E listesi.

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

## 5. Bekleyen ürün kararları (Track E — teknik altyapı hazır, karar bekliyor)

Bu maddeler **yapılmadı** çünkü kod değil, iş kararı eksik. Karar verilirse
her biri artık tek modül işi (altyapı: contracts, worker, iptal/ilerleme hazır).

| Madde | Bekleyen karar |
| --- | --- |
| Borcu Yoktur PDF + KEP | KEP sağlayıcısı (PTT/TNB?), PDF saklama politikası, Türkçe font lisansı |
| Bakım hatırlatma (T-30/-15/-7/-0/+3) | Hatırlatma kime gidecek (yönetici mi görevli mi), kanal önceliği |
| Sakin portalı kapsamı | Yalnız görüntüleme mi, talep açma + oylama da mı |
| Göç sihirbazı (Excel import) | Kabul edilecek şablonlar, çakışma politikası (üzerine yaz / atla / sor) |
| Personel bordrosu | Tam SGK/vergi hesabı mı, yalnız kayıt mı |
| Landing builder | Blok kütüphanesi kapsamı, yayınlama akışı |

Öncelik sırası (GAP-ANALYSIS §6'yı izler, rakip bulgularıyla güçlendirildi):
1. Borcu Yoktur PDF/KEP + bütçe simülatörü
2. Bakım planı + duyuru zamanlama
3. WhatsApp paneli + talep/SLA + KVKK gelen kutusu
4. **Sakin portalı** (en büyük parça — aynı API'yi tüketen ikinci istemci)
5. Rezervasyon takvimi + sayaç okuma + banka eşleştirme
6. Bordro + anket/toplantı/hukuk tam akış + denetim diff görselleştirme
7. Raporlar modülü (+ rakipten gelen **Muhasebe Raporları** fikri burada
   değerlendirilmeli) + widget dashboard + göç sihirbazı
8. Landing builder + `apps/web` motion genişletmesi

---

## 6. Hâlâ açık, küçük teknik borçlar

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

---

## 7. Bu dosyayı güncel tutma kuralı

Yeni bir karar alındığında veya bir madde tamamlandığında **önce burası**
güncellenir; ayrıntılı gerekçe gerekiyorsa ilgili eski plan dosyasına link
verilir. Beş dosyaya (`GAP-ANALYSIS`, `GAP-DURUM`, `MIMARI-PLAN`,
`UI-MODERNIZASYON-PLANI`, `RAKIP-ANALIZI...`) paralel yeni madde eklemek
yerine, o dosyalar **kapandı** sayılır — yalnız tarihsel referans olarak kalır.
