# Yönetimcell — Hukuki, Tanımlar, Raporlar: eksiklerimiz (2026-10-08)

Kaynak: Dolgun Sitesi'nin yönetici hesabıyla (kullanıcının kendi hesabı) Yönetimcell
paneli `yonetici4.yonetimcell.com` gezildi; Hukuki (10), Tanımlar (16), Raporlar (36)
ekranı açılıp alanları, filtreleri ve tablo sütunları okundu. Hiçbir kayıt
değiştirilmedi. "Bizde" sütunu bu tarihteki `main` (fc9d109).

## 1. Veri modelinde öne çıkan farklar (öncelik yüksek)

| Yönetimcell | Bizde | Not |
|---|---|---|
| **Borçlandırma seçenekleri** kullanıcı tanımlı (Aidat, Yakıt, Demirbaş, Avans, Kira, Depozit, Ek Gider, İdari Ceza + yeni eklenebilir). Her biri için: **borçlu = Oturan / Malik**, muhasebe kodu, bağlı sayaç + birim fiyat, gecikme tazminatı türü (dönemsel / günlük) ve oranı (%1–%20), aktif/pasif | `debt_kind` sabit enum; gecikme oranı ayar/plan düzeyinde; borçlu kuralı yok | En kritik fark. Demirbaş maliğe, aidat/yakıt oturana gidiyor; kiracılı dairede doğru kişiye borç yazmanın temeli. |
| Daire kartında **"bu dairenin Aidat borçlandırmalarını Malik'e kaydet"** istisnası | yok | Borçlu kuralının daire bazında ezilmesi. |
| Üye (cari) satırı: durum (Malik / Kiracı / (E) Malik / (E) Kiracı), hisse %, giriş–çıkış tarihi, **plaka**, **ikamet (hane halkı)** | ilişki (owner/tenant), hisse, başlangıç/bitiş ✓; plaka ✗, hane halkı ✗ (yalnız `resident_count`) | |
| Raporların hepsinde kişi filtresi: Tümü / Aktif malik ve kiracılar / Oturanlar / Malikler / Kiracılar / **Eski malikler / Eski kiracılar** | eski üye ayrımı listelerde/raporlarda yok | Eski kiracının kalan borcu takibi için şart (Dolgun'da 2 eski kiracının 1.490 ₺ borcu var). |
| Daire kartı: m², kişi sayısı, aidat grubu, kat, arsa payı, araç sayısı, yakıt/sıcak su/soğuk su/elektrik sayaç no, dolu/boş | çoğu ✓ (sayaçlar ayrı modül) ; araç sayısı ✗ | |

## 2. Hukuki

| Yönetimcell | Bizde |
|---|---|
| **Tebligat gönder**: blok / üye durumu / borç tipi / dönem ("2025 Ekim ve öncesi") / "borcu olan · vadesi geçmiş · ≥ 500 ₺" filtresi → seçilen üyelere **ödeme çağrısı** ya da **ihtarname** metni (borç dökümüyle), yazdır | ✗ (icra dosyasında yalnız "tebligat" olay tipi) |
| İcradaki üyeler listesi / icradaki dosyalar (avukata göre) | ✓ `/panel/hukuk` (dosya, aşama, tahsilat) — avukat seçimi/filtresi ✗ |
| Genel kurul çağrısı (hazır metin, alıcı seçimi, yazdır) | kısmen: toplantı + çağrı kaydı (KMK 29) ✓, **çağrı mektubu metni/yazdırma** ✗ |
| Vekaletname örneği (hazır metin) | ✗ (vekil sınırı KMK 31 ✓) |
| Hazirun cetveli (blok, olağan/olağanüstü, satır yüksekliği) | ✓ yoklama + yazdır |
| Karar defteri | ✓ (değiştirilemez) |
| **Antetli evrak** (başlıklı serbest yazı) | ✗ |
| **Adres etiketi yazdır** (2×4 / 2×5 / 2×6, telefon ekle, blok + üye durumu filtresi) | ✗ |
| **Bilgi bankası** (yönetmelikler, örnek yazışmalar, SSS: "aidattan kim sorumlu", "borçlu daire satılırsa"…) | ✗ |

## 3. Tanımlar

| Yönetimcell | Bizde |
|---|---|
| Taşınmaz ve üye tanımları | ✓ birimler + sakinler (fark: §1) |
| Blok tanımları | ✓ |
| Aidat grubu tanımları (sabit tutar grupları) | ✓ aidat planları |
| Üye borçlandırma seçenekleri | ✗ → §1 |
| **Harici tahsilat grupları** (kira, reklam, vadeli hesap gelirleri) | kısmen: kasa gelir hareketi (602.xx) ✓, kullanıcı tanımlı grup ✗ |
| Kasa / banka tanımları (varsayılan kasa, POS hesabı) | ✓ hesaplar; **varsayılan kasa** ✗ |
| Banka entegrasyon tanımları (API) | ✗ (dosya aktarımı ✓) |
| Gider grubu + gider tanımları (2 seviye) | ✓ kategoriler (parent) |
| Firma (satıcı) | ✓ tedarikçiler + cari + mutabakat |
| Personel (görev listesi: kapıcı, güvenlik, bahçıvan…) | ✓ personel + cari |
| **Avukat tanımları** | tablo var (`lawyers`), **ekran yok** |
| Demirbaş | ✓ |
| Güvenlik uygulaması kullanıcıları | ✓ ön büro (kargo/ziyaretçi) rolü |
| Denetçi uygulaması kullanıcıları (denetim kurulu raporlara erişir) | rol var (auditor); **siteye kullanıcı ekleme ekranı ✗** |
| **Program kullanıcıları** (ikinci yönetici, muhasebeci) | ✗ ekran (ayarlarda davet yok) |

## 4. Raporlar

| Yönetimcell | Bizde |
|---|---|
| Genel durum, Mizan (genel kurul), Denetim kurulu, Yönetim faaliyet raporu | ✓ (mizan, denetim, faaliyet, bilanço) |
| Özet durum (gerçekleşen / tahakkuk eden, gider detay/grup) | ✓ gelir-gider |
| İşletme defteri | ✓ |
| Genel bilanço | ✓ |
| **Dönemsel gelir-gider tablosu** (ay ay matris, tahakkuk / gerçekleşen) | ✗ |
| **Günlük / aylık / aylık özet bilanço** (kasa giren-çıkan-kalan; daire bazında kalan borç–tahsilat–gider–ödeme) | ✗ |
| Bütçe raporları, işletme projesi | ✓ bütçe → aidat planı |
| **Tahsilat raporu** (tür, blok, tahsilat grubu, kasa, makbuz no) | ✗ ayrı rapor (borç/ödeme listeleri var) |
| Detaylı gider raporu, gider grubu raporu (firma avansları) | kısmen (gider listesi filtreleri) |
| **Taşınmaz / detay, taşınmaz / dönem, dönem / detay, üye / detay, üye / dönem** — satır daire ya da kişi, sütun ay/yıl; değer kalan anapara / tahakkuk / ödenen; dönem- ya da tarih-esaslı; avans ve icra dahil seçenekleri | ✗ — yöneticinin en sık baktığı "kim hangi ay borçlu" tablosu |
| **Toplu tahsilat makbuzu dökümü** | ✗ |
| **Toplu hesap özeti dökümü** (seçilen tüm üyelere, tarih aralıklı) | ✗ (tek kişi hesap özeti ✓) |
| **Toplu üye borç dökümü** | ✗ |
| Borçlandırma durum / detay raporu (her borçlandırma: tutar, ödenen, kalan) | kısmen (tahakkuk çalışmaları) |
| Muhasebe tahakkuk fişleri, özet mizan, yevmiye + kebir | ✓ |
| **Muhasebe kodları** (kasa, banka, üye, firma, gider, tahsilat grubu, gecikme kodu eşlemesi) | kısmen: kodlar sabit, eşleme ekranı ✗ |
| Firma mutabakat mektubu | ✓ |
| **SMS / e-posta gönderim raporu** | ✗ ekran |
| Kullanıcı hareket raporu | ✓ denetim kaydı |
| **Silinen hareket raporu** (silinen tahsilat/borç: kim, ne zaman) | kısmen (denetim kaydında var, ayrı rapor ✗) |
| Üyelere kaydedilen notlar | kısmen (üyelik notu) |
| Dosya arşivi | ✓ belgeler |

## 5. Önerilen sıra

1. **Borç türü tanımları** (kullanıcı tanımlı tür, borçlu = oturan/malik, tür başına gecikme türü+oranı, muhasebe kodu) + daire bazında "aidatı maliğe yaz" istisnası. Toplu borçlandırma ve geçiş bunu kullanır.
2. **Eski üye** ayrımı bütün liste/rapor filtrelerinde (aktif / oturan / malik / kiracı / eski malik / eski kiracı).
3. **Taşınmaz/üye × dönem borç raporları** + toplu hesap özeti / borç dökümü / makbuz dökümü (PDF, mevcut `pdfRoute` altyapısıyla).
4. **Tebligat / ihtarname** (filtreli toplu; metin şablonu; PDF) + genel kurul çağrı mektubu + vekaletname şablonu + antetli evrak + adres etiketi.
5. Program kullanıcıları (davet + rol), avukat ekranı, varsayılan kasa, harici tahsilat grupları, SMS/e-posta gönderim raporu, silinen hareket raporu, araç plakası, hane halkı, bilgi bankası.
