# YAPILACAKLAR (Backlog & Bekleyen Geliştirmeler)

> Bu dosya projenin **tek ve güncel iş listesidir**. Tamamlanmış tüm geçmiş tarihsel dokümanlar temizlenmiş; yalnızca **henüz yapılmamış, açıkta kalan, ürün kararı bekleyen veya sıradaki sprintlere planlanan işler** burada toplanmıştır. Bir iş tamamlandığında listeden işaretlenmeli veya kaldırılmalıdır.

---

## 1. Sakin Portalı Açıkları (Resident Portal Incomplete)

Sakin portalı kabuğu ve temel ekranları kuruldu ancak aşağıdaki kritik kullanıcı akışları henüz tamamlanmadı:

- [ ] **Sakin Oylama / Anket Ekranı:**
  - Özet kartında "oy bekleyen anket" sayısı gösteriliyor ancak bağlantı ve oy kullanma ekranı yok.
  - `poll:vote` izni RBAC'ta tanımlı, API ve UI akışı yazılacak.
- [ ] **Sakin Ödeme Akışı (Borçlarım → Kredi Kartıyla Öde):**
  - `/v1/panel/portal/payment` uçları hazır (`portal-payment.controller.ts`), ancak "Borçlarım" ekranında 3D Secure kredi kartı ödeme butonu ve formu UI'a bağlanmadı.
- [ ] **Sakin Telefon Değiştirme Akışı:**
  - Telefon numarası oturum kimliği olduğu için kontrolsüz düzenlenemez; SMS/OTP doğrulamalı telefon değiştirme sihirbazı kurulmalı.
- [ ] **Sakin İçin Karar Defteri, Toplantılar ve Belgeler:**
  - Kat Mülkiyeti Kanunu (KMK md.32) uyarınca kat malikleri kararları ve tutanakları görme hakkına sahiptir (`decision:read` sakine verildi).
  - Ancak bu sayfalar şu an `audience: staff` olarak kilitli; sakinler için salt-okunur toplantı/karar görüntüleme ekranı açılmalı.
- [ ] **Erişim Talebi Bildirimi:**
  - `/kayit-talebi` üzerinden yeni sakin başvurduğunda yöneticiye bildirim (push/zil/SMS) gitmiyor, nav rozeti yok. Yöneticinin ekrana manuel girmesi gerekiyor.

---

## 2. Yönetici Paneli Eksik Yazma Yolları (Operator Cockpit Gaps)

Aşağıdaki modüllerde liste/okuma ekranları mevcut ancak yazma (CRUD) akışları henüz bağlanmadı:

- [ ] **Hukuk Modülü (`/panel/hukuk`):**
  - Liste ekranı var (`GET /v1/panel/legal`), ancak yeni icra takibi veya dava dosyası açma yazma akışı (`legal:write`) yok.
- [ ] **Belge Yükleme (`/panel/belgeler`):**
  - Dosya listesi var, ancak dosya yükleme yazma yolu (`document:write`) yok (S3/R2 depolama ve saklama politikasına bağlanacak).
- [ ] **Banka Hareket Eşleştirme & Talimat (`bank:reconcile`):**
  - Hesap tanımları ve kasa bakiye motoru çalışıyor; ancak banka ekstresi (OFX/Excel/API) ile aidat borçlarını eşleştirme ve toplu ödeme talimatı üretme ekranı eksik.
- [ ] **Tahsilat İade Akışı (`payment:refund`):**
  - Hatalı veya mükerrer tahsilatlarda iyzico/banka iade çağrısı ve muhasebe mahsup ters kaydı akışı eksik.
- [ ] **Borç Silme / Affetme Prosedürü (`debt:forgive`):**
  - Şu an sadece borç düzeltme (`debt:write` + gerekçe) var; kat malikleri kurulu kararıyla borç silme/af prosedürü ayrı bir izin ve akışa bağlanmadı.
- [ ] **Acil Duyuru Yetkisi Ayrımı (`announcement:send_urgent`):**
  - `announcement:write` yetkisine sahip herkes gece yarısı bile acil bildirim (SMS+WhatsApp) gönderebiliyor; acil gönderim izni ayrı bir yetkiye bağlanmalı.

---

## 3. Arka Plan İşleri ve Faturalama (Worker Jobs & Billing)

- [ ] **16 Boşta Kalan Worker Job'ı (`skipped: no_handler`):**
  - `billing.trial-expiry`: 30 günlük deneme süresi biten siteleri otomatik olarak askıya alan worker işi (şu an sadece süper-admin manuel yapabiliyor).
  - `billing.dunning`: Kart çekimi başarısız olan abonelikleri belirli aralıklarla yeniden deneyen ve e-posta uyarıları atan akış.
  - `billing.renewal`: Yıllık/aylık SaaS lisans yenileme işi.
  - `billing.archive-purge`: 90 günlük bekleme süresi dolan arşivlenmiş sitelerin veritabanı kayıtlarını temizleyen job.
- [ ] **Kampanya ve Kupon Yönetimi:**
  - Kampanya motoru ve çoklu site indirimleri kodlandı ancak yönetim panelinden yeni promosyon/kupon oluşturma arayüzü yazılmadı.
- [ ] **Ek Paket Kredi Düşümü:**
  - `tenant_addons` tablosunda SMS ve WhatsApp kredileri tutuluyor ancak bildirim gönderildiğinde bakiye otomatik olarak düşmüyor (`packages/notifications` entegrasyonu).

---

## 4. Rakiplerden Gelen & Bekleyen Ürün Özellikleri (Backlog)

- [ ] **Borcu Yoktur Belgesi (PDF + KEP Çıktısı):**
  - Daire satışlarında noter ve tapu için gereken resmi "Borcu Yoktur" belgesinin dinamik barkodlu PDF olarak üretilmesi.
- [ ] **Toplu Veri İçe Aktarma / Göç Sihirbazı (Excel Migration):**
  - Başka yazılımlardan (Apsiyon, Dijiyon, Excel) gelen daire, malik, kiracı ve devir bakiyelerinin tek tıkla sisteme aktarılması.
- [ ] **Muhasebe Raporları (Yönetim Şirketleri İçin):**
  - Mizan, Muavin, Yevmiye Defteri ve BA-BS formatında resmi muhasebe raporlama modülü.
- [ ] **Tedarikçi ve Personel Cari Hesapları:**
  - Sadece sakinler için değil; asansör bakım firması, temizlik şirketi ve personel için de borç/alacak cari hesap takibi.
- [ ] **AI Yönetim & Mevzuat Asistanı:**
  - Kat Mülkiyeti Kanunu (KMK) ve yönetim planı sorularını yanıtlayan yapay zeka sohbet botu.
- [ ] **Hazır Evrak Şablonları:**
  - Genel kurul çağrı mektubu, hazirun cetveli, vekaletname örneği gibi sık kullanılan matbu evrakların sistemden otomatik üretimi.
- [ ] **Sesli Arama (Robocall) Bildirim Kanalı:**
  - Kritik genel kurul veya acil su/elektrik kesintileri için sesli arama entegrasyonu.

---

## 5. Güvenlik, Test ve Teknik Borçlar

- [ ] **Sakin Portalı & Erişim Talebi Entegrasyon Testleri:**
  - `/v1/panel/portal/*` ve `/v1/auth/web/*` uçlarının veritabanına karşı çalışan duman testleri (`tests/integration`).
- [ ] **Kasa Mutabakat Testleri:**
  - `IntegrationService.bankOverview` (nakit kasa, banka hesapları, ödenmemiş giderler) için vitest birim testleri.
- [ ] **Mobil Kart ve Klavye Testleri:**
  - Yeni eklenen `/panel/demirbas` ve `/panel/karar-defteri` ekranlarının 375px mobil ekranlarda ve klavye gezinmesinde doğrulanması.
- [ ] **Kıdem Tazminatı Resmi Değerleri:**
  - `siteConfig.payroll` içindeki tavan ücret ve gelir vergisi yer tutucularının güncel resmi Hazine ve Maliye Bakanlığı katsayılarıyla güncellenmesi.
- [ ] **Canlı Veritabanı Migration'ları:**
  - Yerelde test edilen `0008_access_requests`, `0009` ve `0010` migration'larının production veritabanına uygulanması.
