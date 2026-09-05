---
name: data-density-dashboard
description: Yönetim panelleri için yüksek veri yoğunluğu (data density), gelişmiş tablo mimarisi, klavye kısayolları, slide-over drawer ve kompakt form ergonomisi standartları skilli.
---

# Yüksek Veri Yoğunluğu (Data Density) & Panel Ergonomisi Kılavuzu

Bu beceri (skill), `apps/app` yönetim panelinin hantal ve boşluklarla dolu bir mobil web sitesi gibi davranmasını engeller; profesyonel bir apartman yöneticisinin veya muhasebecinin **aynı ekranda onlarca daireyi, gider kalemini ve banka hareketini rahatça tarayabileceği** yüksek verimlilikte bir kokpit deneyimi sunmasını sağlar.

---

## 1. Veri Yoğunluğu (Density) Prensipleri

### 1.1. Boşluk (Spacing) Disiplini
- Panel ekranlarında tüketici sitelerindeki `py-8` veya `p-12` gibi devasa iç boşluklar **kullanılamaz**.
- **Tablo Satırları:** Dikey padding `py-2` veya en fazla `py-2.5` olmalıdır. 1080p bir ekranda kaydırma yapmadan en az **12-15 satır** görünür olmalıdır.
- **Form Alanları:** Girdi kutuları dikeyde `h-9` veya `h-10` (36px - 40px) olmalı, `h-14` gibi hantal yükseklikler tercih edilmemelidir.
- **Kart İçi Boşluklar:** `p-4` veya `p-5` standarttır.

### 1.2. Hiyerarşik Veri Gösterimi
Aynı veriyi geniş kolonlara yaymak yerine mantıksal olarak birleştirin:
* **KÖTÜ (Dağınık 4 Kolon):**
  - Ad Soyad | Daire No | Blok | Telefon
* **İYİ (Kompakt 2 Kolon):**
  - **Kişi & Daire:** Ahmet Yılmaz (üstte kalın), *A Blok D.14 • Kat Malik* (altta 12px muted)
  - **İletişim & Bakiye:** +90 532 ... (üstte), *₺1.250 Borç* (altta renkli)

---

## 2. Gelişmiş Tablo Mimarisi (DataTable Standartları)

Repomuzdaki `UI-MODERNIZASYON-PLANI.md` kararlarına (özellikle R11 ve R12) tam uyumlu tablo kuralları:

### 2.1. Yapışkan Başlıklar (Sticky Header)
Yönetici 50 satırlık bir listeyi kaydırırken hangi sütunun ne olduğunu asla unutmamalıdır:
- `thead` sınıfında `sticky top-0 bg-surface-sunken z-10 border-b border-border` kullanılmalıdır.
- Yatay kaydırma kutusu (`overflow-x: auto`) yapışkan başlığı öldürdüğü için; dar ekranlarda tablo yatay kaydırılmaz, kart görünümüne düşer (`cardBreakpoint="lg"`).

### 2.2. Satır İçi Hızlı Aksiyonlar (Row Hover Actions)
Her satırda 4 tane buton göstermek görsel kirlilik yaratır:
- Aksiyonlar normalde gizli veya soluk olmalı, kullanıcı fareyle o satırın üzerine geldiğinde (`group-hover:opacity-100`) yumuşakça belirmelidir:

```tsx
<tr className="group border-b border-border transition-colors hover:bg-surface-sunken/50">
  <td className="px-4 py-2.5 font-medium text-fg">Ahmet Yılmaz</td>
  <td className="px-4 py-2.5 text-right font-mono tabular-nums">₺1.200,00</td>
  <td className="px-4 py-2.5 text-right">
    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button className="rounded p-1 text-fg-muted hover:bg-surface hover:text-fg" title="Makbuz Yazdır">
        <Printer className="h-4 w-4" />
      </button>
      <button className="rounded p-1 text-fg-muted hover:bg-surface hover:text-fg" title="Detay İncele">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  </td>
</tr>
```

---

## 3. Akış Ergonomisi: Sayfa Terk Etmeden İnceleme

### 3.1. Slide-Over (Sağdan Açılan Detay Çekmecesi)
Bir dairenin veya faturanın detayına bakmak için tam sayfa yönlendirmesi yapmak kullanıcının bağlamını koparır:
- Tabloda bir satıra tıklandığında sağdan açılan `Drawer` (slide-over) ile detay, geçmiş ödemeler ve sayaç hareketleri listelenir.
- Arka plandaki liste filtresi ve kaydırma konumu kaybolmaz.

### 3.2. Paralel ve Kesme Rotaları (Intercepting Routes)
- Repomuzdaki R14 kararı: `@modal/(.)birimler/yeni`, `(.)sakinler/yeni`, `(.)giderler/yeni`.
- Yeni kayıt eklerken liste ekranının üzerinde modal açılır, sayfa unmount olmaz; ancak URL `/panel/birimler/yeni` olarak değişir. Böylece sayfa yenilense veya link kopyalansa bile doğrudan çalışır.

---

## 4. Kompakt ve Hatasız Form Mimarisi

Apartman yöneticileri sıklıkla onlarca faturayı peş peşe sisteme girer:

1. **İki Sütunlu Mantıksal Grid:**
   - Birbiriyle ilişkili alanları yan yana dizin: `[ Tutar (TL) ]` `[ Ödeme Tarihi ]`.
2. **Klavye Öncelikli Gezinme:**
   - Her `input` düzgün `tabIndex`'e sahip olmalı; Enter'a basıldığında form bir sonraki alana geçmeli veya onaylamalıdır.
3. **Özel Maskeler:**
   - TCKN (11 hane), IBAN (TR + 24 hane), Telefon (05XX XXX XX XX) alanlarında özel formatlayıcılar kullanılmalı, yapıştırma (paste) yapıldığında boşluklar otomatik temizlenmelidir.
4. **Tek Bakışta Hata Özeti:**
   - Formun en altında değil; hatalı alanın hemen altında `text-xs text-danger-fg` ile açık ve net yönlendirme yapılmalıdır.

---

## 5. Kılavuzlu Boş Durumlar (Guided Empty States)

Veri olmadığında sadece "Kayıt bulunamadı" yazıp bırakmak zayıf bir kullanıcı deneyimidir. 

* **Doğru Boş Durum Şablonu:**
  1. Ne eksik? (Örn: "Henüz hiçbir bağımsız bölüm (daire) tanımlanmadı.")
  2. Neden gerekli? ("Aidat tahakkuk ettirebilmek ve sakinleri davet edebilmek için blok ve daireleri oluşturmalısınız.")
  3. 3 Adımlı Aksiyon:
     - Adım 1: Excel şablonunu indirin veya tek tek ekleyin.
     - Adım 2: Dairelerin arsa paylarını ve m² değerlerini girin.
     - Adım 3: Sakinleri eşleştirin.
  4. Birincil Eylem Butonu: `[ + İlk Daireyi Ekle ]` veya `[ Excel'den İçe Aktar ]`.
