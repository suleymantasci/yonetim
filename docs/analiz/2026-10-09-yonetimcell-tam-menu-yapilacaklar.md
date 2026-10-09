# Yönetimcell tam menü karşılaştırması ve yapılacaklar (2026-10-09)

Kaynak: `yonetici4.yonetimcell.com/lib/common/menu.js` (155 rota) + Dolgun Sitesi
yönetici hesabıyla salt-okunur gezinti (110 ekran kaydı; borçlandırma ekranlarının
mantığı sayfa betiklerinden). Hiçbir kayıt değiştirilmedi. "Bizde" = `main` 364bcd2.

Durum: ✓ var · ◐ kısmen · ✗ yok · ⏸ beklemede (entegrasyon/maliyet) · — kapsam dışı

## 1. Menü haritası

### Giriş
| Yönetimcell | Bizde | Not |
|---|---|---|
| Giriş ekranı (notlar, ajanda, genel durum) | ✓ `/panel` | |
| Ajanda (notlar / faaliyetler) | ✓ `/panel/takvim`, üst bar notları | |
| Gelen mesajlar | ✓ `/panel/mesajlar` | |
| İş takibi (iş alanı/türü, görevli, teslim tarihi, durumlar) | ✓ `/panel/talepler` (kategori, atama, SLA, durum) | |
| Program ayarları → genel bilgiler, fatura | ✓ `/panel/ayarlar` | |
| Program ayarları → **makbuz ayarları** | ✗ | Y1 |
| Program ayarları → sakinlerle paylaşılan IBAN | ✓ `/odeme` (aidat hesaplarının açık IBAN'ı, erişim denetim kaydı) | |
| Program ayarları → e-posta / SMS / sanal POS | ⏸ | §3 |
| Web sitesi yönetimi | ◐ landing | — (ürün kararı) |
| Yardım (videolar) | ◐ `/panel/bilgi-bankasi` | |
| Yönetimcell: destek talebi, duyurular, faturalar, satın al | — | platform tarafı |
| Yönetimcell araçları: yeni üye listesi ekle | ✓ `/panel/gecis` | |
| **Giderleri yükle (Excel)** | ✗ | Y9 |
| **Cari birleştir / ayır** | ✗ | Y9 |
| **Hata veren üyeler (veri tutarlılığı)** | ✗ | Y9 |
| Kasaları birleştir, geçmiş sabitle | — | eski veri onarım araçları |

### Üyeler
| Yönetimcell | Bizde | Not |
|---|---|---|
| Üye (cari) listesi: blok, durum, **borç türü**, **borç eşiği / alacaklı / borcu olmayan** | ◐ `/panel/sakinler` (blok, rol, üye durumu, borçlu) | Y2 |
| Taşınmaz listesi (malik, kiracı, bakiye, borç türü/eşik) | ◐ `/panel/birimler` | Y2 |
| **TC kimlik no listesi** | ✗ | Y2 (açık TC: yönetici + denetim kaydı) |
| **İkamet edenler listesi** (yakınlık süzgeci) | ✗ (veri var: hane halkı) | Y2 |
| **Araç plaka listesi** (plakası olan/olmayan) | ✗ (veri var) | Y2 |
| Boş/dolu taşınmaz listesi | ◐ birimler "boş" süzgeci | Y2 |
| **Detaylı üye listesi** (seçmeli sütun dökümü) | ✗ | Y2 |
| **Metin girerek SMS/e-posta**, **borç durumu bildir**, **maliklere kiracı borcu bildir**, **şifre (giriş) bilgisi gönder**, **e-posta ile hesap özeti / borç dökümü** | ✗ (birebir mesaj ve duyuru var) | Y3 (uygulama içi + e-posta; SMS/WA ⏸) |
| WhatsApp bağlantısı | ⏸ | §3 |

### Giderler (Ödeme)
| Yönetimcell | Bizde | Not |
|---|---|---|
| Giderler / firmalar / personel — ödeme ve borçlanma bakiyeleri | ✓ giderler, tedarikçi cari, personel cari | |
| **Borç listesi** (ödenecekler: gider/firma/personel, bekleyen/ödenmiş) | ◐ gider durum süzgeci | Y4 |
| **İleri tarihli borçlar (tekrarlayan faturalar)** | ✗ | Y4 |

### Kasalar
| Yönetimcell | Bizde | Not |
|---|---|---|
| Genel kasa durumu, virman, harici tahsilat | ✓ `/panel/kasa` | |
| **Banka EFT/havale talimatı** (talimat listesi belgesi) | ✗ | Y5 (belge; banka API'si değil) |
| Banka hareketlerini Excel'den al | ✓ `/panel/banka/aktar` | |
| Banka entegrasyonu ile gelen hareketler | ⏸ | §3 |
| **Kasa devir — seçilen tarih ve öncesini kilitle** | ◐ devir tutanağı var, kilit yok | Y5 |

### Raporlar
| Yönetimcell | Bizde | Not |
|---|---|---|
| Genel durum, özet durum, dönemsel gelir-gider, mizan, işletme defteri, genel bilanço, denetim, faaliyet | ✓ | |
| **Tahsilat raporu** (tür, blok, tahsilat grubu, kasa, makbuz no, açıklama, tarih) | ◐ makbuz dökümü | Y6 |
| **Detaylı gider raporu**, **gider grubu raporu** | ◐ gider listesi | Y6 |
| **Günlük bilanço**, **aylık bilanço**, **aylık özet bilanço** | ✗ | Y6 |
| Bütçe raporları, işletme projesi | ✓ `/panel/butce` | |
| Taşınmaz/üye × detay/dönem | ✓ `/panel/raporlar/donem-borc` | |
| Toplu makbuz / hesap özeti / borç dökümü | ✓ | |
| **Borçlandırma durum raporu**, **borçlandırma detay raporu** | ✗ | Y6 |
| Tahakkuk fişleri, özet mizan, yevmiye+kebir, firma mutabakat | ✓ `/panel/muhasebe` | |
| **Muhasebe kodları** (hesap planı ve eşleme listesi) | ◐ kodlar sabit + tür/grup kodu | Y6 |
| SMS/e-posta raporu, kullanıcı hareket, silinen hareket | ✓ | |
| **Üyelere kaydedilen notlar** | ◐ sakin kartında not | Y6 |
| Dosya arşivi | ✓ `/panel/belgeler` | |

### Borçlandır
| Yönetimcell | Bizde | Not |
|---|---|---|
| Aidat grubuna / işletme projesine göre | ✓ aidat planı, bütçe → plan | |
| Tutar girerek, metrekare, arsa payı, kişi sayısı, eşit | ✓ toplu borçlandırma | |
| **Satır bazında tutar düzeltme ve borçlu (hisse) seçimi** önizlemede | ✗ | Y7 |
| Endekse bağlı (sayaç × birim fiyat + okuma bedeli) | ◐ sayaç okuması → borç | Y7 (okuma bedeli, yuvarlama) |
| **Okuma firması verilerine göre** (dosyadan sayaç no ile) | ✗ | Y7 (dosya; firma API'si ⏸) |
| **Isı (pay) ölçerli yakıt**, **yakıt+su**, **yaz dönemi su** | ✗ | Y8 |
| **İleri tarihli borçlandırma** (dönem aralığı, formül, tür) | ◐ aidat planı (yalnız aidat) | Y7 |

### Hukuki, Tanımlar
Tamamı ✓ (2026-10-08 analizi §6). Banka entegrasyon tanımları ⏸.

### Pro (çok site, yönetim şirketi)
| Yönetimcell | Bizde | Not |
|---|---|---|
| Site ekle, siteler arası geçiş | ✓ `/panel/portfoy` | |
| Sitelerin kasa / borç-alacak durumu | ◐ portföy (gecikmiş, tahsilat oranı) | Y10 |
| **Üye arama (tüm siteler)** | ✗ | Y10 |
| Siteleri toplu borçlandır, sitelere toplu SMS | — / ⏸ | site bazında yapılıyor; SMS ⏸ |
| Pro kullanıcı tanımları (şirket ekibi) | ◐ site bazında kullanıcılar | Y10 |

## 2. Yapılacaklar (sırayla)

- [x] **Y1 — Ayarlar:** makbuz ayarları (otomatik numara: önek + sıradaki no, geri çekilemez; makbuz alt notu toplu makbuz PDF'inde). IBAN paylaşımı zaten vardı.
- [x] **Y2 — Üye listeleri:** (`/panel/listeler`, sakin/daire süzgeçleri) sakin/daire listelerinde borç türü ve borç eşiği (alacaklı / borcu olmayan / ≥ tutar) süzgeçleri; ikamet edenler listesi; araç plaka listesi; TC kimlik listesi (yönetici, denetim kaydı); boş/dolu listesi (malik, kiracı, bakiye); detaylı üye listesi (sütun seçmeli CSV).
- [x] **Y3 — Toplu bildirim:** (`/panel/bildirim`) metin girerek, borç durumu bildir, maliklere kiracı borcu bildir, giriş bilgisi gönder, e-postayla hesap özeti / borç dökümü; parametreler (`{ad}` `{daire}` `{borc}` `{link}`), kapsam süzgeci, önizleme; kanal: uygulama içi + e-posta (SMS/WhatsApp seçeneği ayar yapılınca açılır).
- [x] **Y4 — Ödenecekler:** (`/panel/giderler/odenecekler`, `/panel/giderler/tekrarlayan`, iş `expenses.recurring`) borç listesi (gider/firma/personel, bekleyen/ödenmiş); tekrarlayan (ileri tarihli) faturalar — her ay kendiliğinden ödenecek gider kaydı açan tanım + iş.
- [x] **Y5 — Kasa:** (`/panel/kasa/talimat`, kasa → dönem kilidi; tetikleyici `app_guard_period_lock`) banka EFT/havale talimatı (firma/personel seç, IBAN, tutar → talimat listesi PDF); dönem kilidi (seçilen tarih ve öncesindeki finans hareketleri değiştirilemez).
- [x] **Y6 — Raporlar:** (`/panel/raporlar/{tahsilat,gider,kasa-gunluk,aylik,borclandirma,muhasebe-kodlari,uye-notlari}`, her biri PDF) tahsilat raporu; detaylı gider + gider grubu raporu; günlük / aylık / aylık özet bilanço; borçlandırma durum ve detay raporu; muhasebe kodları listesi; üyelere kaydedilen notlar raporu.
- [x] **Y7 — Borçlandırma:** (`/panel/borclar/toplu` düzenlenebilir önizleme + bitiş dönemi, `/panel/sayaclar/firma-dosyasi`) önizlemede satır bazında tutar düzeltme ve borçlu seçimi; ileri tarihli borçlandırma (her tür, dönem aralığı); sayaç okumasında okuma bedeli; okuma firması dosyasıyla borçlandırma.
- [x] **Y8 — Isı pay ölçerli dağıtım:** (`/panel/sayaclar/isi-paylasim`; okumalar sayaç okuma girişinden) doğalgaz faturası → ortak (%30) / tüketim (%70) payı, pay ölçer endeksleri, hizmet bedeli, okunamayan dairede emsal ceza; yakıt+su ve yaz dönemi su çeşitleri.
- [ ] **Y9 — Veri araçları:** giderleri Excel'den yükle; cari (kişi) birleştir; veri tutarlılık kontrolü (borçlusuz borç, maliksiz daire, hissesi %100 etmeyen daire…).
- [ ] **Y10 — Çok site:** tüm sitelerde üye arama; portföyde site başı kasa ve alacak/borç özeti.

Her madde: API + ekran + birim/entegrasyon testi + Playwright UI testi (360 px dahil) + canlı kontrol.

## 3. Beklemede — entegrasyonlar (maliyetsizden maliyetliye; şimdilik aksiyon yok)

`/panel/ayarlar` entegrasyon kartı bu sırayla planlanacak:

1. **E-posta (SMTP)** — ücretsiz, altyapı var (noreply@tasci.cloud). Toplu bildirim (Y3) bunu kullanır.
2. **Uygulama içi + web push bildirimi** — ücretsiz.
3. **WhatsApp** — telefonla bağlantı ya da Cloud API (mesaj başı ücret, Meta onayı).
4. **SMS sağlayıcı** — mesaj başı ücret, başlık (originator) onayı.
5. **Sanal POS / online tahsilat** — işlem başı komisyon, sağlayıcı sözleşmesi.
6. **Sayaç okuma firması API'si** — firma bazında anlaşma.
7. **Açık bankacılık (banka hareketleri, talimat)** — 3. parti sağlayıcıyla sözleşme; en maliyetli.
