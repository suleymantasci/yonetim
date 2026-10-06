# YAPILACAKLAR (Backlog & Bekleyen Geliştirmeler)

> Bu dosya projenin **tek ve güncel iş listesidir**. Yalnızca **henüz yapılmamış, açıkta kalan, ürün kararı bekleyen veya dış bağımlılığı olan işler** burada durur. Bir iş tamamlandığında listeden kaldırılmalıdır.
>
> Son denetim: 2026-10-06 — her madde koda karşı doğrulandı. Önceki sürümdeki oylama ekranı, belge yükleme, hukuk yazma, iade, acil duyuru yetkisi, kampanya arayüzü, telefon değiştirme vb. maddeler kodda zaten vardı; listeden çıkarıldı.

---

## 1. Dış bağımlılığı olan işler (kimlik bilgisi / sağlayıcı gerekiyor)

- [ ] **Sakin ödeme akışı — canlı tahsilat:** `/odeme` ve `/v1/panel/portal/payment` hazır; kartla ödeme yalnız platformda iyzico kimlik bilgisi ve komisyon oranı (`IYZICO_COMMISSION_PCT/FIXED_KURUS`) tanımlıysa açılıyor. **Açık soru:** iyzico'dan siteye hakediş aktarımı (alt üye işyeri / transfer) kodda yok; tahsilat tek platform hesabına düşüyor. Gerçek para almadan önce netleştirilmeli.
- [ ] **Platform aboneliği online tahsilatı:** Paket şimdilik süper admin panelinden manuel atanıyor (havale/elden). `billing.renewal` yeni dönem faturasını **keser** ama kart çekmez; `billing.dunning` vade gecikmesine göre adım uygular. Kartla otomatik çekim (iyzico abonelik) yazılmadı.
- [ ] **Harici kanallı hatırlatmalar:** `dues.reminder`, `dues.late-warning`, toplantı/belge/SLA hatırlatmaları şu an **uygulama içi** bildirim yazıyor. SMS/WhatsApp/e-posta ile gönderim olay kuyruğu + `route()` + kredi düşümü zincirine bağlanmalı (sağlayıcı anahtarları yok).
- [ ] **Worker'da işleyicisi olmayan 6 iş:** `bank.sync` (open banking sağlayıcısı), `bank.reconcile` (ekstre/webhook karşılaştırması), `nps.monthly-survey`, `reports.monthly` (e-posta sağlayıcısı), `landing.revalidate` (Next revalidate uç noktası). Tanımlar duruyor, `skipped: no_handler` dönüyor.
- [ ] **Banka toplu ödeme talimatı:** Ekstre içe aktarma ve onay akışı hazır (CSV). Onaylı giderler için banka talimat dosyası üretimi (havale toplu ödeme) yok; bankaya özgü format gerektiriyor.

## 2. Ürün kararı / büyük modül gerektiren işler

- [ ] **Muhasebe raporları (Mizan, Muavin, Yevmiye, BA-BS):** Sistem çift kayıtlı defter tutmuyor; bu raporlar ya bir hesap planı + çift kayıt altyapısı ya da türetilmiş (sentetik) rapor kararı gerektiriyor. BA-BS için tedarikçi vergi numaraları da eksik.
- [ ] **Tedarikçi ve personel cari hesapları:** Giderlerde `vendor_name`/`vendor_id` var ama tedarikçi kartı ve cari ekstresi yok.
- [ ] **Hazır evrak şablonları:** Genel kurul çağrı mektubu, hazirun cetveli, vekaletname — metin ve hukuki içerik onayı gerekiyor.
- [ ] **AI yönetim & mevzuat asistanı** (KMK soru-cevap).
- [ ] **Sesli arama (robocall) kanalı:** `voice` kanalı enum'da var, sağlayıcı yok.
- [ ] **Borcu Yoktur belgesi:** Belge üretimi ve doğrulama sayfası var; barkodlu PDF ve KEP çıktısı doğrulanmadı.

## 3. Test ve doğrulama

- [ ] **Mobil kart ve klavye testleri:** `/panel/demirbas`, `/panel/karar-defteri` ve yeni banka ekstre ekranı 375px'te ve klavye gezinmesinde doğrulanmadı.
- [ ] **Yeni ekranların tarayıcı denemesi:** Borçlar ekranındaki "Borcu sil (kurul kararı)" toplu eylemi API ve tip düzeyinde test edildi; tarayıcıda denenmedi.
- [ ] **Canlı veritabanı migration'ları:** `0008`–`0015` migration'ları yerelde uygulanıyor; production'a uygulandığı doğrulanmalı (canlıya dokunulmadı).

## 4. Bilinen kısıtlar (bilinçli)

- Kıdem tazminatı tavanı (`siteConfig.payroll`) **yılda iki kez** (Ocak/Temmuz) elle güncellenir. Mevcut değer 1 Temmuz–31 Aralık 2026: 73.729,84 TL.
- Aidat hatırlatmaları gün penceresiyle çalışıyor (vade −5 gün, +7 gün); iş o gün çalışmazsa tekillik indeksi tekrarı engelliyor ama kaçan gün telafi edilmiyor.
- Banka eşleştirme önerisi **tahsilat açmaz**; yönetici onayı şart (`suggested` → `auto`/`manual`).
