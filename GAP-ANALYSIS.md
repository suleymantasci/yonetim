# GAP-ANALYSIS.md — Eksik Özellikler & İyileştirme Yol Haritası

> 📌 **Güncel durum için [`PROJE-DURUMU.md`](./PROJE-DURUMU.md)'ya bakın.** Bu
> dosya 2026-07-26 tarihli ilk tespit turunu anlatır (tarihsel kayıt); hangi
> maddelerin yapıldığı, hangi kararların değiştiği ve yeni özellik fikirleri
> artık tek bir dosyada toplanıyor.

> **Referanslar:**
> - [`SPEC.md`](./SPEC.md) — ürün şartnamesi (her bölüm referans olarak anılır)
> - [`README.md`](./README.md) — kurulum, mimari, kabul kriterleri özeti
> - [`GAP-DURUM.md`](./GAP-DURUM.md) — **hangi maddeler uygulandı**, alınan mimari kararlar ve bu dokümanda düzeltilen varsayımlar
> - Bu dosya **kod üretmek için talimat değildir**; sadece eksikleri ve isterleri tanımlar. Çözüm kararları bu dokümanı okuyan AI'a bırakılmıştır.

> ⚠️ **Not:** Aşağıdaki "yok / eksik" ifadeleri bu dokümanın yazıldığı andaki
> durumu anlatır. Sprint 1 kapsamı ve vurucu özelliklerden Audit Timeline
> uygulandı; güncel durum için `GAP-DURUM.md`'ye bakın.

---

## İçindekiler

1. [Amaç & Kapsam](#1-amaç--kapsam)
2. [Mevcut Durum Özeti](#2-mevcut-durum-özeti)
3. [Rakip Analizi — Saha Bulgusu](#3-rakip-analizi--saha-bulgusu)
4. [Eksikler — Kategorize Defter](#4-eksikler--kategorize-defter)
   - 4.1 [İşlevsel (Feature) Eksikleri](#41-işlevsel-feature-eksikleri)
   - 4.2 [Veri Modeli, İş Kuralları ve İlişkisel Tutarsızlıklar](#42-veri-modeli-iş-kuralları-ve-ilişkisel-tutarsızlıklar)
   - 4.3 [UI / UX — Sayfa Başına Detay Sorunları](#43-ui--ux--sayfa-başına-detay-sorunları)
   - 4.4 [Sidebar, Navigation & Mobil Deneyim](#44-sidebar-navigation--mobil-deneyim)
   - 4.5 [Landing Page (Pazarlama) Eksikleri](#45-landing-page-pazarlama-eksikleri)
   - 4.6 [Bildirim, Geri Bildirim, Loading & Boş Durum](#46-bildirim-geri-bildirim-loading--boş-durum)
   - 4.7 [Tema, Erişilebilirlik & Çoklu Dil Tutarlılığı](#47-tema-erişilebilirlik--çoklu-dil-tutarlılığı)
   - 4.8 [Gözlemlenebilirlik, Hata Yönetimi & Performans](#48-gözlemlenebilirlik-hata-yönetimi--performans)
5. [Vurucu Eksikler — Öncelikli Özellikler](#5-vurucu-eksikler--öncelikli-özellikler-killer-features)
6. [Önceliklendirme Önerisi — 4 Sprint](#6-önceliklendirme-önerisi--4-sprint)
7. [Teknik Borç & Mimari Notlar](#7-teknik-borç--mimari-notlar)
8. [Açık Sorular & Karar Bekleyenler](#8-açık-sorular--karar-bekleyenler)
9. [Kabul Kriterleri](#9-kabul-kriterleri)

---

## 1. Amaç & Kapsam

Bu doküman, SPEC.md ile mevcut kod tabanı arasındaki boşluğu ortaya koyar. Üç seviyede analiz yapar:

| Seviye | İçerik | Hedef Kitle |
| --- | --- | --- |
| **İşlevsel** | Kullanıcının yapamadığı, eksik olan modül/özellik | Ürün yöneticisi |
| **Veri & İş Kuralı** | Schema, hesaplama veya ilişki tutarsızlığı | Backend geliştirici |
| **UI / UX** | Görsel/işlevsel arayüz eksiği, akış tutarsızlığı, mobil/erişilebilirlik | Tasarımcı + Frontend |

**Kapsam dışı:**
- Faz 17 — Mobil uygulama (canlı çıkıştan sonra) → SPEC Bölüm 17.
- Marka/domain değişikliği → SPEC Bölüm 4.4 `siteConfig` ile tek dosyadan yönetilecek.

---

## 2. Mevcut Durum Özeti

### 2.1 Çalışıyor olan kısımlar

- Monorepo mimarisi (pnpm + turborepo + Next.js 15 + TS strict)
- Drizzle ORM + RLS (63 tablo, ~17 zamanlanmış iş, 167 birim testi)
- Domain/marka konfigürasyonu tek dosyada (`packages/config/src/site.ts` — SPEC Bölüm 4.4 uyumlu)
- Better Auth + RBAC, audit infrastructure
- Server-side i18n (next-intl), TR varsayılan
- Tema toggling (light/dark/system)
- Marketing site (web) — fiyatlandırma, kampanya, özellik, blog, rehber sayfaları
- Marketing sayfaları JSON-LD schema ile SEO uyumlu, `llms.txt` mevcut
- Programmatic SEO: `/[slug]` site landing pages
- KVKK denetim altyapısı (`data_access_logs`, audit trail, immutable log triggers)
- Önemli hesaplama paketleri: `dues` (borç formüller, gecikme tazminatı, KMK, simülatör), `pricing`, `campaigns`
- Whatsapp state machine (testlerle), bildirim şablonları, kanal yönlendirme mantığı
- Dashboard özet metrikleri, alacak toplamı, gecikme özeti

### 2.2 Çalışmayan / UI eksik olan ana alanlar

| Kategori | Durum |
| --- | --- |
| **Panel CRUD akışları** | Salt okunur; sadece `page.tsx` ile liste. `/yeni`, `/[id]`, `/[id]/duzenle` rotaları yok |
| **API rotaları** | Sadece `cron`, `health`, `oturum`, `public`, `webhooks` var. CRUD için `api/v1/...` rotası yok |
| **Detay sayfaları** | Birim/sakin/borç/gider için detay sayfası yok |
| **İç içe CRUD akışları** | Sayfa değiştirmeden ilişkili kayıt (kiracı, birim, kategori) oluşturma yok |
| **Mobil sidebar** | `hidden lg:block` ile tamamen gizli, açma mekanizması (drawer/overlay) yok |
| **Ortak UI bileşenleri** | Modal, Drawer, Sheet, Toast, Command palette, Combobox — hiç yok |
| **Grafik bileşenleri** | Chart kütüphanesi yok, dashboard'da hiç grafik yok |
| **Form yönetim katmanı** | RHF/Zod entegrasyonu tutarsız, Server Action yaklaşımı standartlaşmamış |
| **Marka görsel kimlik** | Logo yok, site fotoğrafı yükleme/yerleştirme UI yok |
| **Pazarlama landing** | Düz metin; hiç görsel/video/motion yok |
| **Dashboard** | Statik; widget mimarisi yok, layout özelleştirme yok |
| **Toplu işlemler** | Çoklu seçim + action bar UI yok |
| **Sakin portalı** | `/sakin` layout var, içerik sayfası yok |
| **Rezervasyon** | Takvim görünümü yok |
| **Talep (arıza)** | Yorum thread, dosya ekleme, atama UI yok |
| **Toplantı** | Gündem, oylama, tutanak UI yok |
| **Hukuk/icra** | Aşama kartları, avukat atama UI yok |
| **KVKK talep gelen kutusu** | UI minimal, yanıt akışı eksik |
| **Audit log** | Diff/aksiyon görselleştirme minimal |
| **Duyuru planlama** | Zamanlama, hedef kitle, kanal seçimi eksik |
| **Bakım atama** | SLA paneli, öncelik, kişi atama UI yok |
| **Personel bordrosu** | Maaş + SGK UI yok |
| **Çoklu dil (geniş)** | Sadece TR aktif; EN/AR/RU arayüz çevirisi eksiksiz değil, locale switch var ama yetersiz |
| **Yardım / Help Center** | SSS pazarlama tarafında var; ürün içi help/tooltip yok |

---

## 3. Rakip Analizi — Saha Bulgusu

> SPEC Bölüm 1'deki rakipler: Apsiyon, Biyos, Dijiyon, Yonetimcell. Çoğu sayfa JS-shell olduğundan otomatik crawl zayıf. Doğrulanan + çıkarımlar aşağıda.

### 3.1 Yonetimcell (kaynak: program-ozellikleri-detay.html, kullanici-yorumlari.html)

**Doğrulanan fark yaratan özellikler:**
- Hem daire bazlı hem üye bazlı cari hesap takibi (tek kişi → tek cari; birden fazla birim tek cari)
- Bir taşınmazda malik, kiracı, eski malik, eski kiracı, hissedarlar **ayrı ayrı cari hesap**
- Bir kişi birden fazla taşınmazda → tek cari
- Kiracı birden fazla taşınmazda → tek cari
- Araç plakası ve ikamet eden kaydı (yardımcı tablolar)
- Bireysel **ve** toplu tutarla borçlandırma
- Aidat grubu (plan) kavramı: farklı kalemleri (aidat, yakıt, su, demirbaş, ek gider) gruplama
- m², arsa payı, endeks değerlerine göre **veya eşit** paylaşım; **ısıölçer** ve **sıcak su kalorimetre** hesabı
- Gecikme cezası: **günlük** veya **dönemsel**; ara tahsilat girildiğinde yeniden hesap (haksız uygulama engellenir); **yalnız seçilen başlıklara** veya **seçilen borçlara** uygulanabilir
- Borç hatırlatma **hem malike hem kiracıya**, yalnız birinin borcunda diğerine bilgilendirme
- Banka hesap dökümü otomatik aktarım + kolay eşleştirme (isim, telefon, TCKN)
- Cari hesap takibi: firmalar, personel için ayrı
- Site yönetimleri için **özel CMS olarak çalışan web sitesi**, sakine özel giriş
- Personel için ayrı cari; sanal santral; iş-takip uygulaması (mobil ayrı)
- Yönetim için 4 ayrı uygulama: Yönetici, Denetçi, Güvenlik, İş Takip

**Şikâyet / beklenti bulguları (kullanıcı yorumları):**
- Bazı daireleri taksitlendirip kalan bakiyeye faiz yürütme **mümkün değil** (manuel hesap)
- 102 daireden 20'sine farklı gecikme uygulamak için **manuel** hesap gerekiyor
- Yurt dışı telefonu alanı yok (10 hane sınırı — muhtemelen TR GSM)
- Mütekaiti satıp isim değiştirirken tek başına değiştirilemiyor
- Komisyon/hizmet bedeli şeffaf değil (kartla öderken %2 gizli)
- Borç hatırlatma metni ev sahibine gidiyor ama kiracıya değil; kiracı için ayrı bilgilendirme isteniyor
- Yönetim firmaları kendi mail hesaplarını (proplar) açmak/değiştirmek istiyorlar — panel yetkisi yok

### 3.2 Çıkarımlar (doğrulanamayan — JS-shell sayfalar)

| Rakip | İddia | Bizdeki karşılığı |
| --- | --- | --- |
| **Apsiyon** | Akbank kampanyası (24 ay ücretsiz, sonra pazarlık), sertifikalı eğitim, AVM sayaç okuma, telefon santral, güvenlik donanımı | Fintech kampanyası: SPEC Bölüm 16'da kendi kampanya motorumuz var; donanım entegrasyonları: Faz 17'den sonra |
| **Biyos** | Sade UI, ücretsiz başlangıç planı, iOS+Android app | Ücretsiz plan: yok (kart bilgisi istemeyen 1 ay deneme var); mobil: Faz 17 |
| **Dijiyon** | Elektrikli araç şarj istasyonu yönetimi, icra takip modülü, avukatlık | EV şarj: yok; icra/avukat atama: SPEC Bölüm 6.12'de var ama UI yok |
| **Yonetimcell** | Çoklu ayrı uygulama, kampanya motoru, hediye SMS, yüksek fiyat | Kampanya motoru: kod var (`packages/campaigns`), UI yok |

### 3.3 Rakip UX gözlemleri

- **Yonetimcell UI görsel olarak eski** (kullanıcı yorumu: "biraz daha görsellik katabilirsiniz").
- **Apsiyon UI eski**, mobil UX tutarsız.
- **Biyos sade ama güçsüz** hissettiriyor.
- Hiçbiri **sayfa değiştirmeden ilişkili kayıt oluşturma** UX'ini öne çıkarmış değil; modern SaaS beklentisi (Linear, Notion, Stripe Dashboard örneği) bu yönde.
- Hepsi **TR masaüstü öncelikli** — mobil UX ya legacy ya da afterthought.

### 3.4 Vurucu özelliklerimiz için sahne

Yukarıdaki bulgular, SPEC Bölüm 3'teki vurucu özellik listesiyle doğru orantılı:
- **WhatsApp-First** → rakipler yok.
- **Audit Timeline (borç değişikliği)** → Apsiyon/Yonetimcell'in en büyük şikâyeti olan geriye dönük zammı çözer.
- **Şeffaf komisyon** → Yonetimcell kullanıcı şikâyeti.
- **Gecikme tazminatında esnek seçim** → Yonetimcell kullanıcı isteği.
- **Borç hatırlatmada kiracı+malik ayrımı** → Yonetimcell kullanıcı isteği.

---

## 4. Eksikler — Kategorize Defter

> Her alt başlıkta: **Sorun**, **Beklenen davranış**, **Etkilenen roller**, **Spec referansı**. Çözüm kararı AI'a bırakılmıştır.

### 4.1 İşlevsel (Feature) Eksikleri

#### 4.1.1 Bağımsız Bölüm (Unit) CRUD

**Sorun:** `/panel/birimler` salt okunur. Yeni blok/daire ekleme, düzenleme, silme UI yok. Mevcut giriş tek yolu: seed/import.

**Beklenen davranış:**
- Yeni birim ekleme (tek tek)
- Toplu birim ekleme (örn. tüm A blok otomatik, 1-10, A-1...A-10)
- Birim düzenleme (alan, arsa payı, tip, muafiyet, kat, no, oda sayısı)
- Birim **soft-delete** (KVKK'ya uygun 30 gün çöp kutusu; kalıcı silme değil)
- Toplu düzenleme (örn. tüm birimlere %10 zam uygulaması)
- **Birim detay sayfası** (`/panel/birimler/[id]`): bu birimin sakinleri, borçları, ödemeleri, sayaçları, geçmişi, dökümanları tek ekranda sekmeli görünüm
- Birim üzerinden hızlı işlem: yeni sakin ata, yeni borç oluştur, yeni sayaç okuma, dosya yükle

**Etkilenen roller:** Yönetici
**Spec referansı:** Bölüm 5.3 (units), 6.1

#### 4.1.2 Sakin (Resident) CRUD + Malik/Kiracı Ayrımı

**Sorun:** `/panel/sakinler` tek satır = tek kişi gibi davranıyor; **malik-kiracı ayrımı görsel değil**. Bir kişinin birden fazla birimdeki ilişkisi (`unitOccupancies` tablosu) görünmüyor. İlişki geçmişi yok.

**Beklenen davranış:**
- Sakin ekleme (ad, soyad, TCKN, telefon, e-posta, IBAN, acil durumda aranacak kişi, KVKK aydınlatma checkbox)
- Sakin **detay sayfası**: bu kişinin birimleri, ilişkileri, tüm faturaları, ödediği/ödeyeceği, belge kutusu, KVKK izni, WhatsApp opt-in durumu
- **Bir sakinin birden fazla birimdeki** ilişkilerini görmek (Yonetimcell "tek cari" yaklaşımı)
- Malik-kiracı geçiş tarihi, kontrat dosyası, hisse oranı yönetimi
- **Kiracı ayrılma akışı**: bakiyenin yeni kiracıya veya malike devir seçimi (borç paylaşımı politikası `debtTransferPolicy` zaten tabloda)
- TCKN, telefon masking (KVKK uyumu)
- Sakinin tek numaraya **birden fazla birimde** sahip olması UI'da görünmeli

**Etkilenen roller:** Yönetici, sakin (kendi profili)
**Spec referansı:** Bölüm 5.3 (users, unitOccupancies), 6.1, 14.1

#### 4.1.3 Borçlandırma (Dues / Charges)

**Sorun:** `/panel/aidat` planları gösteriyor; `/panel/borclar` daire bazlı özeti gösteriyor. **Plan oluşturma, tek borç girme, toplu borç girme, indirim uygulama yok**. `audit_debt_changes` tablosu mevcut ama UI yok. `packages/dues/src/kmk.ts` mevcut ama kullanıcıya gösterilmiyor.

**Beklenen davranış:**

**Borç (debt) ekleme:**
- Tek birime tek borç veya çoklu kalem (su + yakıt + aidat + ek gider)
- Birden fazla birime toplu borç (tüm A blok, tüm 3. kat, vs.)
- Borç paylaşımı seçimi: yalnız malike, yalnız kiracıya, yarı yarıya, hisseye göre, kiracı bırakınca malike devir
- Ödeme vadesi, kısmi ödeme planı, taksitlendirme (Yonetimcell'de eksik — bizde olsun)
- Gecikme tazminatı **seçilen başlıklara** uygulama (Yonetimcell şikâyetini çözen)

**Aidat planı (duesPlan) ekleme:**
- Plan adı, periyot (aylık/3 aylık/6 aylık/yıllık)
- Formül: eşit / m² / arsa payı / kalorimetre / sayaç / karma
- m², arsa payı endeksi
- Gecikme tazminatı % (aylık veya günlük)
- Vade tarihi, başlangıç-bitiş periyodu
- Hangi bloklara uygulandığı filtresi

**Borç detay sayfası:**
- Borç özeti, kısmi ödemeler
- **Audit timeline** (vurucu özellik — SPEC Bölüm 3.2; mevcut kod görsel değil)
- "Değişiklik tarihçesi" kart akışı (eski tutar → yeni tutar, değiştiren kişi, tarih, gerekçe)
- Ödeme tahsil et, iptal, düzelt (KVKK audit'li)
- Borç dokümanları

**Toplu borç sihirbazı:**
- Dosyadan Excel/CSV import
- Manuel seçim (filtre ile)
- Önizleme, onay, çalıştırma

**Etkilenen roller:** Yönetici, sakin
**Spec referansı:** Bölüm 3.2 (Audit Timeline — VURUCU), 6.1

#### 4.1.4 Gider (Expense) Yönetimi — Özelleştirilebilir Kategoriler

**Sorun:** `/panel/giderler` giderleri gösteriyor; **kategori yönetimi yok**. `expenseCategories` tablosu var (`EXPENSE_CATEGORY_SEED`), UI'da yeni kategori **eklenemiyor**. Bir gider `categories` ID ile eşleşiyor; UI ekleme yapamazsa gider kaydı **eksik kalır**.

**Beklenen davranış:**
- Gider kategorileri CRUD (ad, ikon, renk, KDV oranı, paylaşım formülü: ortak / m² / arsa payı / kalorimetre / sayaç / kişi sayısı / özel)
- **Hiyerarşik kategoriler** (örn. "Personel Maaşı > Kapıcı", "Personel Maaşı > Güvenlik")
- Gider ekleme (tarih, kategori, alt kategori, tedarikçi, tutar, KDV, açıklama, dosya/fatura yükleme, ödeme yöntemi)
- **Gider → Birim eşleştirmesi**: bu gider hangi dairelere yansıyacak (otomatik formül veya manuel)
- Gider onay/iptal/red akışı
- Tekrarlayan gider şablonu (aidat, faturalar için)
- Gider **detay** sayfası

**Etkilenen roller:** Yönetici
**Spec referansı:** Bölüm 6.2

#### 4.1.5 Sayaç Okumaları + Fatura Yönetimi

**Sorun:** Sayaç modülü sadece liste; **okuma girişi, tüketim hesabı, trend analizi yok**.

**Beklenen davranış:**
- Sayaç tanımı (su, doğalgaz, elektrik, kalorimetre) — marka, seri no, okuma birimi
- Okuma girişi (tek tek veya toplu — Excel/CSV import)
- Tüketim otomatik hesap (önceki - şimdiki)
- **Birim fiyat × tüketim × paylaşım** formülü
- Fatura fotoğrafı → OCR ile değer okuma (vurucu özellik adayı)
- **Trend grafik** (aylık tüketim, anomali uyarısı — birim başına)
- Sayaç fotoğrafı yükleme

**Etkilenen roller:** Yönetici, sakin (kendi dairesinin tüketim trendi)
**Spec referansı:** Bölüm 6.9

#### 4.1.6 Duyuru Oluşturma — Yayınlama, Zamanlama, Hedef Kitle

**Sorun:** `announcement-composer.tsx` var ama **yayınlama, zamanlama, hedef kitle, kanal seçimi, acil override** yok.

**Beklenen davranış:**
- Hedef kitle seçimi (dinamik koşullar): örn. "X blok VE aidat borcu > 500 TL olan sakinler"
- Zamanlama: hemen / T-X gün / belli tarih / tekrarlayan
- Kanal yönlendirme stratejisi (WhatsApp önce, SMS fallback, e-posta arşiv)
- **Acil durum override**: tüm kanallar + sesli arama opsiyonu (SPEC Bölüm 8.1)
- **KVKK filtresi**: "X dairesi borçlu" gibi ifadeler otomatik reddet (SPEC Bölüm 6.4)
- Okundu/teslim raporu (kanal kırılımı)
- Duyuru şablonları (yeni ay hatırlatma, gecikme uyarısı, toplantı daveti, v.b.)

**Etkilenen roller:** Yönetici, sakin
**Spec referansı:** Bölüm 6.4, 8.1, 8.2

#### 4.1.7 Anket / Toplantı / Hukuk — Tam Akış

**Sorun:** Üç modülün (anketler, toplantılar, hukuk) sayfaları var ama:
- Anket **oluşturma**, oy verme UI'ı yok
- Anket sonuç **görselleştirme** yok
- Anket **KMK yeter sayısı** kontrolü (`packages/dues/src/kmk.ts` mevcut) UI'a bağlı değil
- Toplantı **gündemi, katılım, karar taslakları, oylama, tutanak** UI'ı yok
- Hukuk/icra **aşama kartları, avukat atama, belge yükleme, hatırlatma** yok

**Beklenen davranış:**

- Anket oluşturma (tek/çok şık, açık uçlu, anonim/açık)
- Oy oranı: arsa payı veya eşit (KMK md. 31/32'ye uygun)
- Sonuç görselleştirme + PDF çıktı (SPEC Bölüm 6.5)
- Toplantı oluşturma (tarih, saat, yer, gündem)
- Katılım çağrısı (SMS/WhatsApp/e-posta, T-15, T-7, T-1)
- Gündem + karar taslakları
- Tutanak oluşturma (otomatik doldurma)
- Tutanak dağıtımı (e-imza opsiyonu)
- İhtarname oluşturma (90+ gün gecikme → taslak)
- Avukat atama (anlaşmalıysa tek tık, değilse yönlendirme — SPEC Bölüm 6.12)
- İcra aşamaları (8 aşama) takip kartı

**Etkilenen roller:** Yönetici, sakin, denetçi
**Spec referansı:** Bölüm 6.5, 6.6, 6.12

#### 4.1.8 Rezervasyon Sistemi (Salon, Otopark, Misafir Odası, vs.)

**Sorun:** Rezervasyon modülü sadece placeholder liste. **Kaynak tanımı, takvim görünümü, online rezervasyon, çakışma kontrolü, ücret yansıtma** yok.

**Beklenen davranış:**
- Kaynak tanımı (ad, fotoğraf, ücret, saatler, kurallar)
- **Aylık/haftalık takvim görünümü** (drag-and-drop ile aralık seçimi)
- Çakışma kontrolü + onay mekanizması
- Rezervasyon ücreti → otomatik borç veya online ödeme linki
- İptal/erteleme politikası, hasar depozitosu yönetimi
- Temizlik takvimi

**Etkilenen roller:** Yönetici, sakin
**Spec referansı:** Bölüm 6.7

#### 4.1.9 Talep (Arıza / Şikayet / Bakım Talebi) Yönetimi

**Sorun:** Talepler sayfası salt liste. **Talep oluşturma, atama, yorum thread, dosya ekleme, SLA paneli, kategori bazlı yönlendirme** yok.

**Beklenen davranış:**
- Talep oluşturma formu (sakin veya yönetici, kategori, foto, öncelik, birim)
- SLA tanımı (kritik: 4 saat, yüksek: 24 saat, normal: 3 gün)
- Atama (yönetici / personel / dış firma)
- Yorum thread + foto ekleme (sakin ↔ yönetici ↔ atanan)
- **SLA ihlal alarmı** + yönetici push
- Dahili not (assigned kişiye görünür, sakine değil)
- Durum akışı (yeni → atandı → devam ediyor → çözüldü → kapatıldı)
- Tedarikçi puanlama

**Etkilenen roller:** Yönetici, sakin, personel, dış firma
**Spec referansı:** Bölüm 6.3

#### 4.1.10 Bakım Takvimi (Periyodik Bakım Hatırlatma)

**Sorun:** Bakım modülü sadece liste. **50+ bakım şablonu** (MEVCUT seed) var; UI'da **bakım planı oluşturma, hatırlatma, belge yükleme, sonraki tarih** akışı yok.

**Beklenen davranış:**
- Bakım şablonundan **bakım planı** oluşturma (asansör, hidrofor, jeneratör, yangın söndürücü, haşere, baca temizliği, topraklama,...)
- Otomatik hatırlatma T-30/T-15/T-7/T-0/T+3 gün (yönetici + sakin WhatsApp'tan)
- Bakım sonrası fatura + muayene raporu yükleme
- Sonraki tarih otomatik
- Yasal dayanak referansı (bakım şablonu `regulatory_ref` alanı zaten tabloda)
- **3 firmadan teklif talebi** (eşiğin üstünde)

**Etkilenen roller:** Yönetici
**Spec referansı:** Bölüm 3.7, 6.3

#### 4.1.11 Personel Yönetimi

**Sorun:** Personel modülü sadece liste. **Maaş + SGK, izin/avans, giriş-çıkış, vardiya** UI'ı yok.

**Beklenen davranış:**
- Personel CRUD (kapıcı, güvenlik, temizlik, bahçıvan)
- Maaş + SGK primi (asgari ücret parametreleri ile)
- İzin/yıllık takibi
- Avans takibi
- **Mobil konum + parmak izi ile giriş-çıkış** (personel için ayrı sayfa)
- Vardiya planlaması (drag-drop haftalık)
- Kıdem/ihbar hesabı
- Bordro oluşturma + toplu banka transferi

**Etkilenen roller:** Yönetici, personel (ayrı portal)
**Spec referansı:** Bölüm 6.8

#### 4.1.12 Mesajlaşma — Uygulama İçi + WhatsApp Köprüsü

**Sorun:** Mesajlar sayfası var; **birebir sohbet, WhatsApp köprüsü, toplu mesaj, medya, durum** yok.

**Beklenen davranış:**
- Uygulama içi birebir mesajlaşma (yönetici ↔ sakin)
- **WhatsApp köprüsü**: Sakine WhatsApp'tan gelen mesaj → yönetici web'den yanıtlar → sakine WhatsApp gider
- Toplu mesaj (duyurudan farkı: interaktif, alınan yanıtlar döner)
- Konuşma geçmişi, medya (foto, sesli not, dosya)
- Hazır yanıt şablonları

**Etkilenen roller:** Yönetici, sakin
**Spec referansı:** Bölüm 6.11

#### 4.1.13 KVKK Talep Yönetimi + Risk Skoru

**Sorun:** KVKK sayfası var; **talep gelen kutusu, 72 saat geri sayım, veri paketi oluşturma, risk skoru UI** minimal.

**Beklenen davranış:**
- Gelen talepler gelen kutusu (md.11 bilgi alma, md.7 silme)
- **72 saat geri sayım** (KVKK md.11)
- Otomatik **veri paketi** üretimi (PDF + JSON, sıkıştırılmış)
- Silme talebi → onay → anonimleştirme pipeline
- **"KVKK risk skoru"** (0-100) gösterimi
- Açık rıza yönetimi (her sakine: tam onay / kısmi onay / ret)
- Aydınlatma metni versiyonlama (kabul anında versiyon kaydı)

**Etkilenen roller:** Yönetici, DPO (süper-admin), sakin
**Spec referansı:** Bölüm 3.3 (VURUCU — Self-Service KVKK Denetim Kütüğü), 14.1

#### 4.1.14 Audit Log Görüntüleme + Diff

**Sorun:** `audit_logs` tablosu ve trigger'lar mevcut; UI minimal. **Kim ne yaptı, eski-yeni diff, KVKK izleme** görsel değil.

**Beklenen davranış:**
- Filtreler (tarih aralığı, kullanıcı, aksiyon tipi, resource)
- Diff görselleştirme (eski ↔ yeni değer yan yana)
- İlişkili aksiyonlar (aynı request'ten türeyenler)
- Sakin için "verinize erişildi" bildirimleri
- Export (CSV, JSON, Excel — denetim için)

**Etkilenen roller:** Süper-admin, denetçi, DPO
**Spec referansı:** Bölüm 14.1, 14.2, 5.3

#### 4.1.15 Banka Entegrasyonu — Çoklu Aggregator

**Sorun:** Banka sayfası var ama **hareket eşleştirme UI, polling fallback, manuel eşleştirme, mismatch uyarısı** minimal.

**Beklenen davranış:**
- Banka hesaplarını bağlama (Param Open Banking / BKM Express / iyzico)
- Hareketleri otomatik eşleştirme (kural motoru)
- Manuel eşleştirme drag-drop (işlem → aidat/debt)
- Mismatch uyarısı ve retry
- İşlem kategori etiketleme
- Aylık mutabakat raporu

**Etkilenen roller:** Yönetici
**Spec referansı:** Bölüm 3.10 (VURUCU), 7.2

#### 4.1.16 Sakin Portalı (Self-Service)

**Sorun:** `/sakin` layout var, içerik sayfası yok. Sakin için:
- Borç sorgulama, ödeme
- Duyurular, dokümanlar
- Talepler, rezervasyon
- Profil yönetimi, KVKK talep
- WhatsApp opt-in toggle

tüm bunlar UI'da yok.

**Beklenen davranış:**
- Borç sorgulama + online ödeme (iyzico Checkout)
- Geçmiş ödemeler, makbuz indirme
- Aktif duyurular, okundu işaretleme
- Kendi tüketim trendi (sayaç)
- Talep oluşturma + mevcut taleplerin takibi
- Rezervasyon yapma
- Profil, KVKK izni, WhatsApp opt-in
- Belgelerim (sözleşme, fatura, tutanak)

**Etkilenen roller:** Sakin
**Spec referansı:** Bölüm 3.6 (Borcu Yoktur), 6 (Self-Service)

#### 4.1.17 Göç / Veri Aktarımı Akışı

**Sorun:** `migration-wizard.tsx` mevcut; **Excel import, doğrulama, önizleme, hata yönetimi** eksik.

**Beklenen davranış:**
- Kaynak seçimi (Apsiyon / Biyos / Yonetimcell / Excel / CSV)
- Sürükle-bırak dosya
- Alan eşleme (kaynak sütun → bizim şema)
- Önizleme + hata satırları
- Onay → import
- Geçiş kampanyası kodu uygulaması (SPEC Bölüm 3.11)
- Import raporu

**Etkilenen roller:** Yönetici, Süper-admin
**Spec referansı:** Bölüm 3.11, 6.16, 16


### 4.2 Veri Modeli, İş Kuralları ve İlişkisel Tutarsızlıklar

#### 4.2.1 modules tablosu / kategori yönetimi eksik

**Sorun:** `expenseCategories` tablosu var ama hiyerarşik (parent_id, depth) ve **paylaşım formülü alanı yok**. Yönetici kategorilere göre gideri dairelere yansıtamaz.

**Beklenen davranış:**
- `parent_id` ile iç içe kategoriler (örn. "Personel Maaşı > Kapıcı")
- `default_share_formula` (eşit / m² / arsa payı / kalorimetre / sayaç / kişi sayısı / özel)
- `icon` (Lucide adı) + `color` (CSS değişken)
- `is_active`, sıralama, `metadata`

#### 4.2.2 Sakin telefon / TCKN doğrulama

**Sorun:** TCKN/telefon alanları tablo'da var; gerçek TCKN algoritma doğrulaması (matematiksel) + telefon **uluslararası format** (Yonetimcell kullanıcı şikâyeti) yok. Tek tabloda `+90XXXXXXXXXX` ve uluslararası numara ayrımı yok.

**Beklenen davranış:**
- TCKN 11 hane + matematik algoritma doğrulaması (RFC uyumlu)
- Telefon: ülke kodu + alan kodu + numara (saklamada E.164)
- Yurt dışı GSM için ayrı alan veya geniş format
- Email doğrulama (regex + DNS MX opsiyonel)

#### 4.2.3 Birim-hisseli mülkiyet payı (land_share)

**Sorun:** `units.landShare` numeric(10,6) — **hisse oranı 0-1 (ondalık) tutulmuş**. Ama Yonetimcell payda/pay şeklinde tutar (örn. 120/1000). UI'da kullanıcı "0.001230" yazamaz; anlaşılır pay/payda formatı gerekli.

**Beklenen davranış:**
- `land_share` için iki yaklaşım değerlendirilmeli: (a) ondalık (mevcut), (b) payda/pay (int/int)
- UI'da her durumda **pay/payda + yüzde** gösterimi
- Tutarsızlık tespiti (toplam 1.0 veya 1000 olmalı) → uyarı (mevcut `landShareWarning` UI var)

#### 4.2.4 Borç paylaşımı politikası

**Sorun:** `unitOccupancies.debtTransferPolicy` (owner / next_tenant / keep) var ama **uygulama motoru yok**. Kiracı ayrılınca ne olacağını belirleyen otomatik kural çalışmıyor.

**Beklenen davranış:**
- Kiracı `end_date` set edilince: kalan borç, politikaya göre malike/yeni kiracıya devredilir
- Devir öncesi önizleme (KVKK denetim loguna yaz)
- Geçmiş ayrılma kayıtları (`unitOccupancies` zaten zaman içinde tutar, ama UI yok)

#### 4.2.5 Gecikme tazminatı (faiz) hesabında esneklik

**Sorun:** `duesPlans.lateFeeMonthlyPct` (aylık %5 default) **tüm borçlara uygulanır**. Yonetimcell kullanıcısı "20 daireye farklı gecikme uygulamak istiyorum" diyor. Bizde hangi başlığa faiz uygulanacağı / hangi birimlere uygulanacağı **debt başına override** mekanizması yok.

**Beklenen davranış:**
- `debts.lateFeeExempt` (boolean) — tek borç muafiyeti
- `units` veya `occupancies` düzeyinde muafiyet
- Vurucu fark: SPEC Bölüm 3.2 + bu çözüm

#### 4.2.6 Toplu işlemler — seçim, atomik uygulama

**Sorun:** Listelerde toplu seçim (çoklu checkbox), action bar, atomik işlem (tümü başarılı veya tümü başarısız) mekanizması yok.

**Beklenen davranış:**
- Her liste sayfasında toplu seçim
- Action bar (toplu sil, toplu atama, toplu duyuru gönder, toplu ihracat)
- Server Action'da transaction kapsamı
- Hata varsa atomik geri alma

#### 4.2.7 `app.tenantId` set etmeden sorgu

**Sorun:** README'de `withTenant()` ile zorunlu kılınmış deniyor; mevcut `residents/page.tsx` `withBypassRls` kullanmış (`residents:list` ile). Bu, **bir sakinin global kullanıcı tablosundan çekilmesi** için. Fakat hangi koşullarda bypass yapılacağı, audit standardı yok.

**Beklenen davranış:**
- `withBypassRls` çağrılarının **her biri** kategori etiketi taşımalı
- Audit log `data_access_logs` her bypass için yazılmalı
- Tüm bypass kullanımları tek tabloda görünür (süper-admin panel)

#### 4.2.8 Daire bazlı ödeme geçmişi

**Sorun:** `payments.debtorUserId` yok; sadece `payerUserId` var. Kiracı ödediğinde **malik de aynı borcu görebilmeli**. PAYMENT tarafında kimin "borçlu sıfatıyla" ödediği ayrımı net değil.

**Beklenen davranış:**
- Ödeme kaydında: payerUserId (ödeyen) + debtorUserId (borçlu)
- Borçlu ≠ Ödeyen olduğunda "Buna rağmen ödedi" olarak işaretlenir

#### 4.2.9 Sakin adres / fatura adresi

**Sorun:** Sakin için ayrı bir adres alanı yok. Fatura, makbuz, KEP gönderiminde **farklı adresler** gerekebilir. Şu an `users` tablosunda sadece telefon/email var; adres yok.

**Beklenen davranış:**
- `userAddresses` tablosu: userId, type (invoice / correspondence / kpv), adres, adres kodu (PTT)

#### 4.2.10 Duyuru şablon tipi güvenliği

**Sorun:** `templates` tablosu WhatsApp/Mail için var; ama tek bir şablon birden fazla kanal için kullanılırken **kanal değişkenleri** (WhatsApp farklı, e-posta farklı) yönetimi yok. Yardım için sadece tek bir isim alanı.

**Beklenen davranış:**
- Template body: kanal-spesifik (whatsapp_body, sms_body, email_subject, email_body)
- Değişken tipleri tanımlı olsun (kullanıcı adı, birim no, tutar) — render aşamasında validate


---

### 4.3 UI / UX — Sayfa Başına Detay Sorunları

#### 4.3.1 Genel UI Desen Sorunları (Tüm Sayfalar)

| Sorun | Etki | Beklenen |
| --- | --- | --- |
| **Ekleme/Düzenleme butonu yok** | Yönetici hiçbir şey oluşturamaz | Her sayfa sağ üstünde primary action: "Yeni Birim", "Yeni Sakin", "Yeni Gider", ... |
| **Detay sayfası yok** | Sadece satır görüntüleme | Her satır tıklanabilir, detay sayfasına yönlendirir |
| **Toplu seçim + action bar yok** | 200 satırlık tablo, tek tek işlem | Çoklu seçim + ortada sticky action bar |
| **Filtre / arama yok** | Çok büyük tablolarda yönetici kaybolur | Üstte arama + filtre chip'leri |
| **İç içe CRUD eksik** | Birim sayfasında kiracı ekleyememe | Drawer/Sheet/modal: birim detayında iken kiracı ekle |
| **Sayfalama yok** | Tüm veri tek sayfa, performans düşer | Sayfa başına 25-50 + "sonraki/önceki" |
| **Sıralama yok** | Varsayılan sıralama yapılmamış | Sütun başlığı tıklanabilir, yön gösterir |
| **Empty state görsel değil** | Boş ekranlar sıkıcı | İllüstrasyon + rehber yönlendirme |
| **Hiç toast/feedback mekanizması yok** | İşlem sonrası sessiz | Üst-sağ toast (başarı/hata) + undo |
| **Hiç loading state yok** | Sayfa yenilenirken tamamen boş | Skeleton + spinner |
| **Hiç error boundary yok** | Hata durumunda tamamen boş sayfa | "Bir şeyler ters gitti" ekranı + raporla |
| **Hiç keyboard shortcut yok** | Power user için yavaş | `/`, `g+i`, `g+d`, `?` ile gezinme |
| **Sayfa başlığı altında breadcrumb yok** | Derin sayfalarda yönetici kaybolur | Breadcrumb + geri butonu |
| **Sticky action bar yok** | Uzun formlarda CTA kaybolur | Form altında sticky "Kaydet" |
| **Hiç inline validation yok** | Form submit edince toplu hata | Her alan altında eş zamanlı hata |
| **Auto-save yok** | Uzun formlarda kayıp riski | Taslak otomatik kayıt (server veya localStorage) |

#### 4.3.2 Spacing / Typography / Renk Tutarlılığı Sorunları

**Sorun:** Birçok sayfa `text-sm` ile başlıyor, sidebar `font-extrabold` ve `font-semibold` karışık. Kart başlığı `text-base font-semibold`, dashboard başlığı `font-heading text-2xl font-extrabold`. Hiyerarşi net değil.

**Beklenen davranış:**
- Tipografi ölçeği: `text-xs / sm / base / lg / xl / 2xl / 3xl / 4xl` — her basamak için kullanım yeri tanımlı
- Başlık hiyerarşisi standardize: `h1` (sayfa başlığı) → `h2` (bölüm) → `h3` (kart) → `h4` (form grubu)
- Font ağırlıkları: `font-normal` (metin) / `font-medium` (vurgulu metin) / `font-semibold` (alt başlık) / `font-bold`/`font-extrabold` (yalnız başlıklar)
- Renk semantik: `text-fg` (ana), `text-fg-muted` (ikincil), `text-fg-subtle` (üçüncül), `text-danger-fg / warning-fg / success-fg` (aksiyon)
- Tutarlı kart, tutarlı spacing (`p-4`, `p-5`, `p-6`), tutarlı radius (`rounded-lg` her yerde)
- Kod tabanındaki `text-xs uppercase tracking-wide` gibi mikro tutarsızlıklar tek noktadan

#### 4.3.3 Sidebar / Navigation (Detay için ayrıca bkz. 4.4)

**Sorun:**
- Sidebar 6 grupta kategorize (`general/property/finance/communication/operations/compliance`)
- **Aktif link gösterimi yok** — kullanıcı hangi sayfada olduğunu bilmiyor
- **Submenu yok** — tüm gruptaki öğeler tek seviye
- **Sayı rozetleri yok** — "Bekleyen Talepler (12)" gibi
- **Hızlı arama yok** — 26 öğe içinden bulamıyor
- **Sık kullanılanlar / pinlenmiş öğeler yok**

**Beklenen davranış:**
- Aktif sayfa vurgusu (sol kenarda border veya bg)
- İki seviyeli (collapsible) grup
- Sayı rozetleri (örn. Talepler 12, KVKK talepleri 1)
- Sidebar üstünde arama inputu (komut paleti gibi)
- Kullanıcı pinleyebilsin (sık kullanılanlar üstte)

#### 4.3.4 Dashboard (panel/page.tsx)

**Sorun:** Statik 4 stat kartı + 3 bilgi kartı. Grafik yok, etkileşim yok.

**Beklenen davranış:**
- **Widget mimarisi**: sürükle-bırak ile dashboard layout
- Grafikler:
  - Aylık tahsilat oranı (line chart)
  - Gecikme yaşı dağılımı (bar chart)
  - Gelir-gider (composed chart)
  - Nakit akışı forecast (area chart)
  - Tüketim trendleri (sayaçlardan)
- Hızlı işlem butonları: "Yeni Borçlandır", "Yeni Duyuru", "Talep Aç"
- Son aktiviteler feed
- Bildirim merkezi (uygulama içi)
- Yaklaşan görevler (toplantı, bakım, hatırlatma)
- Takvim widget'ı (yaklaşan etkinlikler)

#### 4.3.5 Form Bileşenleri Eksik

**Sorun:** Sadece `Input` var; `Select`, `Combobox`, `DatePicker`, `MoneyInput`, `PhoneInput`, `TcInput`, `FileInput`, `Switch`, `CheckboxGroup`, `RadioGroup`, `Slider`, `FormSection`, `FormStepper` yok.

**Beklenen davranış:**
- Standardize edilmiş form alanları (shadcn benzeri), her biri RHF ile uyumlu
- Para girişi (kuruş ↔ TL otomatik, maske)
- Tarih seçici (TR lokal)
- TCKN / Telefon / IBAN inputları (algoritmik doğrulama + maske)
- Çoklu seçim combobox (bloklar, birimler için)
- Dosya yükleme (drag-drop, çoklu, ilerleme)
- Adım adım form (rezervasyon, toplantı, göç için)


---

### 4.4 Sidebar, Navigation & Mobil Deneyim

> Kullanıcının doğrudan işaret ettiği en kritik eksiklerden.

#### 4.4.1 Mobilde Sidebar Kayboluyor

**Sorun:** Şu an `apps/app/src/components/app-shell.tsx` içinde sidebar `<aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">` ile **tamamen gizli**; `lg:block` (≥1024px) için görünür. **Mobil görünümde sidebar'a erişim mekanizması (toggle butonu, açılır sheet, hamburger menü) kesinlikle yok**.

**Beklenen davranış:**
- Mobilde header'da sol-üst **hamburger butonu** (`<` şeklinde ikon, `Menu`/`X` toggle)
- Tıklanınca **drawer/sheet** soldan açılır, arka plan karartılır
- Sayfa içeriği üzerine overlay (backdrop)
- 2 ayrı durum: kapalı/açık, ESC ile kapanır, route değişince otomatik kapanır
- Desktop'ta aynı bileşen **persistent** sidebar olarak çalışır (yani desktop + mobil aynı bileşen, responsive)
- Active link state'i drawer içinde de gösterilir

**Referans:** Linear, Notion, Stripe Dashboard, Trello gibi modern SaaS'lerde standart pattern.

#### 4.4.2 Sidebar Aktif Link + Hiyerarşi

**Sorun:** Aktif sayfa gösterimi yok; sabit metin rengi. Sayı rozeti yok, hızlı arama yok.

**Beklenen davranış:**
- **Aktif link**: sol kenarda 2-3px primary border + bg-hover veya yarı saydam primary bg
- Hover: subtle background, transition
- **Group başlığı küçük caps** (`text-[11px] uppercase`)
- **Açılır/kapanır grup** (varsayılan: açık, kullanıcı kapatabilir)
- **Sayı rozeti**: "Talepler (12)" — bekleyen talep, yeni KVKK talebi, vs.
- **Sidebar arama inputu** (üstte veya ⌘K ile açılan command palette)

#### 4.4.3 Header — Yönetici Bilgi Çubuğu

**Sorun:** Header'da kullanıcı adı/rol gösterimi var ama sadece metin; bildirim, hızlı aksiyon, online/offline göstergesi yok.

**Beklenen davranış:**
- Bildirim zili (sayı rozeti)
- Hızlı arama (komut paleti ⌘K)
- Site switcher (birden fazla tenant ise)
- Tenant durumu (trial, active, suspended) rozeti
- Tema toggle (mevcut) + dil switch (mevcut)
- Çıkış (mevcut)

#### 4.4.4 Mobil İçerik Deneyimi

**Sorun:** Tablolar mobilde eziliyor (büyük `min-width: 720`); kart görünümü (data card) yok.

**Beklenen davranış:**
- `< md` ekranda tablo kart görünümüne dönüşür (her satır kart)
- Sütun gizleme (önemli sütunları göster, gerisini "detay"da)
- Yatay kaydırma **yerine** stack
- Form alanları tam genişlik, padding büyüt
- Bottom navigation bar (mobil için — hızlı aksiyonlar: yeni borç, yeni talep, yeni duyuru)

#### 4.4.5 Drawer / Sheet / Modal Bileşenleri

**Sorun:** Hiç yok. İç içe CRUD (birim detayında kiracı ekle) için kritik.

**Beklenen davranış:**
- **Drawer**: sağdan açılan panel (detay, form, onay). Örn. birim detayında "Kiracı Ekle" drawer'ı.
- **Modal**: kısa onay, küçük form
- **Sheet**: alt drawer (mobil için)
- **Toast**: üst-sağ kısa bildirim (başarı, hata, undo)
- **Command palette**: ⌘K ile her yerden her şeye erişim (sayfa, özellik, kullanıcı)

---

### 4.5 Landing Page (Pazarlama) Eksikleri

> Kullanıcının istediği: **daha modern, interaktif; özellikle motion efektler, görseller, destekli alanlar**. Mevcut `apps/web/src/app/[locale]/page.tsx` tamamen statik Tailwind sınıfları; hiçbir görsel, video, motion yok.

#### 4.5.1 Hero Bölümü

**Sorun:** Düz metin + 2 buton. Ürün görseli/video yok.

**Beklenen:**
- Hero görseli (ürün ekran görüntüsü) veya kısa demo video (10-15 sn, autoplay muted loop)
- Animasyonlu telefon mockup (dashboard, sakin self-service)
- **Animasyonlu tipografi**: başlık split, fade-up, mask reveal
- **Particle / blur / gradient arka plan** (soft, kurumsal)
- Sosyal kanıt bandı: "X sitede, Y dairede, Z kullanıcıda kullanılıyor"
- Müşteri logoları (yatay scroll)
- "30 gün ücretsiz, kart bilgisi istemez" → büyük vurgulu

#### 4.5.2 Sosyal Kanıt + Referanslar

**Sorun:** "10.000+ site" gibi rakamlar var ama görsel referans yok.

**Beklenen:**
- Müşteri logoları (yatay marquee)
- Testimonials carousel (gerçek fotoğraflı + şehir + yönetici adı)
- Trust badges (KVKK uyumlu, 256-bit SSL, ISO 27001 vurgusu)
- Basın logosu (TechCrunch, Webrazzi vs. — lansman sonrası)
- "Google'da 4.9/5" rozetleri (varsa)
- Rakamlarla sosyal kanıt (animasyonlu sayaçlar — sayaç 0'dan hedefe kadar sayar)

#### 4.5.3 Özellik Sayfası (`/ozellikler`)

**Sorun:** Şu an her özellik için 1 paragraf + 1 cümle detay + 1 satır SPEC ref. Görsel yok, etkileşim yok.

**Beklenen:**
- Her özellik için: başlık + detaylı açıklama + **ürün ekran görüntüsü** (placeholder kareler) + mikro video + önce/sonra karşılaştırma (varsa Apsiyon/Biyos özellik farkı)
- **Tab sistemi**: modüler (yardımcılar) vs. ana özellikler
- Her vurucu özellik için "Videoyu izle" +30 sn demo
- Fiyat/plan karşılaştırma tablosu (interaktif — plan seçimi)
- Apsiyon → Biz migrasyon hikayesi (geçiş kolaylığı)

#### 4.5.4 Fiyatlandırma Sayfası (`/fiyatlandirma`)

**Sorun:** Hesaplayıcı + kampanya bandı + plan kartları. Görsel feedback az.

**Beklenen:**
- Planlar karşılaştırma: "Starter / Pro / Enterprise" — **toggle** ile vurgu değiştirme
- "Sizin için en uygun plan" hesaplayıcı (interaktif slider — daire sayısı)
- Animasyonlu tasarruf rozeti (Yonetimcell ile yan yana karşılaştırma)
- "Yıllık/Aylık" toggle (animasyonlu)
- **3'lü paket karşılaştırması** (biz, Apsiyon, Yonetimcell) — yıllık maliyet tablosu
- SSS'ler (interaktif açılır-kapanır)

#### 4.5.5 Kampanya Sayfası (`/kampanyalar`, `/kampanya/[slug]`)

**Sorun:** Kampanya şablonları var ama kart tasarımı minimal.

**Beklenen:**
- Her kampanya için renkli gradient kart
- Geri sayım saati (varsa son gün)
- Şartlar net ("3 yıl taahhüt → ilk yıl bedava")
- "Bu kampanyadan faydalanan siteler" sosyal kanıt
- Kampanya detay sayfası: koşullar, başvuru formu, canlı önizleme

#### 4.5.6 Site Landing (`/[slug]`)

**Sorun:** Programmatic SEO var (`apps/web/src/app/[locale]/[slug]/page.tsx`) — görsel minimal.

**Beklenen:**
- Site fotoğraf galerisi (slider)
- Site yönetici iletişim kartı
- "Bu siteyi değerlendir" NPS widget'ı (interaktif)
- Site haberleri / son duyurular
- Google Maps embed
- QR kod (site afişi için)
- Çoklu dilde (ileride)

#### 4.5.7 Global Pazarlama Eksikleri

- **404 / 500 sayfası özgün tasarım**
- **Loading screen** (CSR geçişleri için)
- **Sticky CTA** (her sayfada sağ-alt "Şimdi Başla" butonu)
- **Exit intent popup** (yalnız belirli sayfalarda)
- **Cookie banner** — VAR, modern tasarıma uyumlu değil
- **Header'da mega menu** (modüller için)
- **Footer'da newsletter signup** — leads için
- **Sitemap görsel** (insan için)

---

### 4.6 Bildirim, Geri Bildirim, Loading & Boş Durum

#### 4.6.1 Toast / Sonner

**Sorun:** Hiç toast bileşeni yok. CRUD işlemlerinde başarı/hata sessiz.

**Beklenen:**
- Üst-sağ toast: başarı / hata / bilgi / uyarı
- **Undo** aksiyonu (silinen kaydı geri al)
- Otomatik kapanma süresi (varsayılan 4sn)
- Çoklu toast yığını

#### 4.6.2 Loading State

**Sorun:** Tüm sayfa beyaz boşluk; spinner yok, skeleton yok.

**Beklenen:**
- İskelet (skeleton) placeholder'lar (kart, satır, grafik için)
- Spinner (küçük + sayfa düzeyinde)
- Suspense boundary (partial render)
- Optimistic UI (Server Action'da hemen UI güncelle, hata olursa geri al)

#### 4.6.3 Empty State

**Sorun:** Mevcut `EmptyState` bileşeni var ama **görsel/illüstrasyon eksik**; düz metin.

**Beklenen:**
- İllüstrasyon (Lucia, Open Doodles, unDraw, Storyset, lottie) + başlık + açıklama + CTA + adımlar
- Modüle özel boş state (bir birim yok → "İlk biriminizi ekleyin" CTA)

#### 4.6.4 Error Boundary

**Sorun:** Hiç yok. Hata durumunda beyaz sayfa.

**Beklenen:**
- Root-level error boundary
- Modül düzeyinde error boundary
- "Bir şeyler ters gitti" sayfası + "Tekrar dene" + "Bize bildir"

#### 4.6.5 Bildirim Merkezi (Uygulama İçi)

**Sorun:** Hiç yok. Sadece log; UI'da bildirim akışı/merkezi yok.

**Beklenen:**
- Header'da bildirim zili (sayı rozeti)
- Bildirim paneli (dropdown veya drawer)
- Kategori: borç hatırlatma / talep güncelleme / duyuru / sistem
- Okundu / okunmadı toggle
- Toplu "okundu işaretle"


---

### 4.7 Tema, Erişilebilirlik & Çoklu Dil Tutarlılığı

#### 4.7.1 Tema Sistemi

**Sorun:** Light/dark/system var; tutarlı mı?

**Beklenen:**
- Light / dark / system — VAR
- **High-contrast modu** (erişilebilirlik)
- **Font-size scale** (S/M/L — yaşlı sakin düşünülerek)
- **Reduced motion** (vestibüler bozukluk)

#### 4.7.2 Erişilebilirlik (A11y)

**Sorun:** SPEC Bölüm 11.5 WCAG 2.1 AA hedefi var; mevcut kod minimal olarak erişilebilir.

**Beklenen:**
- Klavye navigasyonu test edilmeli (Tab, Shift+Tab, Enter, Escape, Arrow)
- ARIA labels (radix default — mevcut)
- Renk kontrastı oranı ≥ 4.5:1 (metin), ≥ 3:1 (UI element)
- Form validation hata mesajları screen-reader uyumlu
- Focus visible (visible ring)
- Skip-to-content link (özellikle dashboard'da)
- Alt metni tüm görsellerde
- Modal/drawer focus trap
- **60+ yaş sakin için minimum 14px font** (mevcut policy var; test edilmeli)

#### 4.7.3 Çoklu Dil (i18n)

**Sorun:** TR varsayılan; EN, AR, RU söz verilmiş. Locale switch var ama çeviri kapsamı?

**Beklenen:**
- TR (varsayılan) — %100
- EN — planlanmış V2'de, ama erken açılırsa başlık düzeyinde
- AR (RTL), RU (V2)
- **Tarih/sayı/para formatı** locale'e göre (mevcut `formatters` var)
- Çeviri anahtarları eksiksiz (validation: `pnpm test:i18n-keys`)
- RTL desteği (AR): layout mirroring, icon yön

---

### 4.8 Gözlemlenebilirlik, Hata Yönetimi & Performans

#### 4.8.1 Structured Logging

**Sorun:** Log çıktısı yapısız.

**Beklenen:**
- JSON structured logs (request_id, user_id, tenant_id, action, latency_ms)
- Request tracing (OpenTelemetry — SPEC Bölüm 19.3)
- Audit log uygulamadan ayrı (zaten immutable tabloda)

#### 4.8.2 Performance Hedefleri (SPEC Bölüm 19.1)

| Metrik | Hedef | Durum |
| --- | --- | --- |
| TTFB | < 200ms (p95) | Ölçülmedi |
| LCP | < 2.5s (p75) | Web Vitals yüklenmedi |
| INP | < 200ms | Web Vitals yüklenmedi |
| CLS | < 0.1 | Web Vitals yüklenmedi |
| API response | < 500ms (p95) | Sentry yok |
| TTI | < 3.5s | Lighthouse ölçülmedi |

**Eksik:**
- `@sentry/nextjs` kurulumu
- Vercel Analytics / Speed Insights entegrasyonu
- PostHog (analytics — zaten SPEC'te var)
- Lighthouse CI (PR başına)
- Web Vitals reporter (CLS, INP, LCP)
- Bundle analyzer (`@next/bundle-analyzer`)

#### 4.8.3 API Hata Yönetimi

**Sorun:** API rotaları minimal (sadece auth, cron, webhook, public). CRUD API'leri yok.

**Beklenen:**
- `/api/v1/units` — listele, oluştur, güncelle, sil
- `/api/v1/units/[id]` — detay, soft delete
- `/api/v1/debts` — borç listesi, oluştur, tahsil
- `/api/v1/expenses` — gider CRUD
- `/api/v1/announcements` — gönderim
- OpenAPI 3.1 dokümantasyon (SPEC Bölüm 21.2)
- API key + rate limiting (tenant başına)
- Webhook payload standardı
- Hata response: `{ error: { code, message, details } }`

#### 4.8.4 Caching Stratejisi

**Sorun:** Server Component'lerde cache tutarlı mı?

**Beklenen:**
- Next.js Cache (`unstable_cache` / `revalidateTag`)
- TanStack Query (client cache — form, autocomplete, listeler)
- Redis (zaten stack'te var — sayım, sayaç vb. için)
- ISR sayfaları (marketing tarafı)
- Service Worker (offline — gelecek)

---


## 5. Vurucu Eksikler — Öncelikli Özellikler (Killer Features)

> SPEC Bölüm 3'teki **Vurucu Özellikler** listesi. Mevcut kodda bazıları kısmen var; çoğu eksik.

### 5.1 WhatsApp-First Sakin Deneyimi (Bölüm 3.1)

**Mevcut:** State machine + intent detection + form şablonları var (`packages/whatsapp`).
**Eksik:**
- WhatsApp Cloud API bağlantı canlı (production credentials, webhook doğrulama)
- Conversation log UI (admin panelden)
- Şablon yönetimi (Meta'ya gönderim, onay durumu)
- **Pattern matching tuning** (TR'ye özgü deyim varyasyonları)
- "Bilmiyorum" intentinde AI fallback (varsayılan kapalı)
- 24 saat service window takibi + kullanıcı bazlı sayaç

### 5.2 Aidat Değişiklik Audit Timeline (Bölüm 3.2)

**Mevcut:** `audit_debt_changes` tablosu + trigger (immutable).
**Eksik:**
- Detay sayfasında **görsel timeline kartları** (eski tutar → yeni tutar, değiştiren, tarih, gerekçe)
- Sakinlere **WhatsApp'tan bildirim** (değişiklik yapıldığında)
- "Bu değişikliği neden yaptınız?" zorunlu alan
- Toplu değişiklik listesi (tarih, değiştiren, kaç borç etkilendi)

### 5.3 Self-Service "Borcu Yoktur" Belge Motoru (Bölüm 3.6)

**Mevcut:** `certificate-form.tsx` ve `/panel/borcu-yoktur` sayfası var.
**Eksik:**
- PDF üretimi (pdf-lib veya React PDF)
- **KEP entegrasyonu** (Türkiye'nin KEP sağlayıcıları)
- E-imza entegrasyonu
- Banka API'den direkt talep (ileri)
- **Ücretli KEP gönderim** (49 TL, fatura kesilir)

### 5.4 Bütçe Simülatörü (Bölüm 3.4)

**Mevcut:** `/panel/simulator` sayfası var; `packages/dues/src/simulator.ts` mevcut.
**Eksik:**
- **Arayüz**: aidat artış %, ek bütçe kalemleri, özel durumlar input formu
- Çıktı: 12 ay nakit akışı forecast grafiği, gecikme oranı tahmini, sakin başı aylık yük, geçmiş yıllarla karşılaştırma
- **Paylaşılabilir rapor** (PDF, link)
- A/B senaryo karşılaştırma ("Senaryo A vs Senaryo B")

### 5.5 Bakım Takvimi + Yasal Zorunluluk Asistanı (Bölüm 3.7)

**Mevcut:** `MAINTENANCE_TEMPLATE_SEED` (50+ şablon)
**Eksik:**
- Bakım planı oluşturma (şablondan) — UI
- Otomatik hatırlatma (T-30, T-15, T-7, T-0, T+3) — `packages/notifications` zaten yönlendirme yapıyor; bakıma özgü şablon yok
- Bakım sonrası fatura + rapor yükleme
- Yasal referans göstergesi (`regulatory_ref`)

### 5.6 Çoklu Banka Failover & Mutabakat (Bölüm 3.10)

**Mevcut:** `packages/bank` adapter'ı var.
**Eksik:**
- **Çoklu aggregator** (Param + BKM Express + iyzico) birlikte çalışma
- **Otomatik failover** (primary düşerse secondary)
- Retry queue + monitoring
- Dashboard: her banka için sağlık, hata oranı, son senkronizasyon

### 5.7 Self-Servis Veri Migration (Bölüm 3.11)

**Mevcut:** `migration-wizard.tsx`
**Eksik:** (yukarıda 4.1.17)

### 5.8 Site Landing Page Builder + NPS Widget (Bölüm 3.9)

**Mevcut:** `/[slug]` programmatic SEO var.
**Eksik:**
- Site fotoğraf slider
- "Bu siteyi değerlendir" interaktif NPS (POST → email)
- Yönetici iletişim kartı
- Google Maps embed
- QR kod

### 5.9 Sakin Deneyim Puanı (NPS) (Bölüm 3.8)

**Mevcut:** `nps_responses` tablosu var.
**Eksik:**
- Aylık rastgele sakin seçimi (cron)
- WhatsApp/SMS anket gönderimi (3 soru)
- Yönetici dashboard'u: NPS trend, "şikayet temaları" (text clustering — AI opsiyonel)
- **Şikayet temaları** için basit keyword clustering (AI'sız)


---

## 6. Önceliklendirme Önerisi — 4 Sprint

> Sprint tahminleri 1 tam-zaman geliştirici (~5 gün/sprint) içindir; sıralama SPEC'in tamamlanmasından önce "yazılabilir demo" hedefine göredir.

### Sprint 1 — Temel UI Eksiği Kapatma (altyapı)

**Hedef:** Hiçbir modülde ekleme yapılamıyor → ilk CRUD akışları çalışır hale gelir.

| İş | Öncelik | Tahmini |
| --- | --- | --- |
| **UI Component Library v2** — Modal, Drawer, Sheet, Toast (Sonner), Combobox, DatePicker, MoneyInput, PhoneInput, TcInput, FileInput, Switch | P0 | 3 gün |
| **Form standardizasyonu** — RHF + Zod + Server Actions tutarlı pattern (tüm yeni eklemeler için) | P0 | 1 gün |
| **Sidebar mobil drawer** — hamburger, drawer açılış, aktif state, badge, arama | P0 | 1.5 gün |
| **API rotaları** — `/api/v1/units`, `/api/v1/sakinler`, `/api/v1/debts`, `/api/v1/expenses` (REST + Zod validation) | P0 | 2 gün |
| **Birim CRUD** — listele + ekle + düzenle + sil + detay sayfası | P0 | 1.5 gün |
| **Sakin CRUD** — listele + ekle + düzenle + sil + detay sayfası | P0 | 1.5 gün |
| **Borç ekleme (tek + toplu)** — manuel veya wizard | P0 | 2 gün |
| **Gider ekleme** + Kategori CRUD | P0 | 1.5 gün |
| **Toast / loading / skeleton / error boundary** standart bileşenler | P0 | 1 gün |
| **Tema tipografi & renk standardizasyonu** (kitapçık) | P1 | 0.5 gün |
| **Toplam** | | **~15 gün** |

**Sprint 1 çıktısı:** Yönetici giriş yapar, blok/daire ekler, sakini ekler, o sakine borç girer, gider girer; hepsini görebilir, düzenleyebilir, silebilir. Mobilde de çalışır.

### Sprint 2 — Vurucu Özellikler UI'ları

**Hedef:** SPEC Bölüm 3'teki killer feature'lar görünür hale gelir.

| İş | Öncelik | Tahmini |
| --- | --- | --- |
| **Audit Timeline kartları** — borç detayında görsel kronoloji | P0 | 2 gün |
| **"Borcu Yoktur" belge üretimi** — PDF + KEP opsiyonu | P0 | 3 gün |
| **Bütçe simülatörü UI** — input form + forecast chart | P0 | 2 gün |
| **Bakım planı + hatırlatma** | P0 | 2 gün |
| **WhatsApp yönetim paneli** — şablonlar, conversation log, opt-in istatistik | P0 | 2 gün |
| **Toplu işlemler UI** — checkbox + action bar | P1 | 1 gün |
| **Duyuru zamanlama + hedef kitle** | P1 | 1 gün |
| **Toplam** | | **~12 gün** |

### Sprint 3 — Dashboard & Raporlama

**Hedef:** Yönetici gerçek bir kontrol paneline kavuşur.

| İş | Öncelik | Tahmini |
| --- | --- | --- |
| **Widget mimarisi** — sürükle-bırak dashboard layout | P0 | 3 gün |
| **Chart bileşenleri** — line, bar, area, composed | P0 | 2 gün |
| **Hızlı işlem butonları** — yeni borç, yeni duyuru, yeni talep | P1 | 1 gün |
| **Son aktiviteler feed** + bildirim merkezi | P1 | 2 gün |
| **Site landing page builder** (`/[slug]`) — fotoğraf slider, NPS widget | P1 | 2 gün |
| **Raporlar modülü** — aylık, yıllık, karşılaştırmalı | P1 | 2 gün |
| **Toplam** | | **~12 gün** |

### Sprint 4 — Sakin Portalı & Landing Polish

**Hedef:** Sakinler self-service kullanır; pazarlama modernleşir.

| İş | Öncelik | Tahmini |
| --- | --- | --- |
| **Sakin portalı** — `/sakin`: borç sorgulama, ödeme (iyzico checkout), talepler, rezervasyon, profil | P0 | 4 gün |
| **Talep oluşturma + thread + atama** | P0 | 2 gün |
| **Rezervasyon takvim görünümü** | P1 | 2 gün |
| **Landing page motion + görseller** — Framer Motion / Lenis scroll; hero video; müşteri logo marquee; testimonial carousel | P0 | 3 gün |
| **Performans & A11y polish** — Lighthouse 90+, WCAG AA, Sentry | P1 | 1 gün |
| **Toplam** | | **~12 gün** |

---

## 7. Teknik Borç & Mimari Notlar

### 7.1 Kısa Vadede Çözülmesi Gereken Teknik Borç

| # | Başlık | Detay |
| --- | --- | --- |
| TD-01 | **CRUD form pattern standardize** | Şu an her sayfa farklı yaklaşım kullanıyor. Server Action + RHF + Zod tekrar eden şablon olmalı |
| TD-02 | **`withBypassRls` audit** | Hangi sayfa bypass yapıyor, görülemiyor. Liste + kategori etiketi zorunlu |
| TD-03 | **API rate limit** | Tenant başına, IP başına limit yok |
| TD-04 | **Hata kodu standardizasyonu** | Hata mesajları tutarsız (string vs error.code) |
| TD-05 | **State machine kütüphanesi** | Whatsapp state machine harici modüllerde de gerekebilir (talep durumu, ödeme durumu, hukuk aşaması) |
| TD-06 | **Çoklu dosya yükleme** | Tek dosya altyapısı var, çoklu + ilerleme + thumbnail eksik |
| TD-07 | **Cache invalidation** | Server Action sonrası ilgili tag'lerin invalidate edilmemesi muhtemel |
| TD-08 | **`dynamic = 'force-dynamic'` her yerde** | Gereksiz yere her sayfa dynamic — caching stratejisi yok |
| TD-09 | **Translations key validation** | `pnpm test:i18n-keys` var mı? Çevrilmemiş anahtarlar tutarsız |
| TD-10 | **Error boundary stratejisi** | Root + module bazlı |

### 7.2 Mimari Kararlar Gereken Konular

- **Server Component → Client Component geçiş stratejisi**: hangi sayfalar "use client" gerektiriyor?
- **TanStack Query nereden başlamalı**: tüm listeler, sadece etkileşimli formlar, hiç?
- **Bundle size politikası**: Chakra gibi büyük lib'lerden kaçınmak için shadcn prensibi korunmalı
- **Server Action transaction pattern**: tüm CRUD'lar transaction içinde mi, hangi koşulda?
- **Bundle analyzer**: `@next/bundle-analyzer` PR'a ekle

---

## 8. Açık Sorular & Karar Bekleyenler

| # | Soru | Karar verilmemişse varsayılan |
| --- | --- | --- |
| Q1 | **Tenant başına birden fazla yönetici olabilir mi?** | SPEC'te "manager_id" diyor ama memberships tablosu var. Çoklu yönetici + RBAC rolleri. |
| Q2 | **Sakin self-signup akışı nasıl tetiklenir?** | WhatsApp link'i ile mi? Davet SMS'i ile mi? Her ikisi de mi? |
| Q3 | **Borç paylaşımı politikası sadece kiracı ayrılırken mi, yoksa her zaman geçerli mi?** | SPEC "default owner" diyor ama override sadece çıkışta mı? |
| Q4 | **Gecikme tazminatı "günlük" mı "aylık" mı?** | SPEC her ikisini de söylüyor. UI varsayılan? |
| Q5 | **Sayaç paylaşım formülü site başına farklı olabilir mi?** | Veya su=kişi, doğalgaz=alan sabit mi? |
| Q6 | **WhatsApp hata durumunda SMS'e ne kadar sürede geçer?** | Otomatik mi, manuel mi? |
| Q7 | **Çoklu dil başlangıçta açık mı?** | TR yeterli başlangıç, V2'de EN/AR/RU? |
| Q8 | **Marka adı ne?** | "Yönetimcell" placeholder, değişecek mi? |
| Q9 | **Demo veri nasıl?** | Her tenant demo seed ile mi başlar? Reset butonu var mı? |
| Q10 | **Self-service tenant kayıtında kartsız deneme 30 gün mü?** | SPEC 30 gün diyor; uzatılabilir mi? |
| Q11 | **Toplantıya online katılım** (Zoom/Google Meet) gerekiyor mu? | SPEC Bölüm 6.6 "Gelişmiş" diyor. MVP'de yok mu? |
| Q12 | **Anket anonimliği** sözleşmesel mi yoksa seçenek mi? | SPEC'te hem anonim hem açık var. KVKK açısından anonim sıkı kurallar gerektirir. |

---

## 9. Kabul Kriterleri

Her sprint sonunda **Definition of Done** uygulanmalı:

### 9.1 Genel (Tüm Sprint)

- Tüm yeni eklemelerde **type-check geçer** (`pnpm exec tsc --noEmit -p tsconfig.check.json`)
- Mevcut 167 birim testi geçer + yeni eklenen modüller için yeni testler yazılır
- **RLS izolasyon testi** genişletilir (yeni tablolar için)
- Erişilebilirlik: Form alanları için label, klavye navigasyonu çalışır
- Lighthouse score mobile ≥ 85 (yeni eklenen sayfalar)
- i18n anahtar çevirisi %100 (TR + EN minimum)
- Audit log her yeni aksiyonu kapsar

### 9.2 UI için ek

- Boş state mevcut
- Loading state (skeleton)
- Hata durumu (error boundary)
- Mobil görünüm test edildi
- Active link gösterimi
- Toast bildirim (undo destekli)

### 9.3 Güvenlik & KVKK

- Field-level encryption gerekli alanlarda (TCKN, IBAN, tel)
- Soft-delete + KVKK saklama süresi sonrası anonimleştirme pipeline'ı
- `withBypassRls` her kullanım için neden-içeren etiket

---

**Bu doküman sonu.** Bu listeyi okuyan AI'a bırakılan: **teknik mimari kararlar (hangi kütüphane, hangi state, hangi component mimarisi, hangi dosya yapısı).** İsterler açık ve net; çözüm size kalmıştır.

