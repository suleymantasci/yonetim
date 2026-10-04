# Modül CRUD Denetimi, Yasal Uyum ve Rakip Analizi

**Tarih:** 2026-10-05 · **Ortam:** vekil.tasci.cloud (yönetici hesabı `yonetici@ornek.test`)
**Yöntem:** (1) 213 API ucu kaynak koddan çıkarıldı, her yazma ucunun panelde
çağıranı eşleştirildi; (2) yönetici hesabıyla 29 menü modülü tarayıcıda gezildi
(hepsi 200, JS hatası yok); (3) sakin akışı uçtan uca denendi; (4) yerli ve
global rakipler incelendi.

## 1. Özet

- **API ↔ ekran uyumu iyi.** Panelde karşılığı olmayan yazma ucu yalnız üç tane:
  sakinin telefon değiştirme uçları (2) ve rapor işi iptali.
- **Sakin akışı tam çalışıyor:** ekle (KVKK aydınlatma onayı zorunlu) → düzenle →
  daireye bağla → çıkış (borç devri seçimiyle) → siteden çıkar (borçluysa engel,
  kişi kaydı ve geçmiş korunuyor).
- **Asıl eksikler "ekranı yapılmamış uç" değil, hiç yazılmamış işlemler:**
  tahsilat iptali/ters kaydı, KVKK başvuru yönetimi, duyuru düzenleme/geri çekme,
  sayaç okuması düzeltme, rezervasyon iptali, belge deposu.
- **Zamanlanmış işlerin 19'undan yalnız 3'ü yazılmış** (aylık aidat üretimi,
  gecikme tazminatı, bakım hatırlatmaları). KVKK saklama/anonimleştirme, başvuru
  süre takibi, deneme bitişi, abonelik yenileme gibi işler `no_handler` ile
  atlanıyor (`apps/worker/src/queue/job-registry.ts`).
- **Marka riski:** Kodda yer tutucu marka adı **"Yönetimcell"** — bu gerçek bir
  rakibin ticari adı (yonetimcell.com). `packages/config/src/site.ts` ve
  `plans.competitorYearlyPriceKurus` açıklaması. Yayından önce değişmeli.

## 2. CRUD matrisi (yönetici paneli)

✓ var · ✗ yok · — anlamsız/bilinçli olarak yok · (s) soft-delete/arşiv

| Modül | Ekle | Düzenle | Sil | Not |
|---|---|---|---|---|
| Bağımsız bölüm / blok | ✓ tek+toplu | ✓ tek+toplu | ✓ (s) çöp + geri al | Tam |
| Sakin | ✓ | ✓ | ✓ (s) siteden çıkar | Borçluysa çıkarılamaz; kişi kaydı silinmez (doğru) |
| Daire ilişkisi (malik/kiracı) | ✓ | ✗ | ✓ çıkış | Hisse oranı / başlangıç tarihi düzeltilemiyor — kapat-yeniden aç gerekiyor |
| Erişim talebi | — | onay/ret ✓ | — | Yöneticiye bildirim yok (YAPILACAKLAR §1) |
| Aidat planı | ✓ | ✓ | ✓ | Çalıştırma ✓ |
| Borç | ✓ tek+toplu | ✓ gerekçeli | ✓ (s) gerekçeli iptal | Gecikme tazminatı muafiyeti ✓; DB trigger'ı değişiklik kütüğü yazıyor |
| **Tahsilat (ödeme)** | ✓ | **✗** | **✗** | **Yanlış girilen tahsilat düzeltilemiyor / iptal edilemiyor; iade yok** |
| Gider | ✓ | ✓ (upsert) | ✓ (s) | Onay + dairelere dağıtım ✓; kategori ✓ |
| Banka hesabı | ✓ | ✓ | ✓ | Ekstre içe aktarma ve eşleştirme yok |
| **Duyuru** | ✓ | **✗** | **✗** | Taslak düzenleme, silme, yayından kaldırma yok |
| Anket / oylama | ✓ | ✓ | ✗ | Kapatma ✓; oy almamış taslak silinemiyor |
| Toplantı | ✓ | ✓ | ✗ | İptal yok; çağrı tebliği, hazirun, vekâlet akışı eksik (bkz. §3) |
| Toplantı kararı | ✓ | — | — | Doğru: karar sonradan değiştirilmez |
| Karar defteri | ✓ | — | — | Doğru: DB trigger'ı (0006) karar metnini ve silmeyi engelliyor; sayfa no/ek sonradan girilebiliyor |
| Mesaj | ✓ | — | — | |
| Talep / arıza | ✓ | ✓ + durum, atama, yorum | — | İptal durumu ile kapanıyor (doğru) |
| Bakım takvimi | ✓ | ✓ | ✓ | Tamamlama ✓ |
| Sayaç | ✓ | ✓ | ✓ | **Okuma düzeltme/silme yok**; tüketimi borca yansıtma kontrol edilmeli |
| Rezervasyon tesisi | ✓ | ✓ | ✓ | |
| Rezervasyon | ✓ | onay/ret ✓ | **✗** | Yönetici ya da sakin iptali yok |
| Personel | ✓ | ✓ | ✓ | Kıdem tazminatı hesabı ✓; bordro/SGK yok |
| Demirbaş | ✓ | ✓ (upsert) | durum ile | |
| Belgeler | ✓* | ✗ | ✓ | *Depo (S3/R2) gerekiyor — vekil'de yok, düğme gizli |
| Hukuk / icra | ✓** | ✓ + olay, tutar, kapat | — | **Yalnız gecikmiş borçlu daireden açılıyor; borç dışı dava açılamıyor |
| Borcu yoktur belgesi | ✓ | — | ✗ | Hatalı belgeyi iptal etme yok (doğrulama ucu var) |
| **KVKK yönetimi** | **✗** | **✗** | **✗** | Yalnız okuma. Başvuru kaydı/yanıtı, silme-anonimleştirme, ihlal kaydı yok |
| Panel kullanıcıları | ✓ (sakin formunda rol: personel, denetçi, muhasebeci) | ✓ | ✓ | İkinci yönetici / yönetim kurulu üyesi rolü eklenemiyor |
| Ayarlar | — | ✓ | — | |
| Denetim kütüğü | — | — | — | Doğru: salt okunur, değiştirilemez (trigger) |

## 3. Yasal uyum kontrol listesi

| Dayanak | Gereklilik | Durum |
|---|---|---|
| KMK md.20 | Ortak giderlere arsa payı / eşit pay ile katılım | ✓ dağıtım motoru |
| KMK md.20/son | Gecikme tazminatı aylık %5 üst sınırı | ✓ |
| KMK md.22 | Kanuni ipotek hakkı (alacak takibi) | ~ hukuk modülü var, ipotek tescili akışı yok |
| KMK md.29 | Kat malikleri kurulu yılda en az bir kez; **çağrı en az 15 gün önce**, gündem ile, imza karşılığı/taahhütlü/elektronik | ✗ çağrı tebliğ kaydı ve 15 gün kontrolü yok |
| KMK md.30 | Toplantı ve karar yeter sayıları (sayı + arsa payı) | ✓ `@yonetim/dues` yeter sayı hesapları |
| KMK md.31 | Vekâletle temsil (bir kişi birden fazla vekâlet sınırı) | ✗ vekâlet kaydı yok |
| KMK md.32 | Kararlar **noter onaylı karar defterine** yazılıp imzalanır | ✓ dijital karar defteri, DB düzeyinde değiştirilemez (0006 trigger), sayfa no ✓; ~ tutanak dosyası depo yokluğunda eklenemiyor |
| KMK md.35 | Yönetici: işletme projesi, karar ve **işletme defteri**, gelir-gider belgelerini saklama | ~ işletme defteri (kronolojik gelir-gider dökümü) raporu ayrıca olmalı |
| KMK md.37 | İşletme projesi; tebliğden itibaren **7 gün** içinde itiraz edilmezse kesinleşir | ~ simülatör var; tebliğ tarihi ve kesinleşme takibi yok |
| KMK md.41 | Denetçi en az 3 ayda bir denetler, rapor verir | ~ denetçi rolü var; dönemsel denetim raporu akışı yok |
| KVKK md.10 | Aydınlatma | ✓ sakin kaydında zorunlu onay |
| KVKK md.6 | Özel nitelikli veri (kan grubu) yalnız açık rıza | ✓ |
| KVKK md.7 | Silme / yok etme / anonimleştirme | ✗ panel akışı yok; `kvkk.retention` işi tanımlı ama yazılmamış (no_handler) |
| KVKK md.11 / 13 | İlgili kişi başvurusu, **30 gün** içinde yanıt | ✗ KVKK modülü salt okunur (tablo var); `kvkk.request-sla` işi yazılmamış |
| KVKK md.12/5 | İhlali **72 saat** içinde Kurul'a bildirim | ✗ `data_breaches` tablosu var, ekran yok |
| VUK md.253 / TTK md.82 | Mali kayıtların 5 (TTK: 10) yıl saklanması | ✓ soft-delete + değiştirilemez kütükler |
| 5651 | Erişim kayıtlarının saklanması | ✓ kütük |
| Tahsilat makbuzu | Hatalı makbuzun silinmesi değil iptal edilip ters kayıtla düzeltilmesi | ✗ tahsilat iptali yok |

## 4. Rakip analizi

### Yerli
- **Apsiyon** — pazar lideri; otomatik banka entegrasyonu ve hareket eşleştirme,
  sayaç okuma + faturalama, ortak alan rezervasyonu, iş emri, toplu SMS/e-posta,
  ücretsiz site web sayfası, geçiş kontrol/kamera/plaka entegrasyonu, çoklu proje,
  Excel/Word/PDF/CSV dışa aktarım, sakin mobil uygulaması.
- **Yönetimcell** (yonetimcell.com) — mobil odaklı; daire sayısına göre yıllık
  paketler (8–30 daire 5.899 ₺ … 901–1.000 daire 88.899 ₺), pakete dahil SMS,
  ön ödemeli SMS (1.000 = 259 ₺), anket, duyuru, iş takibi, 30 gün deneme,
  yönetim şirketleri için çoklu site ve ortak SMS havuzu.
- **Apartsoft, Konsiyon, Dijiyon, Siteyo, Huzurlu Yaşam** — aidat odaklı sade
  araçlar; Siteyo tarayıcı tabanlı ücretsiz plan; Huzurlu Yaşam akıllı kapı/kamera
  donanım entegrasyonu ve 33 daireye kadar ücretsiz.
- Pazar fiyatı: daire başı ayda 5–30 ₺.

### Global
- **Buildium / AppFolio** — muhasebe derinliği (genel muhasebe, borç/alacak),
  otomatik ödeme talimatı, iş emri, tedarikçi yönetimi.
- **Vantaca** — yönetim şirketleri için iş akışı motoru; ihlal (violation) takibi,
  mimari değişiklik başvurusu (ARC), banka entegrasyonu.
- **TownSq** — sakin topluluğu, mesaj panosu, etkinlik.
- **Condo Control** — kargo/paket takibi (fotoğraf + otomatik bildirim + QR),
  ziyaretçi ve misafir otopark izni, güvenlik vardiya defteri, olay raporu,
  anahtar takibi, ücretli ortak alan rezervasyonu.

### Bizde olmayıp rakiplerde olan (öncelik sırasıyla)
1. Banka ekstresi içe aktarma + otomatik tahsilat eşleştirme (Apsiyon, Buildium)
2. Otomatik ödeme talimatı / kayıtlı kart (Buildium, AppFolio)
3. Sayaç tüketiminin otomatik borçlandırılması (Apsiyon) — mevcut durumu doğrulanmalı
4. Kargo/paket ve ziyaretçi takibi, güvenlik defteri (Condo Control) — büyük siteler/rezidanslar
5. Tedarikçi cari hesapları (YAPILACAKLAR §4)
6. İhlal/şikâyet takibi (yönetim planına aykırılık) (Vantaca)
7. Site için tanıtım sayfası (Apsiyon) — bizde site landing var ✓
8. Akıllı kapı / kamera entegrasyonu (Apsiyon, Huzurlu Yaşam)

### Bizde olup rakiplerde zayıf olan (konumlandırma)
- RLS ile veritabanı düzeyinde site izolasyonu, değiştirilemez denetim/borç kütüğü
- KMK yeter sayı ve gecikme tazminatı hesaplarının kanuna referanslı olması
- WhatsApp üzerinden uygulamasız sakin deneyimi
- Hukuk/icra takibi, karar defteri, KVKK rıza kaydı (rakiplerde nadir)

## 5. Önerilen iş listesi

**P0 — yasal/veri doğruluğu**
1. Tahsilat iptali + ters kayıt (gerekçe zorunlu, makbuz "iptal" damgası, kütük)
2. KVKK yönetimi: başvuru kaydı → 30 gün sayaç → yanıt; silme/anonimleştirme; ihlal kaydı (72 saat)
3. Marka adının değiştirilmesi ("Yönetimcell" rakip markası)
4. ~~Karar defteri DB değiştirilemezliği~~ — zaten var (0006 trigger); 2026-10-05 testle doğrulandı

5a. Yazılmamış zamanlanmış işler: önce `kvkk.retention`, `kvkk.request-sla`,
    `billing.trial-expiry`

**P1 — eksik CRUD**
5. Duyuru: taslak düzenle/sil, yayından kaldır (gönderilmiş içerik değiştirilmez)
6. Sayaç okuması düzeltme (gerekçeli) ve tüketimi borçlandırma doğrulaması
7. Rezervasyon iptali (yönetici + sakin)
8. Toplantı: iptal/erteleme, çağrı tebliği kaydı + 15 gün uyarısı, hazirun ve vekâlet
9. Daire ilişkisi düzeltme (hisse oranı, başlangıç tarihi)
10. Borcu yoktur belgesi iptali
11. Belge deposu (R2) — tutanak, fatura, sözleşme yükleme bunu bekliyor

**P2 — rekabet**
12. Banka ekstresi içe aktarma + eşleştirme
13. İşletme projesi tebliğ/kesinleşme takibi, işletme defteri raporu
14. Tedarikçi cari, kargo/ziyaretçi takibi

## Kaynaklar
- https://www.apsiyon.com/en/products/apsiyon
- https://www.yonetimcell.com/aidat-ve-gider-takip-programi-fiyatlari.html
- https://www.siteyo.net/blog/apartman-yonetimi-yazilimi-karsilastirma
- https://huzurluyasam.net/blog/en-iyi-apartman-site-yonetim-programlari-2026/
- https://effortlesshoa.com/blog/best-hoa-management-software-2026
- https://www.condocontrol.com/markets/condos-co-ops/
