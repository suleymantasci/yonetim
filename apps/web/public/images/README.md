# Pazarlama görselleri — alan ölçüleri ve teslim kuralları

Açılış sayfasındaki görsel alanları **tek bir ölçüyü** paylaşır. Amaç, üretilen
her yeni görselin hiçbir kod değişikliği gerektirmeden yerine oturması.

Alanların bileşenleri: `src/components/home/hero-figure.tsx`,
`src/components/home/story-row.tsx`, altlık şekli `src/components/home/plot-shape.tsx`.

---

## 1. Ortak slot — 1520 × 1352 px

| | |
|---|---|
| **Teslim ölçüsü** | **1520 × 1352 px** (2×) |
| Oran | 760 : 676 ≈ **1,124 : 1** (yataya yatık, kareye yakın) |
| Biçim | PNG-24 **alfa kanallı** (şeffaf zemin) — ya da alfa'lı WebP |
| Ekranda kapladığı en büyük alan | 544 CSS px genişlik (masaüstü), 480 CSS px (tablet), ~%92 genişlik (mobil) |
| Dosya boyutu hedefi | **≤ 250 KB** (sıkıştırma sonrası) |

Kod tarafında `width={760} height={676}` yazılı; bu yalnız **oranı** bildirir.
1520 × 1352 teslim edildiğinde kod değişmez, Next.js kaynaktan uygun boyutu üretir.

> Şu an dizindeki üç PNG 760 × 676 ve 178–584 KB. Oran doğru, çözünürlük ve
> `tour-control-slide.png`'nin boyutu düşük kaliteli/ağır kalıyor. Nihai
> görsellerde yukarıdaki hedefleri tutturun.

### Zemin kuralı — en önemli madde

**Görselin içine arka plan şekli veya marka rengi koymayın.** Şu an elimizdeki
geçici PNG'lerde açık mavi bir "ev/ok" şekli gömülü; o şekil:

- koyu temada yanlış renkte kalıyor,
- marka rengi (`#2563EB`) değiştiğinde bayatlıyor,
- CSS'teki parsel çerçevesiyle (`PlotShape`) yarışıyor.

Altlık şekli ve marka rengi **kodda** duruyor ve temayla birlikte dönüyor.
Görselden istenen tek şey **şeffaf zeminli özne**.

### Kompozisyon

```
      1520 px
 ┌───────────────────────────────────────┐
 │  ← %8 pay →                  ← %8 →   │   ▲
 │   ┌───────────────────────────────┐   │   │
 │   │                               │   │   │
 │   │        ÖZNE BU ALANDA         │   │   │  1352 px
 │   │      (yatayda ortalı,         │   │   │
 │   │     dikeyde alta yaslı)       │   │   │
 │   │                               │   │   │
 │   └───────────────────────────────┘   │   ▼
 │                  ← %4 pay →           │
 └───────────────────────────────────────┘
```

- Özne kenarlara **değmesin**: her yönden en az %4 (≈ 60 px) boşluk kalsın.
- Dikeyde alta yaslayın; üstte %8–10 boşluk iyi durur.
- Gölge kullanacaksanız görselin içinde, yumuşak ve nötr (siyah %8–12) olsun.

### Tema uyumu

Görsel hem `#f8fafc` (açık tema) hem `#0a0f1a` (koyu tema) üstünde duracak.

- Saf beyaz ya da saf siyah geniş alanlardan kaçının; koyu temada beyaz bir
  yüzey delik gibi parlıyor.
- Öznenin dış kenarı orta tonda olsun (ne #fff ne #000).
- Kırpma (matting) temiz olsun: beyaz zemin artığı koyu temada halo yapar.

---

## 2. Doldurulmuş alanlar

### 2.1 Hero — `tour-control-slide.png`

Sayfanın ilk ekranı, sağ sütun. Üstüne **iki canlı kart** biniyor (gerçek DOM,
gerçek token — görselin içine çizilmeyecek). Bu iki bölgeyi öznenin **önemli
detayından arındırın**; özne oraya taşabilir ama yüz, yazı, ekran gibi
okunması gereken bir şey kalmasın.

```
        1520 px
 ┌───────────────────────────────────────┐
 │                       ┌─────────────┐ │  ← "Tahsilat oranı %94" kartı
 │                       │    TEMİZ    │ │     560 × 280 px
 │                       │   BÖLGE 1   │ │     sağ kenardan 0, üstten 135 px
 │                       └─────────────┘ │
 │                                       │
 │              ÖZNE                     │
 │                                       │
 │ ┌───────────────────┐                 │  ← WhatsApp kartı
 │ │       TEMİZ       │                 │     800 × 320 px
 │ │      BÖLGE 2      │                 │     sol kenardan 0, alttan 55 px
 │ └───────────────────┘                 │
 └───────────────────────────────────────┘
```

| Bölge | Genişlik × yükseklik | Konum (1520 × 1352 içinde) |
|---|---|---|
| 1 — tahsilat rozeti | 560 × 280 px | sağ: 0, üst: 135 |
| 2 — WhatsApp kartı | 800 × 320 px | sol: 0, alt: 55 |

Kartlar `rem` ölçüsünde, yani dar ekranda görsele oranla **büyüyorlar**;
yukarıdaki değerler en dar hâl (masaüstü, 466 px sütun) için hesaplandı.

**İçerik yönergesi:** Bir site yöneticisi ve yönettiği alanlar. Türkiye'den bir
site/apartman bağlamı — abartılı "kurumsal stok fotoğraf" havası olmasın.
Alternatif metin `marketing.home.heroImageAlt` anahtarında; görsel değişirse o
metin de değişmeli.

### 2.2 Sakin şeridi — `mobile-app-slide.png`

Zikzak bölümünün ilk satırı, solda. Üstüne kart binmiyor, temiz bölge yok.

**İçerik yönergesi:** Sakin mobil uygulamasının iki telefon ekranı. Ekran
içerikleri **Türkçe ve gerçekçi** olsun (bakiye, bekleyen işler, arıza kaydı);
uydurma kişi adı ve gerçek görünümlü tutar kullanmayın.

### 2.3 Site şeridi — `social-life-slide.png`

Zikzak bölümünün ikinci satırı, sağda. Altlık şekli bu satırda **aynalanır**
(`mirrored`), yani görselin kendi kompozisyonu simetriye yakın durursa iyi olur.

**İçerik yönergesi:** Blok/bina kütleleri — izometrik ya da yumuşak 3B. Tek
bina değil, birden fazla blok görünsün: bölümün iddiası "tek apartmandan çok
bloklu siteye kadar".

---

## 3. Henüz üretilmemiş — üretilirse yerine takılır

### 3.1 Paylaşım görseli (Open Graph) — 1200 × 630 px

Şu an **yok**. Site bağlantısı WhatsApp'ta, LinkedIn'de veya Slack'te
paylaşıldığında görselsiz, zayıf bir kart çıkıyor.

| | |
|---|---|
| Ölçü | **1200 × 630 px** (zorunlu, sabit) |
| Biçim | PNG veya JPG, **şeffaflık yok** (zemin dolu) |
| Dosya | ≤ 300 KB |
| Güvenli alan | Kenarlardan 60 px içeride kalın; bazı istemciler kenarları kırpıyor |
| Metin | En fazla 6–7 kelime, en az 48 px punto |

Teslim edilince `apps/web/src/app/[locale]/layout.tsx` içindeki `openGraph`
bloğuna `images` alanı eklenecek.

### 3.2 Favicon / uygulama ikonu

`apps/web/src/app/icon.svg` mevcut ve SVG olduğu için ölçek sorunu yok —
yeni bir şey gerekmiyor.

---

## 4. Teslim kontrol listesi

- [ ] 1520 × 1352 px, alfa kanallı PNG
- [ ] İçinde arka plan şekli / marka rengi **yok**
- [ ] Özne kenarlardan en az %4 içeride
- [ ] Açık ve koyu zeminde ayrı ayrı bakıldı
- [ ] Sıkıştırıldı, ≤ 250 KB
- [ ] Hero görseliyse iki temiz bölge boş
- [ ] Dosya adı değiştiyse `page.tsx` içindeki `src` ve ilgili `*ImageAlt`
      çeviri anahtarı güncellendi
