---
name: proptech-fintech-design
description: Apartman, site ve toplu konut yönetimi (PropTech) ile aidat, bütçe, gecikme faizi ve kasa takibi (FinTech) alanlarına özel kurumsal UX, veri sunumu ve rol ayrımı standartları skilli.
---

# PropTech & FinTech Tasarım ve Kullanıcı Deneyimi Kılavuzu

Bu beceri (skill), site/apartman yönetimi platformunun bir eğlence veya tüketici SaaS'ı değil; **insanların gayrimenkul mülkiyetini, parasını, yasal haklarını ve komşuluk ilişkilerini** yönettiği bir **PropTech + FinTech** sistemi olduğunu AI ajanına hatırlatır ve bu ciddiyete uygun tasarım kurallarını tanımlar.

---

## 1. Finansal Hassasiyet & Rakam Standartları

Apartman yönetiminde en ufak 1 TL'lik yuvarlama hatası veya basamak kayması kat malikleri kurulunda büyük tartışmalara yol açar. Arayüz bunu mutlak bir hassasiyetle yansıtmalıdır:

### 1.1. Tabular Sayılar ve Sağa Hizalama Zorunluluğu
- **Kural:** Tablolardaki ve kartlardaki tüm para tutarları, metrekareler, arsa payları ve sayaç endeksleri **kesinlikle sağa hizalanmalı** (`text-right`) ve **sabit genişlikli rakamlar** (`font-mono` veya `tabular-nums`) ile yazılmalıdır.
- Farklı satırlardaki kuruş haneleri ve virgüller milimetrik olarak alt alta gelmelidir.

```tsx
// DOĞRU: Finansal tablo hücresi
<td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-fg font-medium">
  ₺14.850,00
</td>
```

### 1.2. Para Birimi ve Sembol Hiyerarşisi
- `₺` sembolü veya `TL` ibaresi ana tutarla aynı ağırlıkta olup gözü yormamalıdır. Mümkünse `₺` sembolü hafif soluk tutulabilir: `<span className="text-fg-subtle text-xs mr-0.5">₺</span>14.850,00`.

### 1.3. Bilanço & Durum Renk Semantiği
- Finansal durumlarda agresif ve göz yoran fosforlu renkler yerine rafine kurumsal tonlar kullanılmalıdır:
  - **Tahsil Edildi / Fazla Bakiye:** `text-success-fg bg-success-soft border-success-border` (Dingin zümrüt/orman tonu).
  - **Gecikmiş Borç / İcra Riski:** `text-danger-fg bg-danger-soft border-danger-border` (Rafine kiremit/terracotta tonu; `bg-red-500` gibi yangın alarmı rengi değil).
  - **Bekleyen / Vadesi Gelmemiş:** `text-warning-fg bg-warning-soft border-warning-border` (Amber/bal tonu).
  - **Nötr / Devir Bakiye:** `text-fg-muted bg-surface-sunken border-border`.

---

## 2. İki Farklı Dünya: Yönetici vs. Sakin Deneyimi

Aynı sistemde iki çok farklı kullanıcı profili yaşar. Bir ekran tasarlarken hedef kitlenin kim olduğu net bilinmelidir:

### 2.1. Yönetici & Muhasebe Portalı (The Operator Cockpit)
* **Hedef:** Hız, yüksek işlem hacmi, sıfır hata, yasal dayanak (KMK).
* **Tasarım Karakteri:**
  - Yüksek veri yoğunluğu (Data-Dense).
  - Geniş listelerde klavye kısayolları (Tab ile gezinme, Esc ile modaldan çıkış).
  - Toplu işlemler (Bulk actions): "Seçilen 42 daireye aidat tahakkuk ettir", "Bankadan gelen 18 hareketi otomatik eşleştir".
  - Hızlı filtreler: Blok (A, B, C), Bağımsız Bölüm Tipi (Daire, Dükkan), Mülkiyet Durumu (Malik, Kiracı).
  - Karar defteri ve KMK referansları: Yapılan her harcamanın ve tahakkukun işletme projesindeki hangi fasla dayandığını gösteren net izler.

### 2.2. Kat Maliki & Sakin Portalı (The Resident Portal)
* **Hedef:** Şeffaflık, güven, borcunu tek bakışta anlama, 10 saniyede ödeme.
* **Tasarım Karakteri:**
  - Sade, ferah ve güven verici.
  - "Nereye ne ödüyorum?" sorusunun anında yanıtı: Kat mülkiyeti kanununa göre yapılan harcamaların pasta grafiği ("Bu ay aidatınızın %40'ı ısınma, %30'u güvenlik, %15'i temizlik için harcandı").
  - Tek tıkla ödeme: 3D Secure kredi kartı, FAST/Havale için kopyalanabilir hazır IBAN ve açıklama kodu.
  - Komşuluk ve yaşam modülleri: Duyurular, anketler, sosyal tesis (havuz, spor salonu) rezervasyonu.

---

## 3. Apartman Yönetimine Özgü Spesifik Bileşenler

### 3.1. Daire / Bağımsız Bölüm Rozeti (Unit Identifier Badge)
Sitedeki daireler için standart metin yerine yapılandırılmış mini-etiketler kullanın:

```tsx
// Örnek: Blok ve No rozeti
<div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-sunken px-2 py-1 font-mono text-xs">
  <span className="font-semibold text-fg">A BLOK</span>
  <span className="text-fg-subtle">/</span>
  <span className="text-fg-muted">D.14</span>
  <span className="ml-1 rounded bg-surface px-1 text-[10px] text-fg-subtle border border-border">
    3+1 (145 m²)
  </span>
</div>
```

### 3.2. KMK Gecikme Tazminatı Göstergesi
Kat Mülkiyeti Kanunu Madde 20 uyarınca aylık %5 gecikme tazminatı hesaplandığında bunu şeffafça açıklayan gösterge:

```tsx
<div className="flex items-center justify-between p-3 rounded-lg border border-warning-border bg-warning-soft">
  <div className="flex items-center gap-2 text-xs text-warning-fg">
    <Scale className="h-4 w-4 shrink-0" />
    <span>KMK Madde 20 Uyarınca Aylık %5 Gecikme Tazminatı (14 Gün Gecikme)</span>
  </div>
  <span className="font-mono text-xs font-semibold tabular-nums text-warning-fg">
    +₺145,20
  </span>
</div>
```

### 3.3. Sayaç Tüketim Çubuğu (Isı Pay Ölçer / Su / Elektrik)
Sayaç okuma ekranlarında sadece son endeksi yazmak yerine önceki endeksle kıyaslayan görsel ilerleme çubuğu:

```tsx
<div className="space-y-1">
  <div className="flex justify-between text-xs">
    <span className="text-fg-muted">Sıcak Su Tüketimi</span>
    <span className="font-mono font-medium text-fg">14,2 m³</span>
  </div>
  <div className="h-1.5 w-full rounded-full bg-surface-sunken overflow-hidden">
    <div className="h-full rounded-full bg-primary" style={{ width: '65%' }} />
  </div>
  <div className="flex justify-between text-[10px] font-mono text-fg-subtle">
    <span>Önceki: 112,4</span>
    <span>Son: 126,6</span>
  </div>
</div>
```

---

## 4. Renk Dünyası ve İmaj Yönetimi

- **Rakiplerin Hatası:** Apsiyon, Senyonet, Yönetimcell gibi eski nesil yazılımlar 2010'lardan kalma Windows Form uygulaması havasında, soluk mavi ve gri tonlarında sıkışmıştır.
- **Bizim Farkımız:** Modern İskandinav mimarisi ile İsviçre özel bankacılığı estetiğinin birleşimi:
  - Dingin, mimari taş/kâğıt tonları,
  - Güven veren derin petrol ve lacivert tonları,
  - İnce ve kararlı çerçeveler,
  - Yaşayan, dinamik ama asla ciddiyeti elden bırakmayan bir PropTech tecrübesi.
