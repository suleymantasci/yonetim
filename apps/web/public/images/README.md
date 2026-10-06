# Pazarlama görselleri

2026-10-06 revizyonu, onaylanan sıcak mimari kimliği uygular.

| Varlık | Kullanım | Görsel davranışı |
|---|---|---|
| courtyard.webp | Hero, site anlatımı, blog/fiyat sayfası | Dolu zeminli özgün mimari fotoğraf; hero masaüstünde en az 31,5 rem ve metin alanıyla aynı yükseklikte; mobilde 20 rem; anlatım 3:4 |
| shared-space.webp | Sakin anlatımı ve kampanya bandı | Dolu zeminli ortak yaşam fotoğrafı, object-fit cover |
| panel-preview-light.webp | Önceki açık tema tasarım arşivi (sayfada kullanılmaz) | 1536×1024 temsili panel; örnek veriler, geniş menü, arama ve tema kontrolleri |
| panel-preview-dark.webp | Önceki koyu tema tasarım arşivi (sayfada kullanılmaz) | Aynı kompozisyonun koyu tema karşılığı |

Yeni görseller ImageGen ile üretildi. Kesin promptlar her WebP yanındaki .json dosyasında ve docs/design/landing-revision-2026-10-05/asset-prompts.json içinde. Arşivdeki panel görselleri mevcut ürün menüsünü referans alır; canlı müşteri ekran görüntüsü değildir. Ana sayfa artık tam boy panel rasteri kullanmaz: hero altında üç ölçüm, üç tablo satırı ve mevcut WhatsApp demosunu içeren kısa HTML ürün özeti gösterilir. Özet örnek veriler olarak etiketlenir. Gerçek panelin işlevleri ve kontrolleri korunur.

Önceki tour-control-slide.png, mobile-app-slide.png, social-life-slide.png varlıkları eski tasarım arşividir; bu revizyonun ana sayfasında kullanılmaz. Şeffaf PNG ve PlotShape sözleşmesi artık bu yüzeyler için geçerli değildir.

## Full-flow correction — 2026-10-06

`panel-actual-dark.jpg` is the original actual local panel capture with populated Örnek Apartmanı demo data, sourced from `verification/panel-units-dark-desktop.jpg`. The landing frame clips the top excerpt through CSS; it does not use generated UI. Original pixels preserved. It is a screenshot, not interactive controls.

`olive-canopy.png` is a transparent organic olive branch generated with ImageGen. Its exact prompt is embedded and recorded in the adjacent JSON. It extends toward the hero/header boundary, stays decorative and ignores pointer input.

The homepage follows `08-ana-sayfa-tam-akis-light.png`: container-framed actual panel, equal audiences, one eight-module directory, resident WhatsApp, portfolio, compact pricing/migration/notes. The removed simulator is absent only from homepage marketing; underlying product features remain available.

## Image-only retouch and hero refinement

`panel-retouched.png` replaces the shipping JPEG. Real panel source was retouched through ImageGen solely for marketing: Ahmet Yılmaz/AY, no Deneme labels or development badge; sharp lettering, lossless PNG delivered without Next image recompression. Actual tool output1507×1044; no claim of2x output. Source screenshot remains in verification history. No panel code/data changes. Hero photo now bleeds to viewport right and112px below its layout; smaller22px-max photo caption, no hero bottom border. Four desktop migration circles connected. Header breakpoint1024px with compact1024–1279 layout.
