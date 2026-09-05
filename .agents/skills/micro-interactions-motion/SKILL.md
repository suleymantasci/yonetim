---
name: micro-interactions-motion
description: Arayüze dokunsal kalite, akıcılık ve canlılık katan hafif mikro-etkileşimler; buton basma hissi, tab/drawer geçişleri ve sıfır JS yüküyle çalışan CSS animasyon standartları skilli.
---

# Mikro-Etkileşimler (Micro-Interactions) & Hareket Standartları

Bu beceri (skill), projenin arayüzüne statik ve ölü bir web sayfası görüntüsünden kurtarıp; **dokunsal (tactile), canlı ve akıcı** bir yazılım deneyimi kazandırırken, repodaki performans ve bundle bütçesi kısıtlarına (özellikle R1 ve R7 kararları) titizlikle uymayı sağlar.

---

## 1. Mimari Kısıt: Panelde Motion Kütüphanesi Yasaktır! (R1 Kararı)

- **`apps/web` (Pazarlama/Landing):** Anlatı ve sunum amacıyla `@yonetim/ui/motion` altındaki hafif motion bileşenleri serbesttir.
- **`apps/app` (Yönetim Paneli):** JavaScript tabanlı ağır motion kütüphanesi **KESİNLİKLE YASAKTIR**. Panelde her animasyon **saf CSS transition ve CSS keyframe** ile çözülmelidir.
  - *Gerekçe:* Motion motoru hidrasyon sonrası 60+ kB bundle ekler. Bir yöneticinin aidat tablosunda bekleme lüksü yoktur; arayüz 0 ms gecikmeyle tepki vermelidir.

---

## 2. Dokunsal Buton & Tıklama Hissi (Tactile Feedback)

Tüm interaktif buton ve tıklanabilir kartlarda aşağıdaki dokunsal basma mikro-etkileşimi standarttır:

```tsx
// DOĞRU: Dokunsal buton
<button className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg shadow-sm transition-all duration-150 ease-out active:scale-[0.98] hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
  Kaydet
</button>
```

- `active:scale-[0.98]`: Tıklandığı anda düğmenin hafifçe içeri çökmesini sağlayarak fiziksel bir buton hissi uyandırır.
- `duration-150 ease-out`: Gecikmesiz, anlık tepki verir.

---

## 3. Sekme (Tab) ve Filtre Geçişleri

Sekme değişimlerinde sert sıçramalar yerine pürüzsüz geçişler kullanın:

```tsx
<div className="flex border-b border-border">
  <button className="relative px-4 py-2.5 text-sm font-medium transition-colors text-primary border-b-2 border-primary -mb-px">
    Genel Bakış
  </button>
  <button className="px-4 py-2.5 text-sm font-medium transition-colors text-fg-muted hover:text-fg hover:border-b-2 hover:border-border -mb-px">
    Banka Hareketleri
  </button>
</div>
```

---

## 4. İskelet Yükleyiciler (Skeleton Loaders)

Veri yüklenirken dönen jenerik "spinner" yerine, ekranın gerçek şeklini koruyan hafif pulsasyonlu iskeletler kullanın:

```tsx
// DOĞRU: Tablo satırı iskeleti (CLS önleyici)
<div className="animate-pulse space-y-3 p-4">
  <div className="h-4 w-1/3 rounded bg-surface-sunken" />
  <div className="h-8 w-full rounded bg-surface-sunken" />
  <div className="h-8 w-full rounded bg-surface-sunken" />
</div>
```

---

## 5. Erişilebilirlik: `prefers-reduced-motion` Saygısı

Kullanıcı işletim sisteminde "hareketi azalt" seçeneğini açtıysa veya `yonetim_a11y` çerezinde `data-motion="reduced"` varsa, animasyonlar gözü yormamak için otomatik olarak iptal edilmelidir.

CSS tarafında bu kural `packages/ui/src/styles/tokens.css` içinde zaten tanımlıdır. Özel CSS animasyonu yazarken şu yapı korunmalıdır:

```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 6. Özet İlke
Arayüzdeki hareketler "gösteri" için değil, **kullanıcıya durum bildirmek ve dokunma hissi vermek** içindir:
- Butona basıldığında çöker (`active:scale-[0.98]`).
- Üzerine gelindiğinde sınır rengi parlar (`hover:border-border-strong`).
- Veri silindiğinde satır hafifçe kararır ve kapanır.
- Gereksiz zıplamalar, dönen süsler veya sayfa girişinde gecikmeli kayarak gelen öğelerden kaçının.
