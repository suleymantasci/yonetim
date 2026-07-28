# UI Modernizasyon Planı — `apps/web` (landing) + `apps/app` (panel)

> Durum: Faz 0 tamam (grafik katmanı hariç, o Faz 2'ye alındı). **Faz 1 tamam** —
> landing kabuğu, ana sayfa ve tüm alt sayfalar yeniden yazıldı.
> Sıradaki: F0.3 (grafik katmanı) ve Faz 2 (panel).
> Uygulama sırasında alınan kararlar için "Uygulama sırasında alınan revizyonlar".
> İlgili belgeler: `MIMARI-PLAN.md` §12–15, `GAP-ANALYSIS.md` §4.5, `GAP-DURUM.md` §2.

---

## Bağlam

Ürün, apartman/site yönetimi SaaS'ı. İşlevsel olarak olgun: 63 tablolu şema, NestJS API,
19 zamanlanmış iş, RLS ile çok kiracılı izolasyon, KVKK/KMK'ya kadar inen iş kuralları.
Sorun işlevde değil, **yüzde**:

- `apps/web` landing sayfası (`src/app/[locale]/page.tsx`, 156 satır) tamamen statik Tailwind
  kutu-grid'i. Tek bir görsel, video, animasyon veya etkileşim yok. `GAP-ANALYSIS.md` §4.5 bunu
  zaten yazmış: *"tamamen statik Tailwind sınıfları; hiçbir görsel, video, motion yok."*
- `apps/app` panelinde grafikler tek dosyada (816 satırlık `packages/ui/src/components/chart.tsx`)
  elle çizilmiş SVG; sabit `width=640` viewBox, 5 sabit ızgara çizgisi, elle `niceCeil()`.
  Doğru ama görsel olarak 2015 seviyesinde.
- Tablolarda ortak `DataTable` **ölü kod**; 4 zengin liste ekranı aynı davranışı ayrı ayrı
  kopyalamış.
- Rakiplerin (Apsiyon, Biyos, Yönetimcell vb.) tasarımı da eski — bu, ayrışma için gerçek bir
  fırsat. SEO'da yukarı çıkmak kadar **ilk 5 saniyede beğenilmek** de dönüşümü belirliyor.

Hedeflenen sonuç: kurumsal kimliği ve bilgi yoğun anlatımı koruyarak, hareketli ve etkileşimli
bir landing; panelde okunabilir, modern grafikler ve tek bir tablo mimarisi.

---

## Bu repoda ihlal edilemeyecek kısıtlar

Bunlar yorum değil, `pnpm test` / `pnpm arch` ile makine tarafından denetleniyor:

| Kısıt | Nerede denetleniyor |
|---|---|
| Hiçbir dosyada `dark:` varyantı yok | `tests/design-tokens.test.ts` |
| Ham Tailwind palet rengi yok (`bg-slate-800` vb.) | aynı test |
| Sabit hex/rgb yok (tek muafiyet `apps/app/src/app/global-error.tsx`) | aynı test |
| Açık/koyu tema **aynı** `--t-*` token kümesini tanımlar, hepsi `@theme inline`'da | aynı test |
| `apps/app` → `@yonetim/db` / `drizzle-orm` (dolaylı dahil) yasak | eslint + `.dependency-cruiser.cjs` |
| TR/EN içerik paritesi, minimum içerik hacmi | `tests/content.test.ts` |
| `apps/web`'de yeni `"use client"` + `useTranslations("x")` → `x` `client-namespaces.ts`'te olmalı | `tests/i18n-client.test.ts` |
| Kullanılan her çeviri anahtarı mesaj paketinde var | `tests/i18n-keys.test.ts` |

`MIMARI-PLAN.md` §12.1'de "kaybedilirse geçiş başarısız sayılır" denen beş madde — hepsi korunacak:
`tokens.css`; a11y tercihleri (`data-font-scale`/`data-contrast`/`data-motion`);
doğrulanmış 6 renkli grafik paleti (komşu çiftlerde OKLab ΔE ≥ 8); TR'ye özgü alanlar
(TCKN/IBAN/telefon/MoneyInput/PeriodInput); **`ChartFrame`'in zorunlu tablo görünümü**.

---

## Alınan kararlar

| Konu | Karar |
|---|---|
| Bağımlılık politikası | **Seçici izin**: motion + grafik kütüphanesi serbest. UI kit, tablo lib, ikon paketi yasak kalıyor. |
| Grafik motoru | **Recharts** (SSR kaybı ve ~95 kB bedeli bilinerek seçildi; §"Riskler"deki azaltmalarla) |
| Tema | **Çift tema** — açık + koyu tam destek (mimari zaten `data-theme` + semantik token; yeni iş değil, her bölümün iki temada da tasarlanması) |
| Marka | **Palet tazelenecek** + eksik marka varlıkları üretilecek |
| Sosyal kanıt | İskelet kurulacak, içerik boş dizi kalacak — uydurma referans/logo/müşteri sayısı yazılmayacak |
| Sıra | **Önce ortak temel** (`packages/ui`) → landing → panel → temizlik |

**Kapsam dışı bırakılan:** C4 (react-hook-form). Gerekçesi hâlâ geçerli — aynı kuralları istemcide
ikinci kez yazmak, +14 kB ve JS kapalıyken çalışmayan form. İzin motion + grafik içindi.

### Uygulama sırasında alınan revizyonlar

| # | Revizyon | Gerekçe |
|---|---|---|
| R1 | **Motion yalnız `apps/web`'de.** Kütüphane (`motion`) pazarlama sitesinin bağımlılığı; panelde animasyon motoru yok. Hareket **tercihi** (`MotionProvider`, `useReducedMotionPreference`) `packages/ui`'de kalır, çünkü panel de aynı a11y anahtarını okur. | Panelde hareket bir anlatı aracı değil; motoru oraya taşımak karşılıksız bundle demekti. Ölçüm: motion çekirdeği +11 kB, özellik paketi hidrasyon sonrası 62.8 kB. |
| R2 | **Sıra değişti: landing öne alındı.** F0.4 (ortak primitifler) → Faz 1 (landing) → F0.3 (grafikler) → Faz 2 (panel). | Motion artık panele dokunmadığı için grafik katmanı landing'i bloklamıyor; landing öncelikli. |
| R3 | **Bundle bütçesi ve `pnpm lint` kapıları Faz 3'ten öne çekildi.** | Faz 0 sırasında `packages/ui` barrel'ından yapılan tek bir `export *`, pazarlama sitesinin ilk yükünü 137 → 184 kB'ye çıkardı ve hiçbir kapı görmedi. |
| R4 | **Palet aday A uygulandı** ve kontrast kapısı **dört mevcut a11y hatası** buldu: `secondary/secondary-fg` 2.43:1, `border-strong/surface` 1.48:1, `ring/canvas` 2.32:1, `danger/primary-fg` 3.76:1. Dördü de düzeltildi. | Hatalar palet değişiminden önce de vardı; kapı olmadığı için görünmüyorlardı. |
| R5 | **`@yonetim/ui` barrel'ından `export *` yasağı.** Hareket katmanı `@yonetim/ui/motion` alt yolundan alınır. | `"use client"` modülleri istemci sınırının ötesinde ağaç sarsımına uğramıyor; kökten tek bir `cn` ithali tüm istemci modüllerini paylaşılan parçaya çekiyordu. |
| R6 | **Kampanyalarda geri sayım yapılmadı.** Plan §1.3 "süreli kampanyada geri sayım" diyordu; `CAMPAIGN_TEMPLATES` yalnız şablon taşıyor, bitiş tarihi (`endsAt`) somut `Campaign` kaydında ve veritabanında. | Pazarlama sayfasına uydurma bir bitiş tarihi yazmak, sosyal kanıtta uydurma sayı yazmakla aynı şey. Yerine kampanyanın **ödülü** kartın en büyük öğesi yapıldı ve gerçek olan kısıt (`firstNTenants`, taahhüt süresi) koşullar listesinde gösterildi. |
| R7 | **Okuma ilerleme çubuğu JS yerine CSS'te.** `animation-timeline: scroll()`; `useScroll` + `useSpring` kaldırıldı. | Ölçüldü: bu iki yardımcı **her route'un** paylaşılan parçasına ~6 kB ekliyordu (209 → 214,7 kB), çünkü hareket modülü kök layout'tan çekiliyor. Dekoratif bir çizgi için kabul edilemez. Destekleyemeyen tarayıcıda çubuk hiç görünmez. |
| R8 | **`apps/web/src/components/motion` yüzeyi ikiye indirildi** (`m`, `AnimatePresence`). | Aynı ölçüm: bu modül paylaşılan parçada olduğu için buraya eklenen ve bir yerde kullanılan her yardımcı tüm route'ları büyütüyor. |

---

### Uygulama sırasında bulunan kusurlar

Planlanmamıştı; kod okunurken ya da ölçüm yapılırken ortaya çıktılar.

| Bulgu | Etki | Durum |
|---|---|---|
| **Tailwind `packages/ui`'yi hiç taramıyordu.** v4 tarama, CSS dosyasının projesinden başlar ve `node_modules`'ı atlar; workspace paketi orada sembolik bağ. | Yalnız pakette geçen her sınıf sessizce üretilmiyordu: `motion-safe:animate-[overlay-zoom_…]` ve kardeşleri hiç CSS'e girmemiş — **modal/drawer/sheet/toast animasyonları yazıldıkları günden beri çalışmıyordu**. Paket içindeki keyfi değerler (`h-[75rem]`) de boyutsuz kalıyordu. | Düzeltildi (`@source`), test kapısı eklendi |
| `secondary/secondary-fg` 2.43:1 | Turkuaz buton üstünde beyaz metin okunmuyordu | Düzeltildi |
| `border-strong/surface` 1.48:1 (açık), 1.89:1 (koyu) | Girdi alanı ve outline buton sınırı WCAG 1.4.11'in altında | Düzeltildi |
| `ring/canvas` 2.32:1 | Odak halkası yeterince görünmüyordu | Düzeltildi |
| `danger/primary-fg` 3.76:1 | Tehlike butonu AA'nın altında | Düzeltildi |
| `pageMeta()` sabit `og-default.png` yazıyordu | Dosya hiç yoktu; üstelik route-segment OG dosya kuralını da eziyordu | Düzeltildi |
| `Counter` negatif değer gösteriyordu | `requestAnimationFrame` zaman damgası, zamanlayıcı kurulurken okunan `performance.now()`tan küçük olabiliyor → negatif ilerleme | Düzeltildi |
| Barrel'dan `export *` | Kökten tek bir ithal, tüm istemci modüllerini paylaşılan parçaya çekiyordu (137 → 184 kB) | Düzeltildi, alt yol ihracı |
| **`Reveal` atlamalı kaydırmada içeriği kalıcı gizli bırakıyordu.** `threshold: 0.15` kullanan gözlemci, "kesişme oranı 0 → 0" geçişinde hiç ateşlenmiyor. | Bir çapa bağlantısına tıklandığında ya da tarayıcı kaydırma konumunu geri yüklediğinde **aradan atlanan bloklar bir daha görünmüyordu**. Tarayıcıda ölçüldü: `/ozellikler` sayfasında y=2000'e atlayınca 4–7. kartlar boş kaldı. | Düzeltildi ve doğrulandı: kök payı (`rootMargin` üst kenar) + `boundingClientRect.top < 0` emniyeti |
| **Yapışkan tablo başlığı 64px aşağı kayıyordu.** Sarmalayıcıdaki `overflow-hidden` bir kaydırma kabı yaratıyor; `top: 64px` görüş alanından değil tablonun tepesinden ölçülüyordu. | Başlık satırı ilk veri satırının üstüne biniyordu. Ölçüldü: tablo tepesi 50px, başlık 114px olması gerekirken 64px. | Düzeltildi: `overflow-hidden` kaldırıldı, köşeleri hücreler yuvarlıyor (`rounded-ss-*` ailesi) |
| **Başlıktaki iki `bg-*` sınıfı çakışıyordu.** `headCell` içindeki `bg-surface-sunken`'a "biz" sütunu için `bg-primary-soft` **ekleniyordu**. | Kazananı sınıf listesindeki sıra değil üretilen CSS'teki sıra belirliyor; gövdede mavi şeritli sütun, başlığında şeritsiz hücre — sütun kaymış görünüyordu. | Düzeltildi: zemin tek yerden, koşullu |
| **`border-collapse` yapışkan başlığın alt çizgisini yutuyordu.** Toplu kenarlık modelinde kenarlık tabloya aittir, yapışkan hücreyle hareket etmez. | Satırlar başlığın altına çizgisiz giriyordu. | Düzeltildi: `border-separate border-spacing-0`, kenarlıklar hücrelerde |
| **`renderMarkdown` başlık ile gövdeyi ayıramıyordu.** Bölümleyici boş satıra göre ayırıyor; `packages/kvkk` metinlerinde başlıktan sonra tek satır sonu var. | KVKK sayfasında **her bölümün tamamı dev bir başlık** olarak render ediliyordu; listeden sonra gelen cümle de tüm listeyi paragrafa düşürüyordu. | Düzeltildi: `normalizeBlocks` |
| `enum.migrationSource` içinde `diger` yoktu | Kampanya koşullarında ham anahtar ("diger") kullanıcıya görünen metne sızıyordu | Düzeltildi: anahtar eklendi, özel durum kaldırıldı |
| Çeviri dizesi içinde süsleme | `seeConditions` "Koşulları gör →" ve `step1..4Title` "1. Dışa aktarın" — ikisi de bileşendeki ikon/rozetle çakışıp çift görünüyordu | Düzeltildi: süsleme dizeden çıkarıldı, bileşende kaldı |
| Yüzde biçimi elle yazılmıştı | `+%4` İngilizce sayfada da Türkçe biçimde görünüyordu | Düzeltildi: `Intl.NumberFormat(locale, {style:"percent"})` |
| Karşılaştırma tablosu ekran okuyucuya **boş** görünüyordu | "Var" hücresi `<span aria-hidden>✓</span>`, "yok" hücresi yalnız `aria-hidden` bir tire içeriyordu; tablonun tamamı erişilebilirlik ağacında boş hücrelerdi | Düzeltildi: her hücrede işaretle birlikte okunabilir metin (`var`/`yok`) |
| İki tabloda `overflow-x-auto` + `min-w-[…]` | Telefonda altı sütun yana kaydırılarak okunuyor, başlık satırı görüş alanından çıkınca hangi sayının ne olduğu kayboluyordu. Ayrıca yatay taşma kuralı dikey yapışmayı da `auto` yaptığı için `sticky` başlık sessizce ölürdü. | Düzeltildi: `md`/`lg` altında kart görünümü, üstünde kaydırma kabı olmayan tablo + `sticky top-16` başlık |
| NPS ölçeğinde uç etiketi yoktu | Çıplak bir 0–10 satırında hangi ucun "iyi" olduğu belirsiz; yanlış yönde okunan bir NPS ölçeği veriyi sessizce bozar | Düzeltildi: `fieldset`/`legend` + iki uç etiketi |

## Faz 0 — Ortak temel (`packages/ui`, `packages/config`)

### 0.1 Marka paleti + eksik varlıklar

Bugünkü `#0F4C81`, orta açıklıkta doygunluğu düşük bir lacivert — "kurumsal bankacılık" hissinin
kaynağı bu. Tek dosya değişiyor: `packages/config/src/site.ts` → `design.colors`.
(`apps/web/src/app/[locale]/layout.tsx` ve `apps/app/src/app/layout.tsx` bu değerleri `<head>`'e
`--brand-primary/secondary/accent` olarak zaten enjekte ediyor; başka yer dokunulmuyor.)

**Faz 0'ın karar kapısı — üç aday, kod yazılmadan seçilecek:**

| Aday | primary | secondary | accent | Karakter |
|---|---|---|---|---|
| **A — Marka/aksiyon ayrımı** *(öneri)* | mürekkep lacivert `#0B3A66` | aksiyon mavisi `#2563EB` | amber `#F59E0B` | Lacivert kimlik/tipografi rengi olur, CTA'lar canlı maviye geçer. En düşük risk, en yüksek "modern" kazancı. |
| **B — Indigo** | `#2B4EE6` | turkuaz `#06B6D4` | amber `#F59E0B` | Belirgin, güncel SaaS çizgisi. Kurumsal ciddiyetten bir miktar uzaklaşır. |
| **C — Petrol** | `#0B3B4A` | turkuaz `#22D3EE` | amber `#F59E0B` | Sakin, "altyapı" hissi. En muhafazakâr tazeleme. |

A seçilirse `tokens.css`'e yeni bir semantik rol çifti girer (`--t-action`, `--t-action-hover`,
`--t-action-fg`, `--t-action-soft`, `--t-action-soft-fg`) — açık **ve** koyu temada, ve
`@theme inline`'da; aksi hâlde token-paritesi testi kırılır.

**Değişmeyecek:** `--t-chart-1..6`, `--t-seq-1..7`, `--t-div-*`. Bunlar renk körlüğü ayrımı için
doğrulanmış; `tokens.css` kendi başlığında "kozmetik değildir, değiştirilmemelidir" diyor.

**`tests/design-tokens.test.ts`'e yeni assert:** her `*-fg` / zemin çifti için WCAG AA kontrast
(metin ≥ 4.5:1, büyük metin/ikon ≥ 3:1) — `primary/primary-fg`, `primary-soft/primary-soft-fg`,
`accent/accent-fg`, `action/*`, dört durum üçlüsü — **hem açık hem koyu** temada. Palet değişimi
bir daha sessizce kontrast kıramaz.

**Üretilecek varlıklar** (bugün `apps/web/public/` dizini **hiç yok**, üç referans 404 dönüyor):

```
apps/web/public/logo-light.svg · logo-dark.svg   (işaret + wordmark, currentColor ile)
apps/web/public/icon.svg · favicon.ico · apple-icon.png
apps/app/public/icon.svg · favicon.ico
apps/web/src/app/[locale]/opengraph-image.tsx            (next/og, ImageResponse)
apps/web/src/app/[locale]/blog/[slug]/opengraph-image.tsx
```

`packages/seo/src/meta.ts`'teki `${baseUrl}/og-default.png` varsayılanı route-segment OG
görsellerine bırakılır. `site-header.tsx`'teki sentetik "Y" harf işareti gerçek logoyla değişir.

### 0.2 Motion katmanı — `packages/ui/src/motion/*`

Yeni bağımlılık: **`motion`** (framer-motion'ın yeni paket adı). `LazyMotion` + `domAnimation`
ile ~6 kB gz; `m.*` bileşenleri kullanılır, `motion.*` değil (tüm feature bundle'ını çeker).

**En kritik nokta — mevcut a11y katmanıyla köprü.** Repo bugün hareketi
`<html data-motion="reduced">` + `prefers-reduced-motion` ile CSS üzerinden kapatıyor
(`tokens.css`, tüm süreleri `0.01ms`'ye zorluyor). JS tabanlı animasyonlar bu kill-switch'i
**görmez**. Bu yüzden:

```
motion/motion-provider.tsx   "use client"
  LazyMotion(features=domAnimation, strict)
  + MotionConfig reducedMotion={dataMotion === "reduced" ? "always" : "user"}
```
`data-motion` değeri `packages/ui/src/theme/a11y.ts`'teki mevcut çerezden (`yonetim_a11y`,
`md|hc0|rm0`) okunur — ikinci bir kaynak yaratılmaz. Provider her iki app'in kök layout'una girer.

Yeni ortak bileşenler (hepsi `reducedMotion` altında son durumu anında gösterir):

| Bileşen | İş |
|---|---|
| `<Reveal>` | viewport'a girince fade + hafif yukarı kayma, `once` |
| `<Stagger>` | çocuklarını sırayla açar (kart grid'leri) |
| `<Counter>` | sayı sayma; `Intl.NumberFormat` ile locale'e uygun, kapalıyken direkt son değer |
| `<Marquee>` | sonsuz yatay şerit; kapalıyken statik grid'e düşer, `aria-hidden` kopya |
| `<GradientMesh>` | dekoratif arka plan (CSS radial-gradient katmanları, token renkleri), `aria-hidden` |
| `<Magnetic>` / `<Spotlight>` | kart hover mikro-etkileşimi (yalnız `pointer: fine`) |

Süre/easing token'ları `tokens.css`'e girer (`--motion-fast/base/slow`, `--ease-out-expo` …) ki
CSS ve JS animasyonlar aynı ritimde olsun.

### 0.3 Grafik katmanı — Recharts geçişi

`packages/ui/src/components/chart.tsx` (816 satır) üçe bölünür:

```
chart/frame.tsx    ChartFrame + ChartTable + seriesColor + CHART_SERIES_LIMIT
                   ← tablo görünümü BURADA kalır; Recharts'a bağımlı değil
chart/marks.tsx    "use client" — Recharts sarmalayıcıları
chart/lazy.tsx     "use client" — next/dynamic(..., { ssr:false, loading: sabit yükseklikli iskelet })
```

**Korunacak sözleşmeler** (30'a yakın çağrı yeri kırılmasın diye dış API aynı kalır):
`seriesColor(index)`, `CHART_SERIES_LIMIT = 6`, `Series {key,label,values,form}`, `ChartFrameProps`,
lejant kuralı (2+ seride zorunlu), tek eksen kuralı, "6'dan fazla seri → Diğer".

**Recharts'a özel dört zorunluluk:**
1. Renkler **`var(--color-chart-N)` string'i** olarak geçilir — hex yazılırsa
   `tests/design-tokens.test.ts` kırılır. Tema değişiminde CSS değişkeni zaten yeniden çözülür;
   canvas değil SVG kullanıldığı için remount gerekmez.
2. `next/dynamic({ ssr: false })` Next 15'te **Server Component içinde kullanılamaz** — sarmalayıcı
   `"use client"` olmak zorunda (`chart/lazy.tsx` bu yüzden var).
3. Yükleme iskeleti grafikle **birebir aynı yükseklikte** olacak; yoksa CLS bütçesi (0.1) kırılır.
4. `ChartFrame` tablo görünümü Recharts'tan bağımsız kalır → JS gelmeden de veri okunabilir.

**Gerekçe blokları güncellenecek** — `MIMARI-PLAN.md` §14 Track C'nin açık talimatı:
*"tersine çevrilebilir — ama o zaman `chart.tsx` ve `form.ts`'teki gerekçe blokları da
güncellenmeli, sessizce geçersiz bırakılmamalı."* Dokunulacaklar:
`chart.tsx` başlığındaki "MİMARİ KARAR: harici grafik kütüphanesi yok" bloğu,
`MIMARI-PLAN.md` §13 ve §14 Track C2 satırı, `GAP-DURUM.md` §2 karar #2.

**Yeni grafik tipleri** (bugün olmayan, bu üründe karşılığı olan formlar):
yığılmış alan (aidat tahsilat trendi), waterfall (gelir-gider akışı), bullet/target
(tahsilat oranı hedefe karşı), yaşlandırma yığılmış sütun (0-30/30-60/60-90/90+ gün borç),
takvim ısı haritası (günlük tahsilat yoğunluğu). Pasta/3B/çift eksen **yok**.

### 0.4 Yeni el yapımı primitifler

Yeni Radix paketi eklenmiyor (izin motion + grafikle sınırlıydı). `packages/ui`'ye eklenecekler:
`Tooltip` (hover + focus, `aria-describedby`), `SegmentedControl`, `KpiCard` (delta oku +
gömülü sparkline), `PageHeader` (başlık + breadcrumb + aksiyon yuvası), `Callout`, `Accordion`
(`<details>/<summary>` tabanlı — JS'siz çalışır), `Skeleton` varyantlarının genişletilmesi.

---

## Faz 1 — `apps/web` landing

### 1.1 Kabuk ve eksik sayfalar

- **`src/components/site-header.tsx` — gerçek hata:** `lg` altında navigasyon **tamamen
  kayboluyor**, mobil menü yok. Mevcut `Sheet`/`Drawer` (Radix Dialog) ile mobil menü + `lg`
  üstünde ürün mega menüsü eklenir. Yeni `"use client"` bileşen `marketing` namespace'i
  kullanacaksa `apps/web/src/i18n/client-namespaces.ts`'e eklenmeli (bugün yalnız `["common"]`).
- Scroll'a duyarlı header (kompaktlaşma + okuma ilerleme çizgisi).
- **`src/components/site-footer.tsx`:** rehber `href` tiplerindeki `@ts-expect-error` temizlenir
  (`routing.pathnames` üzerinden tip türetilir).
- **Bugün hiç olmayan dosyalar eklenir:** `not-found.tsx`, `error.tsx`, `loading.tsx`.

### 1.2 Ana sayfa yeniden yazımı — `src/app/[locale]/page.tsx`

Bilgi mimarisi korunur (aynı mesajlar, aynı çeviri anahtarları), sunum değişir:

| Bölüm | Bugün | Olacak |
|---|---|---|
| Hero | gradient + 2 buton | `<GradientMesh>` zemin, kademeli açılan başlık, **canlı ürün mock'u** — statik ekran görüntüsü değil, gerçek `packages/ui` bileşenleriyle kurulmuş mini panel (KPI kartları + bir grafik + bir tablo satırı), `<Counter>` ile animasyonlu rakamlar |
| Güven şeridi | yok | Doğrulanabilir unsurlar: KVKK/KMK uyumu, iyzico/PayTR/Netgsm entegrasyonu. `content.customers` boş dizi → müşteri marquee **render edilmez** |
| Problem → çözüm | 3 kutu | Yapışkan (sticky) ürün ekranı; scroll ilerledikçe sağdaki ekran o probleme ait görünüme geçer |
| Killer features | 10 kart | Sekmeli/etkileşimli; her sekme kendi canlı mini bileşenini gösterir |
| Modüller | 8 kart, `✓` listesi | Hover/focus ile açılan detay, ikonografi, `<Stagger>` |
| Fiyat önizleme | yok | Daire sayısı kaydırıcısı → anlık plan + tasarruf (mevcut `quoteForPlan`, `planForUnitCount` kullanılır) |
| Karşılaştırma | yalnız `/ozellikler`'de | Özet tablo + "tam karşılaştırma" bağlantısı |
| SSS | yok | Akordiyon (`<details>`) + mevcut `FAQPage` JSON-LD |
| Final CTA | düz renk bant | Derinlikli bant, ikincil CTA, güven satırı |

`content.testimonials` / `content.metrics` de boş dizi olarak eklenir; boşken bölüm render
edilmez. `tests/content.test.ts` TR/EN paritesini bu yeni alanlar için de kontrol edecek şekilde
genişletilir.

### 1.3 Diğer sayfalar

- **`/fiyatlandirma`** — Daire sayısı kaydırıcısı + aylık/yıllık geçişi. **Mevcut GET `<form>`
  JS'siz çalışıyor; bu korunur** (progressive enhancement: kaydırıcı URL'i günceller, JS yoksa
  form aynen çalışır). Tasarruf rozeti animasyonu, plan tablosunda yapışkan başlık + mobil kart
  görünümü, SSS akordiyonu.
- **`/ozellikler`** — 5 sütunlu rakip tablosu: yapışkan başlık + yapışkan ilk sütun, mobilde kart;
  özellik bölümlerine görsel/mini demo.
- **`/kampanyalar`, `/kampanya/[slug]`** — gradient kartlar, süreli kampanyada geri sayım (client).
- **`/blog`, `/blog/[slug]`** — tipografi ölçeği (`prose` benzeri token tabanlı stil),
  okuma ilerlemesi, içindekiler, ilgili yazılar.
- **`/sss`** — akordiyon (bugün hepsi açık `<dl>`).
- **`/[slug]` kiracı landing'i** — kapak alanı, istatistik kartları, NPS aracının görsel
  iyileştirmesi (form POST davranışı korunur).
- **`/gecis`, `/kvkk`** — okunabilirlik ve adım görselleştirmesi.

**Yapılanlar (F1.3 kapanışı).** Sapmalar için R6'ya bakın.

| Sayfa | Ne yapıldı |
|---|---|
| `/fiyatlandirma` | `PlanCalculator` — gerçek bir `<form method="get">`; daire alanı ve dönem **radyo düğmeleri** `name` taşıyor, gönder düğmesi sayfayı yeniden yükletiyor. JS gelince kaydırıcı ve anlık sonuç ekleniyor, durum `replaceState` ile adres çubuğuna yazılıyor. Kaydırıcı yalnız bağlandıktan sonra render ediliyor: `name` taşımadığı için JS'siz bir ziyaretçide ölü bir denetim olurdu. Tasarruf iddiası cümle yerine iki karşılaştırma çubuğu. `PlanTable` 15 kademeyi `md` altında kart, üstünde yapışkan başlıklı tablo olarak veriyor. |
| `/ozellikler` | `lg`+ yapışkan özellik dizini + numaralı kartlar; modül ızgarası; `ComparisonTable` (erişilebilirlik ve mobil kart düzeltmeleri yukarıda). |
| `/kampanyalar` | Kitleye göre **bağlantı tabanlı süzgeç** (`?kime=`, sunucuda süzülür, JS'siz çalışır). Kartta en büyük öğe kampanyanın adı değil **ödülü**. |
| `/kampanya/[slug]` | Görünür kırıntı yolu (yapısal veri vardı, sayfada yoktu), ödül bandı, koşullar ve kurallar iki kartta. |
| `/blog` | Kategori süzgeci (`?kategori=`), öne çıkan yazı + kart ızgarası. |
| `/blog/[slug]` | `renderMarkdown` tipografisi (gövde `text-fg`, 17px/1.75, ~68ch ölçü), başlıklara `id`, `xl`+ içindekiler (okunan bölümü işaretler), okuma çubuğu, ilgili yazılar önce aynı kategoriden. |
| `/rehber/[slug]` | Aynı okuma kabuğu; başlık kimlikleri blogla aynı `slugifyHeading`'den. |
| `/sss` | `<details>` akordiyonu + iletişim kartı. |
| `/[slug]` | Kapak alanı, istatistik kartları, NPS `fieldset` + uç etiketleri (POST davranışı korundu). |
| `/gecis` | Dört adım numaralı dikey akış, kaynak kartları, sahiplik uyarısı. |
| `/kvkk` | Uzun metin kabuğu + içindekiler. |

**Görsel tur tamamlandı.** Chrome'da gezilenler: ana sayfa, `/fiyatlandirma` (açık +
koyu + 420px), `/ozellikler`, `/kampanyalar`, `/kampanya/[slug]`, `/blog`,
`/blog/[slug]`, `/sss`, `/gecis`, `/kvkk`, `/en/pricing`, mobil menü çekmecesi.
`Reveal` düzeltmesi ölçüldü: y=0'dan y=2200'e ani atlamada atlanan 15 blok da açılıyor
(önce 4–7 kalıcı gizli kalıyordu). Fiyat formunun JS'siz davranışı sunucu HTML'i
üzerinden doğrulandı: `daire` alanı, dört `donem` radyosu, doğru `checked`, kaydırıcı
yok, doğru paket önerisi ve tabloda "Size uygun" işareti.

Tur sırasında bulunan ve düzeltilenler aşağıdaki kusur tablosunda.

**Bilinçli olarak bırakılan:** Kaydırıcı sürüklenirken alttaki tam paket tablosundaki
"Size uygun" işareti yerinde kalıyor; işaret URL'deki `daire` değerinden geliyor ve
sunucuda üretiliyor. Her sürükleme adımında sunucuyu yeniden çağırmak kaydırıcıyı
ağırlaştırırdı. "Paketimi bul" düğmesine basıldığında ya da bağlantı paylaşıldığında
ikisi örtüşüyor.

### 1.4 SEO/GEO regresyon koruması

Yeniden yazımda kaybedilmemesi gerekenler — her sayfa için kontrol edilecek:
`generateMetadata` → `pageMeta()` (canonical + hreflang + OG + twitter), tüm JSON-LD blokları
(`Organization`, `SoftwareApplication`, `FAQPage`, `Article`, `BreadcrumbList`,
`ApartmentComplex`), `sitemap.ts`, `robots.ts`, `/llms.txt`, `/llms-full.txt`,
`generateStaticParams` (SSG) ve `/[slug]` için `revalidate = 86400` (ISR).

**LCP kuralı:** hero'nun metni ve birincil CTA'sı **sunucuda** render edilir; motion yalnız
sarmalayıcı katmandır. Client'a taşınacaklar: kaydırıcı, sekmeler, marquee, sayaç, geri sayım,
mobil menü. Kullanıcının dediği gibi landing'de client render sorun değil — ama LCP öğesi değil.

---

## Faz 2 — `apps/app` panel

### 2.1 Kabuk

`src/components/app-shell.tsx`, `shell/sidebar.tsx`, `shell/shell-frame.tsx`:
kenar çubuğunda modül gruplaması ve görsel hiyerarşi, yoğunluk (compact/comfortable) tercihi,
üst barda breadcrumb + sayfa aksiyonları, komut paletinin keşfedilebilirliği.
Yeni `PageHeader` primitifi her panel sayfasındaki tekrar eden başlık markup'ının yerine geçer.

### 2.2 Grafikler

- `src/app/panel/dashboard-charts.tsx` (302 satır, 5 grafik) Recharts'a taşınır ve yeniden
  tasarlanır: eksen tipografisi, tick yoğunluğu, ızgara zayıflatma, tooltip, boş durum.
- `src/app/panel/giderler/category-breakdown.tsx` div-bar listesinden gerçek yatay sütuna.
- Bugün export edilip **hiç kullanılmayan** `Sparkline`, `Stat`/`KpiCard` içine gömülür.
- Yeni panolar: tahsilat oranı (bullet), borç yaşlandırma (yığılmış sütun), gelir-gider
  (waterfall), tahsilat yoğunluğu (takvim ısı haritası).
- **`BarChart({horizontal: true})` hatası:** sessizce `HorizontalBars`'a düşüp `series[0]` dışındaki
  serileri yutuyor — Recharts'ta doğru çok serili yatay sütun ile giderilir.

### 2.3 Tablolar — tek mimariye indirgeme

Bugünkü durum: `packages/ui/src/components/table.tsx`'teki `DataTable` **hiçbir yerde
kullanılmıyor** (ölü kod); `birimler/units-table.tsx`, `sakinler/residents-table.tsx`,
`borclar/debts-table.tsx`, `giderler/expenses-table.tsx` aynı reçeteyi dört kez kopyalamış
(`BulkSelection` + `SortableTh` + `tc.*` + `md` altı `DataCard`).

Yapılacak: `DataTable` bu dördünün gerçek ihtiyacına göre yeniden tasarlanır —
yapışkan başlık, yapışkan ilk sütun, kolon hizalama/genişlik, sayısal kolonlarda `tabular-nums`,
satır yoğunluğu, satır seçimi, hover/seçili durumu, boş/yükleniyor/hata durumları, mobil
`DataCard` render-prop'u — ve dört tablo + `denetim/page.tsx` buna taşınır. Yaklaşık 600 satır
tekrar kalkar.

Korunacaklar: `tableClasses` (25 dosya kullanıyor; `DataTable` onun üstüne kurulur),
`buildListHref`/`parseListParams` ve **liste durumunun URL'de tutulması** (GAP-DURUM kararı #6),
sunucu tarafı sıralama/sayfalama, `SortableTh`'in `aria-sort`'u, `Pagination`'ın JS'siz çalışması.
Kolon görünürlüğü ve yoğunluk tercihi URL'e girmez — `localStorage`'da tutulur.

TanStack Table eklenmiyor: sayfa başına ≤50 satır, sanallaştırmanın çözeceği bir sorun yok.

### 2.4 Formlar ve durumlar

- `packages/ui/src/components/fields.tsx` (949 satır) davranışsal olarak korunur (§12.1);
  görsel katman güncellenir: alan yüksekliği, odak halkası, hata/yardım metni hiyerarşisi,
  `StickyFormBar`.
- **Bugün `apps/app`'te sıfır `Suspense` var** ve tek bir panel-geneli `loading.tsx` mevcut.
  Ağır sayfalara route seviyesi `loading.tsx` + bölüm bazlı `Suspense` eklenir (dashboard
  grafikleri, uzun listeler).
- Toplu aksiyonlarda `useOptimistic`; her modül için anlamlı `EmptyState`.

---

## Faz 3 — UI hataları, erişilebilirlik, kapılar

### Tespit edilen somut hatalar

| # | Dosya | Sorun |
|---|---|---|
| 1 | `apps/web/src/components/site-header.tsx` | `lg` altında navigasyon tamamen kayboluyor, mobil menü yok |
| 2 | `apps/web/` | `public/` dizini yok → `/logo-light.svg`, `/og-default.png`, `/favicon.ico` 404; `organizationSchema.logo` ve tüm OG görselleri kırık |
| 3 | `apps/web/src/app/` | `not-found.tsx` / `error.tsx` yok → çerçevesiz Next varsayılanı |
| 4 | `apps/web/src/components/site-footer.tsx` | rehber `href`'lerinde `@ts-expect-error` |
| 5 | `packages/ui/src/components/chart.tsx` | `BarChart({horizontal:true})` `series[0]` dışını sessizce yutuyor |
| 6 | `packages/ui/src/components/chart.tsx` | sabit `width=640` viewBox → küçük ekranda eksen yazıları da küçülüp okunmuyor |
| 7 | `packages/ui/src/components/table.tsx` | `DataTable` ölü kod; davranış 4 tabloda kopyalanmış |
| 8 | `packages/ui/src/components/chart.tsx` | `Sparkline` export ediliyor, hiç kullanılmıyor |
| 9 | `apps/app` (30 yer) | `linkComponent={Link as never}` — jenerik `LinkLike` tipiyle giderilir |
| 10 | `apps/app` | route seviyesi `Suspense`/streaming yok |

### Kapılar (yeni)

- **Bundle bütçesi gerçekten uygulanacak.** `MIMARI-PLAN.md` §12.3 "bütçe 250 kB" diyor ama bugün
  hiçbir yerde ölçülmüyor — Recharts eklerken bu artık isteğe bağlı değil.
  `scripts/bundle-budget.mjs`: build sonrası `.next/app-build-manifest.json` üzerinden route başına
  First Load JS hesaplar, eşiği aşarsa `exit 1`. `infra/ci/ci.yml`'ye adım olarak eklenir.
- **`pnpm lint` CI'ya eklenir** — bugün ESLint yapılandırılmış ama CI adımı değil.
- `tests/design-tokens.test.ts` genişletir: kontrast assert'leri (0.1), motion sürelerinin
  token'dan gelmesi, Recharts sarmalayıcılarında hex sızmaması.
- Erişilebilirlik smoke: `vitest` + `@testing-library/react` + `jest-axe` ile `packages/ui`
  bileşenlerine axe taraması (§15'te "axe ile smoke" olarak yazılı ama hiç yapılmamış).
  Playwright kurulmuyor. *Bu madde en sona bırakılabilir.*

---

## Doğrulama

```bash
pnpm typecheck                  # tsc -p tsconfig.check.json
pnpm lint                       # eslint (jsx-a11y dahil)
pnpm arch                       # dependency-cruiser — mimari değişmezler
pnpm test                       # design-tokens + content + i18n-keys + i18n-client + …
pnpm --filter @yonetim/web dev  # :3000
pnpm --filter @yonetim/app dev  # :3001
ANALYZE=true pnpm --filter @yonetim/app build && node scripts/bundle-budget.mjs
```

Elle kontrol listesi (her ikisi de her fazın sonunda):

1. Tema geçişi açık ↔ koyu — hiçbir bölüm okunaksız kalmıyor, grafik renkleri iki temada da ayrışıyor.
2. `data-font-scale="xl"` (20px) — düzen bozulmuyor, taşma yok.
3. `data-contrast="high"` — sınırlar ve odak halkası görünür.
4. `data-motion="reduced"` **ve** sistem "reduce motion" — **tüm** JS animasyonları duruyor
   (`MotionConfig` köprüsü çalışıyor mu; bu, motion kütüphanesi eklemenin en kritik testi).
5. JS kapalı → landing okunabilir, fiyat formu (GET) ve SSS akordiyonu çalışıyor.
6. Klavye turu: skip link → header → mobil menü → tablo sıralama → toplu aksiyon → modal odak tuzağı.
7. Grafik "tablo görünümü" düğmesi her grafikte çalışıyor.
8. Mobil (375px) — landing ve panelin dört liste ekranı.
9. SEO regresyonu: `/sitemap.xml`, `/robots.txt`, `/llms.txt` yanıt veriyor; bir blog sayfasının
   `<head>`'inde canonical + hreflang + JSON-LD duruyor.
10. Lighthouse elle (CI'da yok): LCP < 2.5s, INP < 200ms, CLS < 0.1 — `siteConfig.performance`.

---

## Riskler ve azaltmaları

| Risk | Azaltma |
|---|---|
| Recharts SSR yok → ilk boyamada grafik boş, CLS | `next/dynamic` + **grafikle aynı yükseklikte** iskelet; `ChartFrame` tablo görünümü Recharts'tan bağımsız kalır |
| +95 kB bundle | Yalnız grafik olan sayfalarda dinamik yükleme; bundle bütçesi CI kapısı **bu fazda** kurulur |
| Motion kütüphanesi a11y kill-switch'i görmez | `MotionConfig reducedMotion` mevcut `yonetim_a11y` çerezine bağlanır; doğrulama listesi md. 4 |
| Palet değişimi kontrast kırar | `design-tokens.test.ts`'e kontrast assert'i; grafik paleti dokunulmaz |
| Landing yeniden yazımı SEO regresyonu yaratır | Metadata/JSON-LD/sitemap sözleşmeleri kontrol listesinde; `i18n-keys` ve `content` testleri zaten kapı |
| Belgelenmiş kararların sessizce geçersizleşmesi | `chart.tsx`, `MIMARI-PLAN.md` §13/§14-C2, `GAP-DURUM.md` §2 karar #2 aynı commit'te güncellenir |

## Açık karar

**Faz 0 başlamadan:** palet adayı A / B / C seçimi (bkz. §0.1). Diğer her şey planlanmış durumda.
