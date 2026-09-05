---
name: anti-ai-slop-ui
description: Yapay zekanın ürettiği klişe, tekdüze ve jenerik arayüzleri (mor gradient metinler, içi boş bento gridler, aşırı yuvarlatılmış kartlar, yapay glow efektleri) engelleyen; zanaat odaklı, sofistike, editoryal ve modern web tasarım standartları skilli.
---

# Anti-AI-Slop Tasarım Manifestosu & Klişe Önleme Kılavuzu

Bu beceri (skill), AI ajanlarının kod üretirken veya UI tasarlarken varsayılan olarak düştüğü "yapay zeka şablonu" (AI-slop) tuzaklarını engellemek ve projenin arayüzüne **Linear, Stripe, Mercury, Raycast** seviyesinde insan eliyle işlenmiş (human-crafted) bir zarafet ve özgünlük kazandırmak için vardır.

---

## 1. Kesin Olarak Yasaklanan Klişeler (DON'T)

Aşağıdaki desenler web üzerindeki milyonlarca jenerik yapay zeka çıktısının ortak günahlarıdır ve bu projede **kesinlikle kullanılamaz**:

### ❌ 1. Mor-Mavi Gradyan Başlıklar & Gradyan Metinler
- **Klişe:** `bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 bg-clip-text text-transparent`
- **Neden Yasak:** 2023-2024 AI wrapper sitelerinin en ucuz simgesidir. Ciddiyeti, kurumsallığı ve güveni anında öldürür.
- **Doğrusu:** Net, yüksek kontrastlı tipografi. Hiyerarşiyi renk geçişiyle değil; font ağırlığı, boyutu ve semantik metin renkleriyle (`text-fg`, `text-fg-muted`) kurun.

### ❌ 2. Aşırı Kartlaşma (Card-Soup / Kutu İçinde Kutu Sendromu)
- **Klişe:** Her bilgi parçasını `rounded-2xl border bg-white p-6 shadow-lg` içine koymak; sonra o kartın içine başka kartlar yerleştirmek.
- **Neden Yasak:** Ekranı hantallaştırır, hiyerarşiyi yok eder, arayüzü çocuksu veya toy bir mobil uygulama gibi gösterir.
- **Doğrusu:** Bilgiyi yapılandırmak için her zaman kart gerekmez. Çoğu zaman **ritmik dikey boşluklar, hafif 1px kılavuz çizgileri (`divide-y`, `border-border`), zemin ayrımı (`bg-canvas` vs `bg-surface`) ve tipografik hiyerarşi** karttan çok daha şık ve temiz bir ayrım sağlar.

### ❌ 3. Süs Amaçlı Neon Glow / Ambient Blur Arka Planlar
- **Klişe:** Köşelere veya hero arkasına yerleştirilen devasa bulanık mor/mavi daireler (`blur-3xl opacity-30 bg-purple-500 rounded-full`).
- **Neden Yasak:** Tasarımda içerik veya fonksiyon eksikliğini gizlemek için kullanılan ucuz bir makyajdır.
- **Doğrusu:** İnce, mimari çizgiler (`border-border`), yapılandırılmış bir grid düzeni veya gerçek ürün arayüzünün net bir kesiti.

### ❌ 4. Jenerik 3 Sütunlu "Hızlı - Kolay - Güvenli" İkon Kutuları
- **Klişe:** Ortalanmış devasa bir Lucide ikonu, altında kalın bir başlık, altında 2 satır jenerik metin olan 3 yan yana kart.
- **Neden Yasak:** Kullanıcıya hiçbir bilgi vermez, göz bu kutuları doğrudan atlar.
- **Doğrusu:** İçeriğe dayalı asimetrik düzenler, gerçek ekran önizlemeleri veya çalışan mini-araçlar (örneğin interaktif aidat hesaplama, gecikme faizi simülatörü).

### ❌ 5. Aşırı Şişirilmiş Border-Radius (Pill / Bubble Görünümü)
- **Klişe:** `rounded-3xl` butonlar, `rounded-[2.5rem]` paneller.
- **Neden Yasak:** Profesyonel ve kurumsal bir FinTech/PropTech aracını oyuncak arayüzüne çevirir.
- **Doğrusu:** Kararlı, mühendislik hassasiyeti veren yarıçaplar: Buton ve girdilerde `rounded-md` / `rounded-lg`, kart ve panellerde en fazla `rounded-xl`.

---

## 2. Özgün ve Sofistike Tasarım İlkeleri (DO)

### ✅ 1. Editoryal & Endüstriyel Tipografi Disiplini
- **Hiyerarşik Kontrast:** Büyük başlıklar ile gövde metni arasında net bir boyut ve ağırlık sıçraması olmalıdır (`text-3xl font-semibold tracking-tight` ile `text-sm text-fg-muted`).
- **Teknik Etiketler (Micro-Labels):** Bölüm başlıklarının üstüne, tablolara veya durum kartlarına `text-[11px] font-mono uppercase tracking-wider text-fg-subtle` formatında monospaced teknik etiketler ekleyerek "mühendislik hassasiyeti" hissi yaratın.
- **Tabular Sayılar:** Tüm finansal, tarihsel ve ölçümsel verilerde rakamların genişliklerinin eşit olması için `font-mono` veya `tabular-nums` sınıfını **istisnasız** kullanın.

### ✅ 2. Çizgisel Zarafet (Precision Borders & Structural Grid)
- Gölgelerle (`shadow-2xl`) katman yaratmak yerine, hafif ve kararlı kenarlıklar (`border border-border`) tercih edin.
- İki panel veya kolon arasındaki ayrımı kalın margin yerine `border-r border-border` gibi mimari hatlarla çözün.
- Hover (üzerine gelme) durumlarında tüm kartı havaya kaldırmak yerine (`hover:-translate-y-2` gibi hantal efektler yerine), kenarlık renginin rafine şekilde parlamasını sağlayın (`hover:border-border-strong`).

### ✅ 3. Yüzey Katmanlaşması (Surface Elevation Hierarchy)
Projedeki semantik yüzeyleri derinlik yaratmak için mantıklı bir sırada kullanın:
1. `bg-canvas`: En arka taban zemin (genellikle hafif sıcak taş veya açık grid tonu).
2. `bg-surface`: Ana kartlar, tablolar ve içerik konteynerleri.
3. `bg-surface-raised`: Açılır menüler (dropdown), modallar, popover'lar.
4. `bg-surface-sunken`: Arama çubukları, tablo başlıkları, pasif girdi alanları.

### ✅ 4. "Gösterme, Yaşat" (Show, Don't Tell)
- Pazarlama sayfalarında ve panoda süs illüstrasyonları yerine:
  - Canlı bir işletme projesi pasta grafiği,
  - Gerçek bir apartman karar defteri tutanağı önizlemesi,
  - Kat mülkiyeti kanununa göre hesaplanan dinamik gecikme tazminatı mini hesaplayıcısı.

---

## 3. Kod Örneği Kıyaslaması

### ❌ Yanlış (Tipik AI-Slop):
```tsx
// KÖTÜ: Jenerik AI tasarımı
<div className="p-8 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-purple-200 shadow-2xl backdrop-blur-xl">
  <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white mb-4 shadow-blue-500/50 shadow-lg">
    <Shield className="w-6 h-6" />
  </div>
  <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
    Güvenli ve Kolay Yönetim
  </h3>
  <p className="text-slate-600 mt-2">
    Yapay zeka destekli altyapımızla apartmanınızı kolayca yönetin.
  </p>
</div>
```

### ✅ Doğru (Modern, Endüstriyel, Özgün):
```tsx
// İYİ: Özgün, kurumsal, zanaat hissi veren PropTech tasarımı
<div className="group relative rounded-xl border border-border bg-surface p-6 transition-colors hover:border-border-strong">
  <div className="flex items-center justify-between gap-4">
    <span className="font-mono text-[11px] font-medium tracking-wider text-fg-subtle uppercase">
      KMK Madde 20 Uyumlu
    </span>
    <span className="inline-flex items-center rounded-md border border-border bg-surface-sunken px-2 py-0.5 font-mono text-xs text-fg-muted">
      0.00% Hata
    </span>
  </div>
  
  <h3 className="mt-3 text-base font-semibold tracking-tight text-fg">
    Otomatik Gecikme Tazminatı Hesabı
  </h3>
  
  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
    Vadesi geçen aidatlara kanuni aylık %5 faizi günlük bazda hatasız işler, borç dökümünü tek tıkla icra icmallerine dönüştürür.
  </p>
</div>
```

---

## Özet Kural
Bir ekran tasarlarken kendine şu soruyu sor:
> *"Bu ekran, 10 saniye önce ChatGPT/v0 tarafından üretilmiş sıradan bir web şablonuna mı benziyor, yoksa Linear veya Stripe tasarım ekibinin haftalarca düşünüp milimetrik olarak işlediği bir PropTech aracına mı?"*
Cevap ikincisi olana kadar sadeleştir, rafine et, tipografiyi güçlendir ve süsleri temizle.
