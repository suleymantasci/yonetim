# Rakip Analizi & Eksik Modüller Raporu — 2026-07-28

> 📌 Bu raporun çıkardığı yeni özellik fikirleri [`PROJE-DURUMU.md`](./PROJE-DURUMU.md)
> §4'te tek listeye toplandı. Ayrıntılı canlı-demo bulguları için bu dosya
> geçerli kalıyor.

> Kaynaklar: `codebase-memory` bilgi grafiği (10.463 node / 18.969 edge), `git log`,
> geçmiş oturum özetleri, **canlı** Dijiyon demo paneli (müşteri no 7538, giriş yapıldı)
> ve **canlı** Yönetimcell demo paneli ("Dolgun Sitesi Yönetimi", kullanıcı kendi
> hesabıyla giriş yaptı) + mevcut [`GAP-ANALYSIS.md`](./GAP-ANALYSIS.md) §3'teki
> doğrulanmış Yönetimcell bulguları. Bu dosya mevcut GAP dokümanlarının **yerine
> geçmez**, onları canlı rakip incelemesiyle günceller/tamamlar.

---

## 1. Bu turda ne yapıldı — özet

1. `codebase-memory` MCP ile repo mimarisi (paketler, rota sayısı, dil dağılımı) ve
   `git log --stat` ile son ~10 commit incelendi.
2. `https://yonetim.dijiyon.com/` demo hesabına (Müşteri No 7538) **gerçekten giriş
   yapıldı** ve tüm üst menüler (Tanımlamalar, İnsan Kaynakları, Finansal İşlemler,
   Raporlar, İletişim, Site, Hukuki İşlemler) tek tek gezilerek gerçek alt menü
   haritası çıkarıldı (önceki `GAP-ANALYSIS.md` bu siteye hiç giriş yapmamış, yalnızca
   dışarıdan tahmin yürütmüştü).
3. `https://yonetici4.yonetimcell.com/...giris` — kullanıcı kendi hesabıyla giriş yaptı
   ("Dolgun Sitesi Yönetimi" demosu, 46 taşınmaz, 5 blok). Üst menüdeki 7 ana modül
   (Üyeler, Giderler (Ödeme), Kasalar, Raporlar, Borçlandır, Hukuki, Tanımlar) tek tek
   tıklanarak tüm alt menü kalemleri çıkarıldı; ayrıca **Üye Listesi** ve **Karar
   Defteri** ekranları gerçek verilerle açılıp incelendi. Daha önceki `GAP-ANALYSIS.md`
   §3.1'deki (kullanıcı yorumları + özellik sayfası üzerinden çıkarılmış) bulgular da
   hâlâ geçerli ve bu yeni bulgularla çelişmiyor.

---

## 2. Projede son dönemde olan-biten (git geçmişi + oturum özeti)

En yeni commit'ten geriye doğru:

| Commit | Ne değişti |
| --- | --- |
| `3b4366f` fix(dev) | API'de ESM çökmesi + `auth`↔`db` döngüsel bağımlılık giderildi (`dev-session.ts` `db`'den `auth`'a taşındı) |
| `35de4a5` feat(ui) | **Modal tabanlı CRUD akışları** eklendi: birim/gider/sakin için `@modal/(.)...` intercepting route'lar (sayfa değiştirmeden "yeni" formu açma) — tam olarak GAP-ANALYSIS §4.1.1-4.1.2'de istenen "sayfa değiştirmeden ilişkili kayıt oluşturma" ihtiyacına cevap. Ayrıca chart motoru **tekrar** Recharts'a geçirildi (`packages/ui/src/components/chart/*` yeniden yazıldı — bkz. MIMARI-PLAN §3 madde 2), tablo/sidebar/loading iskeletleri yenilendi |
| `5aa744b` feat(landing-page) | Pazarlama anasayfası (`apps/web`) görsel/motion yenilemesi |
| `a9ab376` feat | Bundle-budget script, marketing site SEO/OG görselleri, motion sistemi (`packages/ui/src/motion`), tema/renk altyapısı |
| `5fcdd1b` refactor | `hrefFor` fonksiyon-prop deseni → `basePath+params` (RSC→Client fonksiyon aktarım hatasını gideren desen — bkz. repo hafızası) |
| `b8482db` feat(observability) | Sentry, Web Vitals, pino logging, dependency-cruiser mimari kapıları |
| `400c1b4` / `0d1204a` feat(worker) | **`apps/worker` servisi doğdu**: BullMQ kuyruğu, 19 cron job Vercel'den ayrı sürece taşındı, olay→bildirim politika motoru |
| `1aaef09` feat(api) | **`apps/api` (NestJS) servisi doğdu**: `/api/v1` taşındı, WhatsApp bot/webhook, portal ödeme, auth servisleri |

**Yorum:** Proje aktif olarak GAP-DURUM.md §2'de belgelenen "tek Next.js + server actions"
mimarisinden, MIMARI-PLAN.md'de tarif edilen **ayrık NestJS API + worker + self-hosted
Docker** topolojisine geçiyor. Bu, UI kit'in (Faz 0) ve modal/CRUD akışlarının bu yeni
temel üstüne oturtulduğu bir ara dönem. Session geçmişi bunu doğruluyor: 26 Temmuz'da
"CRUD eksik" şikayeti → GAP-ANALYSIS.md doğdu → 27 Temmuz'da UI kit + modal akışları +
mimari ayrıştırma + bugün ESM hatası düzeltmesi.

**Şu an bilinen tek açık teknik sorun:** `apps/app` dev sunucusu (`pnpm run dev`)
görüşme başında `exit 143` (SIGTERM/kill) ile durdurulmuş görünüyor; en son commit bu
alandaki ESM/döngüsel-bağımlılık hatasını düzeltiyor ama bir sonraki adımda
`pnpm run dev`'in gerçekten ayakta kaldığı doğrulanmalı.

---

## 3. Mevcut modül envanteri (koddan doğrulanmış)

**`packages/`** (iş mantığı, DB'den bağımsız): `auth`, `bank`, `campaigns`, `config`,
`contracts`, `core`, `db`, `dues`, `emails`, `i18n`, `jobs`, `kvkk`, `notifications`,
`payment`, `pricing`, `seo`, `sms`, `ui`, `whatsapp`.

**`apps/app/src/app/panel/`** rotaları (arayüz var, GAP-DURUM.md'ye göre çoğu **liste
+ kısmi CRUD**, bazıları salt liste): `aidat`, `anketler`, `ayarlar`, `bakim`, `banka`,
`belgeler`, `birimler`, `borclar`, `borcu-yoktur`, `denetim`, `duyurular`, `gecis`,
`giderler`, `hukuk`, `kvkk`, `mesajlar`, `personel`, `raporlar`, `rezervasyon`,
`sakinler`, `sayaclar`, `simulator`, `talepler`, `toplantilar`.

Rota adları rakiplerin menüsüyle örtüşüyor gibi görünse de, GAP-DURUM.md §4
"Henüz yapılmayanlar" listesine göre şu anda **gerçek işlevi eksik** olanlar:
sakin portalı içerikleri, talep yönetimi (thread/atama/SLA), rezervasyon takvimi,
personel bordrosu, sayaç okuma girişi, anket/toplantı/hukuk tam akışı, KVKK gelen
kutusu, banka hareket eşleştirme arayüzü, göç sihirbazı (Excel import).

---

## 4. Rakip 1 — Dijiyon (canlı demo, giriş yapıldı)

### 4.1 Tam menü haritası (gerçek panelden çıkarıldı)

| Üst menü | Alt kalemler |
| --- | --- |
| **Tanımlamalar** | Site/Bina, Finansal, Otopark, Mesken Paneli, Sistem Kullanıcısı, Avukat, **Toplu Tanımlamalar** |
| **İnsan Kaynakları** | Personel, Puantaj, İzin Oluşturma, Personel Zimmet Formu, Bordro İşlemleri *(yakında)*, Maaş Ödeme/Oluşturma *(yakında)*, Ceza/Kesinti/Ek Kazanç, **Kıdem İhbar Tazminat** (hesaplayıcı), İşten Ayrılış, İş Takip, Personel Performans Değerlendirme |
| **Finansal İşlemler** | Borçlandırma, Gelir, Gider, Mahsup İşlemi, Alacaklandırma, Kasalar Arası Transfer, Emanet ve Ek Hesaplar, Banka Entegrasyon, Banka Hareketleri (otomatik + Excel), Sanal Pos, Sanal Pos Hareketleri |
| **Raporlar** | Aidat, Hazirun Listesi (genel kurul yoklama), **Yevmiye Defteri**, **Defter-i Kebir**, **Mizanlar**, **BA/BS** (vergi bildirim formları), Nakit Akış Raporu, **PTS Kayıtları** (geçiş turnikesi), Kasa, Gelir-Gider, Site Borçları (tümü/aktif), **Kan Grubu Raporu**, Cariler, Sayaç Tüketim, Rapor Çıktı Ayarı, Sistem Hareketleri (giriş-çıkış logu) |
| **İletişim** | SMS, **Sesli Mesaj** (robocall), E-Posta, Santral *(yakında)*, Duyuru, Anket, Bildirimler |
| **Site** | Arıza Takip, **Karar Defteri** (yönetim kurulu kararları resmi kaydı), Yönetim Faaliyet (raporu), **Demirbaşlar** (envanter), Mesken İzleme |
| **Hukuki İşlemler** | İcralık Dosya Kaydı, İcra Kaldırma, İcradaki Dosyalar, İcradan Çıkmış Dosyalar |

### 4.2 Öne çıkan / bizde karşılığı olmayan özellikler

1. **Çift kayıtlı muhasebe defterleri** — Yevmiye Defteri, Defter-i Kebir, Mizan, BA/BS.
   Bunlar Türkiye'de yönetim şirketleri/mali müşavirler için **yasal/pratik zorunluluk**
   niteliğinde. Bizde `packages/dues`, `pricing` var ama gerçek bir **muhasebe defteri
   modülü / paketi yok**. → **Büyük eksik**, muhasebeci/YMM'e teslim edilen yönetim
   şirketleri için kritik.
2. **PTS (turnike/geçiş sistemi) entegrasyonu ve kayıtları** — donanım entegrasyonu;
   bizde yok (GAP-ANALYSIS §3.2'de "donanım entegrasyonları Faz 17 sonrası" denmiş,
   doğru duruyor).
3. **Kıdem/İhbar Tazminatı hesaplayıcı** — bizde personel modülü salt liste;
   basit bir hesap makinesi bile yok. Küçük efor, yüksek algılanan değer.
4. **Karar Defteri** (yönetim kurulu/genel kurul kararlarının resmi, sıra numaralı
   kaydı — KMK'ya göre tutulması beklenen bir defter) — bizde `toplantilar` var ama
   ayrı, hukuki geçerliliği olan "karar defteri" kaydı yok.
5. **Demirbaşlar (envanter/fixed assets) kaydı** — bina ait demirbaşların (jeneratör,
   hidrofor, mobilya vs.) kayıt ve amortisman takibi. Bizde yok.
6. **Sesli Mesaj (robocall) kanalı** — SPEC'te "acil durum sesli arama" olarak zaten
   planlı (Bölüm 8.1) ama uygulanmadı; Dijiyon'da canlı çalışıyor. WhatsApp-first
   stratejimiz zaten daha güçlü ama sesli arama **acil durum fallback'i** olarak
   hâlâ eksik.
7. **Kan Grubu Raporu** — acil durum için sakinlerin kan grubu bilgisi; ucuz, hızlı
   eklenebilir alan+rapor.
8. **Toplu Tanımlamalar** (Excel/toplu veri girişi sihirbazı) — bizde GAP-DURUM §4
   Sprint 4'te "Göç sihirbazı (Excel import + alan eşleme)" olarak zaten planlı,
   henüz yapılmadı; Dijiyon'da mevcut → doğrulanmış rakip özelliği.
9. **Yapay zekâ destekli "Dijital Yönetici" sohbet asistanı** (metin + **sesli**
   konuşma başlatma butonu) — panelin içine gömülü, "KMK ve site yönetimi
   konularında danışmanlık" veren bir chat/voice asistanı. Bu, SPEC/GAP
   dokümanlarında hiç geçmiyor; potansiyel **yeni vurucu özellik fikri** (ör. borç/
   KMK sorularını yanıtlayan, mevcut `packages/dues/src/kmk.ts` kural motorunu
   konuşma arayüzüne bağlayan bir "Yönetim Asistanı").
10. **Mesken İzleme** — muhtemelen kamera/durum izleme; işlevi tam netleşmedi
    (giriş kısıtlı demo, tıklanmadı), ileride derinlemesine incelenebilir.

### 4.3 Bizim zaten rakipten ileride olduğumuz alanlar (doğrulama)

- Audit Timeline (borç değişikliği gerekçeli tarihçe) — Dijiyon'da böyle bir görsel
  kronoloji yok, sadece ham "Sistem Hareketleri" logu var.
- WhatsApp-first bildirim mimarisi (`packages/whatsapp`, `packages/notifications`) —
  Dijiyon'da WhatsApp hiç geçmiyor (SMS/Sesli Mesaj/E-posta/Santral var, WhatsApp yok).
- Modern liste deseni (URL durumu, toplu seçim, çöp kutusu) — Dijiyon'un tabloları
  klasik server-render HTML tabloları, sıralama/filtre UX'i eski.
- KVKK altyapısı (audit, veri erişim logu, immutable trigger) — Dijiyon'da görünür
  bir KVKK modülü yok.

---

## 5. Rakip 2 — Yönetimcell (canlı demo, giriş yapıldı)

Kullanıcı "Dolgun Sitesi Yönetimi" demosuna kendi bilgileriyle giriş yaptı (46
taşınmaz, 5 blok — A-E). Üst menüdeki 7 ana modülün tamamı tıklanarak gerçek alt
menü haritası çıkarıldı; ayrıca **Üye Listesi** ve **Karar Defteri** ekranları
gerçek veriyle açılıp incelendi.

### 5.1 Tam menü haritası (gerçek panelden çıkarıldı)

| Üst menü | Alt kalemler |
| --- | --- |
| **Üyeler** | Üye Listesi, Taşınmaz Listesi, Üye Listesi Seçenekleri, Üyelere Toplu Sms Gönder, Üyelere Toplu E-Posta Gönder |
| **Giderler (Ödeme)** | Giderler (Ödeme ve Borçlanma), **Firmalar (Ödeme ve Borçlanma)**, **Personel (Ödeme ve Borçlanma)**, Borç Listesi, İleri Tarihli Borç Listesi |
| **Kasalar** | Genel Kasa Durumu, Kasalar Arası Para Transferi, Harici Tahsilat, Nakit Kasa, **Banka Talimatı Oluştur**, Banka Ent. Gelen Hareketler, Banka Hareketlerini Excel'den Al, Kasa Devir İşlemleri |
| **Raporlar** | Genel Durum Raporu, Tahsilat Raporu, Ödeme (Gider) Raporu, Gelir-Gider Raporları, Kurul Raporları, Taşınmaz Raporları, Üye Raporları, Üye Borçlandırma Raporları, **Muhasebe Raporları**, Kullanıcı Raporları, Dosya Arşivi |
| **Borçlandır** | Aidat, Yakıt, Demirbaş, İleri Tarihli Borçlandırma |
| **Hukuki** | Tebligat Gönder, İcradaki Üyeler Listesi, İcradaki Dosyalar Listesi, Genel Kurul Çağrısı, Vekaletname Örneği, Hazirun Cetveli, **Karar Defteri**, Antetli Evrak, Adres Etiket Yazdır, Bilgi Bankası |
| **Tanımlar** | Taşınmaz ve Üye Tanımları, Blok Tanımları, Aidat Grubu Tanımları, Üye Borçlandırma Seçenekleri, Harici Tahsilat Grubu Tanımları, Kasa/Banka Tanımları, Banka Entegrasyon Tanımları, Gider (Ödeme) Grubu Tanımları, Gider (Ödeme) Tanımları, Firma (Satıcı) Tanımları, Personel (Çalışan) Tanımları, Avukat Tanımları, Demirbaş Tanımları, **Güvenlik Uygulaması Kullanıcıları**, **Denetçi Uygulaması Kullanıcıları**, Program Kullanıcıları |

### 5.2 Üye Listesi ekranından somut doğrulamalar

`Üye Listesi` gerçek veriyle açıldığında (bkz. ekran görüntüsü) şunlar **doğrulandı**:

- **Aynı birim (ör. A Blok No 1) için iki ayrı satır** var: biri "Malik" (Necat
  Çolak), biri "Kiracı" (Ömer Kılınçarslan) — GAP-ANALYSIS §3.1'deki "malik/kiracı
  ayrı cari" iddiası canlı veriyle teyit edildi.
- Durum filtresi seçenekleri: **Tümü, Aktif Malik ve Kiracılar, Oturanlar,
  Malikler, Kiracılar, Eski Malikler, Eski Kiracılar** — malik/kiracı geçmişi
  (eski sahip/eski kiracı) tam olarak ayrı takip ediliyor.
- Borç/alacak **kategori filtresi**: AİDAT, YAKIT, DEMİRBAŞ, AVANS, **KİRA**,
  **DEPOZİT**, EK GİDER, **İDARİ CEZA**. "Kira" ve "Depozit"in kendi başına birer
  borçlandırma kategorisi olması, platformun kira sözleşmesi/depozito takibini de
  üstlendiğini gösteriyor. "İdari Ceza" ayrı bir kategori — site içi kural
  ihlallerine (ör. gürültü, ortak alan suistimali) yönetim tarafından yazılan
  cezalar için.
- Tutar bazlı borç filtresi (500/1.000/2.000/3.000/4.000/5.000 ₺ ve üzeri veya
  özel tutar girme) — tahsilat önceliklendirmesi için hazır bir "riskli cari"
  filtresi; bizde bu türden hazır eşik filtresi yok.
- Her satırda 3 aksiyon ikonu var: **açıklama/ekstre** (cari hesap dökümü),
  **trend/monitoring** (kişi bazlı bakiye trend grafiği — bizde bireysel cari
  trend grafiği yok, yalnız site geneli dashboard grafikleri var), **yeni
  sekmede aç**.

### 5.3 Karar Defteri ekranı

`Hukuki > Karar Defteri` gerçek ekranı açıldı: **Sıra No / Tarih / Gündem** (+
kesilen bir "Karar" ve aksiyon sütunu) kolonlarından oluşan, sıra numaralı resmi
bir kayıt defteri. Bizim `toplantilar` modülümüzde bu türden **sıra numaralı,
yazdırılabilir resmi karar kaydı yok** — Dijiyon'da da aynı isimle vardı, iki
rakipte de bulunması bunu neredeyse zorunlu bir modül yapıyor.

### 5.4 Öne çıkan / bizde karşılığı olmayan yeni bulgular

1. **Firma ve Personel için ayrı "Ödeme ve Borçlanma" cari hesapları** —
   yalnızca sakinler değil, tedarikçi firmalar ve personel de birer cari hesap
   olarak borç/alacak takibine giriyor (GAP-ANALYSIS §3.1'i teyit ediyor).
2. **Banka Talimatı Oluştur** — banka üzerinden toplu ödeme/tahsilat talimatı
   (muhtemelen DBS/otomatik tahsilat dosyası) üretimi; bizde yok.
3. **Muhasebe Raporları** (ayrı bir rapor grubu) — Dijiyon'daki Yevmiye
   Defteri/Kebir/Mizan bulgusuyla birlikte, sektörde **çift kayıtlı muhasebe
   raporlamasının neredeyse standart** olduğunu doğruluyor (bkz. §7 öneri).
4. **Kurul Raporları** ayrı bir rapor grubu — yönetim kurulu için özel raporlama.
5. **Vekaletname Örneği, Antetli Evrak, Adres Etiket Yazdır, Bilgi Bankası** —
   yönetim şirketinin günlük evrak işlerini (vekaletname, resmi yazışma, tebligat
   zarfı etiketi) hazır şablonlarla çözüyor; bizde belge şablonu üretimi yok
   (yalnız `belgeler` = dosya deposu).
6. **Güvenlik ve Denetçi uygulaması kullanıcı tanımları** — Yönetimcell'in 4 ayrı
   uygulama (Yönetici/Denetçi/Güvenlik/İş Takip) iddiası burada kullanıcı tanım
   ekranlarıyla somut olarak doğrulandı.
7. **Tutar eşikli hazır borç filtreleri** (§5.2) — bizim liste filtrelerimizde
   yok, kolayca eklenebilir küçük bir kazanım.

### 5.5 Daha önce doğrulanmış (GAP-ANALYSIS §3.1) bulgular — hâlâ geçerli

Aidat grubu/plan, m²-arsa payı-endeks-ısıölçer paylaşımı, günlük/dönemsel gecikme
cezası, banka dekont eşleştirme, "site yönetimleri için özel CMS web sitesi".
Şikâyetler: manuel taksitlendirme+faiz, kısmi grup gecikme uygulaması manuel,
komisyon şeffaf değil, kiracıya ayrı bildirim yok.


---

## 6. Karşılaştırma tablosu — modül bazında durum

| Modül / Özellik | Dijiyon | Yönetimcell | Bizde durum |
| --- | --- | --- | --- |
| Çift kayıtlı muhasebe (Yevmiye/Kebir/Mizan/BA-BS) | ✅ | ✅ "Muhasebe Raporları" grubu var | ❌ yok |
| Borçlandırma (tekli/toplu, taksit, gecikme) | ✅ | ✅ (bazı şikayetli) | ⚙️ var, taksitlendirme + esnek gecikme uygulandı (GAP-DURUM §1) |
| Cari hesap (malik/kiracı ayrı satır) | kısmi | ✅ canlı doğrulandı (aynı birim için 2 ayrı satır, 6 durum filtresi) | ⚙️ "tek cari" liste var (GAP-DURUM), ayrı satır değil rozet |
| Firma / personel cari hesabı | — | ✅ ayrı "Ödeme ve Borçlanma" ekranı | ❌ yok |
| Banka entegrasyonu / eşleştirme | ✅ | ✅ + **Banka Talimatı Oluştur** | ❌ arayüz yok (Sprint 4 kalanı) |
| Sanal POS | ✅ | — | `packages/payment` var, UI belirsiz |
| Personel (bordro+SGK) | kısmi (bordro yakında) | ✅ tanım var, bordro belirsiz | ❌ yok (Sprint 4 kalanı) |
| Kıdem/İhbar hesaplayıcı | ✅ | — | ❌ yok |
| Otopark | ✅ (ayrı modül) | — | kısmi `rezervasyon` altında olabilir, ayrı modül yok |
| PTS / turnike | ✅ | — | ❌ yok (donanım, Faz 17) |
| Karar Defteri (sıra no + tarih + gündem) | ✅ | ✅ canlı ekran görüldü (boş demo) | ❌ yok (`toplantilar` var ama resmi karar defteri değil) |
| Demirbaş/envanter | ✅ | ✅ tanım + borçlandırma kategorisi | ❌ yok |
| Kira / depozito takibi | — | ✅ ayrı borç kategorisi | ❌ yok |
| İdari ceza (kural ihlali) kategorisi | — | ✅ ayrı borç kategorisi | ❌ yok |
| Vekaletname / antetli evrak / adres etiketi şablonları | — | ✅ | ❌ yok (yalnız dosya deposu `belgeler`) |
| Kişi bazlı bakiye trend grafiği | — | ✅ (üye satırında "monitoring" ikonu) | ❌ yok (yalnız site geneli grafik) |
| Arıza/Talep takibi | ✅ liste | — | ⚙️ sayfa var, thread/SLA/atama yok |
| Anket | ✅ | — | ⚙️ sayfa var, oluşturma/oylama/sonuç UI yok |
| Duyuru (zamanlama/hedef kitle) | ✅ basit | — | ⚙️ şema hazır, UI eksik |
| SMS / E-posta / Sesli Mesaj | ✅ | — | SMS/E-posta paketleri var; **Sesli Mesaj (robocall) yok** |
| WhatsApp | ❌ yok | ❌ yok | ✅ **bizde var, rakiplerde yok — fark yaratan** |
| Audit Timeline (borç değişikliği) | ❌ | şikayet konusu (yok) | ✅ **bizde var — fark yaratan** |
| Hukuk/İcra aşama takibi | ✅ 4 liste | ✅ 2 liste + tebligat | ⚙️ backend var, kart/aşama UI yok |
| KVKK / veri erişim denetimi | görünmüyor | görünmüyor | ✅ **bizde var — fark yaratan** |
| Kan grubu / acil durum bilgisi | ✅ | — | ❌ yok, kolay eklenir |
| AI sohbet/sesli asistan | ✅ (Dijital Yönetici) | — | ❌ yok — yeni fikir |
| Sayaç okuma + tüketim trend | liste (Sayaç Tüketim raporu) | ısıölçer/kalorimetre hesaplı | ⚙️ liste var, okuma girişi/trend yok |
| Toplu veri girişi (Excel import) | ✅ Toplu Tanımlamalar | — | ❌ yok (planlı) |
| Web sitesi/CMS (site özel) | — | ✅ öne çıkan (GAP §3.1) | ⚙️ `apps/web` marketing var, tenant'a özel site yok |
| Ayrı Güvenlik/Denetçi kullanıcı rolleri | — | ✅ canlı doğrulandı (tanım ekranları) | RBAC var, bu rollere özel ayrı "uygulama" yok |
| Tutar eşikli hazır borç filtresi (500₺+, 1.000₺+ vb.) | — | ✅ | ❌ yok |

Lejant: ✅ var/güçlü · ⚙️ kısmi/altyapı var UI eksik · ❌ yok

---

## 7. Öncelik önerisi (bu bulgulara göre)

**Hızlı kazanımlar (düşük efor, yüksek algılanan değer):**
- Kan grubu / acil durum kişi alanı + basit rapor
- Kıdem/İhbar tazminatı hesaplayıcı (personel modülüne widget)
- Demirbaş/envanter basit CRUD listesi
- Liste filtrelerine tutar eşikli hazır "riskli cari" filtreleri (500/1.000/2.000₺+)
- Borç kategorilerine Kira, Depozito, İdari Ceza eklenmesi (iki rakipte de var)

**Orta vadeli (GAP-DURUM §4'te zaten planlı, bu rapor önceliklendirmeyi teyit ediyor):**
- Banka hareket eşleştirme arayüzü
- Talep yönetimi (thread + SLA + atama)
- Toplu veri girişi / göç sihirbazı (Dijiyon'un "Toplu Tanımlamalar"ıyla doğrudan
  rekabet ediyor)
- Anket/toplantı/hukuk tam akışları + **Karar Defteri** (yeni: resmi karar kaydı
  toplantı modülüne eklenmeli, salt "toplantı" yeterli değil)

**Yeni, GAP dokümanlarında hiç geçmeyen fikirler:**
- **Muhasebe defteri modülü** (Yevmiye/Kebir/Mizan/BA-BS) — yönetim şirketi/mali
  müşavir segmentine satış için muhtemelen gerekli; ürün kararı gerektirir (kapsam
  büyük, ayrı ADR/karar önerilir).
- **AI destekli Yönetim Asistanı** (metin+sesli, KMK/aidat sorularını
  `packages/dues/src/kmk.ts` kural motoruna bağlayarak yanıtlayan bir sohbet
  widget'ı) — WhatsApp-first + Audit Timeline'ın yanına üçüncü "vurucu özellik"
  adayı olabilir.
- **Sesli Mesaj (robocall)** kanalı — SPEC'te zaten var ama uygulanmadı; Dijiyon
  müşterilerinin gördüğü somut bir kanal, WhatsApp fallback'i olarak öncelik
  kazanabilir.

---

## 8. Sınırlamalar / doğrulanamayanlar

- Yönetimcell'de menü haritası ve **Üye Listesi**, **Karar Defteri** ekranları
  canlı doğrulandı; ancak **Genel Kurul Çağrısı, Muhasebe Raporları, Banka
  Talimatı Oluştur, cari hesap ekstresi (tek üye detay/dökümü)** gibi bazı alt
  sayfalara tıklanıp içerik doğrulanmadı (menü adından çıkarım yapıldı). Bir üye
  satırındaki "açıklama/ekstre" ikonuna tıklandı ancak sonuç ekranı gözlemlenemedi
  (etkileşimli olmayan ikon olabilir).
- Dijiyon'da "Mesken İzleme", "Yönetim Faaliyet", "Emanet ve Ek Hesaplar" gibi
  bazı alt sayfalara tıklanıp içerik doğrulanmadı — yalnız menü adından çıkarım
  yapıldı. Derinlemesine inceleme istenirse ikinci bir tur yapılabilir.
- Apsiyon ve Biyos bu turda incelenmedi (kullanıcı yalnız Dijiyon + Yönetimcell
  paylaştı); önceki `GAP-ANALYSIS.md` §3.2'deki tahmini bulgular hâlâ geçerli.
