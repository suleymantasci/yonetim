# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Apartman ve Site Yöneticileri:** Bütçe yapan, aidat tahakkuk ettiren, arıza ve bakım işlerini organize eden asıl operasyonel kullanıcılar.
- **Bina / Tesis Yönetim Şirketleri:** Birden fazla siteyi tek bir ekrandan konsolide yöneten profesyonel ekipler.
- **Sakinler (Kat Malikleri ve Kiracılar):** Borcunu öğrenmek, aidatını kredi kartıyla ödemek, arıza bildirmek ve duyuruları takip etmek isteyen konut sakinleri.
- **Denetçiler:** Mali tabloları, mizanı, gelir-gider faturalarını ve karar defterini salt-okunur denetleyen kurullar.

## Product Purpose

Apartman ve toplu konut yönetimini Excel tablolarından ve karmaşık eski tip muhasebe programlarından kurtarmak. 634 sayılı Kat Mülkiyeti Kanunu'na tam uyumlu, tahsilat oranını artıran, sakinleri mesai saati beklemeden WhatsApp üzerinden bilgilendirip ödeme aldıran modern bir işletim sistemi sunmak.

## Positioning

- **Excel'de değil, telefonda:** Karmaşık muhasebe jargonu yerine sade, sezgisel ve hızlı arayüz.
- **Uygulama indirme zorunluluğu yok:** Sakinler hiçbir uygulama yüklemeden doğrudan WhatsApp üzerinden tek mesajla ("borç", "ödeme") bakiyesini görüp 3D Secure ile ödeyebilir.
- **Gizli maliyet ve özellik kısıtı yok:** Tüm paketlerde 8 modülün tamamı açık; fiyatlandırma sadece daire sayısına göre şeffaf olarak belirlenir.
- **15 dakikada sıfır veri kaybıyla geçiş:** Eski programlardan (Apsiyon vb.) ve Excel'den anında ücretsiz veri aktarımı.

## Operating Context

- **Mevzuat & Hukuk:** 634 sayılı Kat Mülkiyeti Kanunu (KMK Madde 20 yasal gecikme tazminatı %5), KVKK uyumu ve denetim kütükleri.
- **Finansal Entegrasyon:** TCMB lisanslı sanal POS (iyzico, PayTR, 3D Secure), otomatik dekont ve banka mutabakatı.
- **İletişim Kanalları:** WhatsApp Cloud API, SMS operatör entegrasyonu (Netgsm, İleti Merkezi) ve e-posta.
- **Çok Kiracılı Güvenlik:** PostgreSQL Row-Level Security (RLS) ile tenant bazlı tam veri izolasyonu.

## Capabilities and Constraints

- 8 Temel Modül: Aidat ve Borç Takibi, Online Tahsilat, WhatsApp Sakin Botu, Gider ve Bütçe, Bakım Takvimi, Kat Malikleri Toplantısı, KVKK Denetim Kütüğü, İcra ve Hukuk Takibi.
- Para formatı: Türk Lirası (₺), binlik nokta, ondalık virgül (örn. 1.250,00 ₺).
- Çok dilli altyapı: Türkçe (varsayılan) ve İngilizce.

## Brand Commitments

- **İsim:** Yönetimcell / Site Yönetimi.
- **Ses ve Ton:** Ciddi, güven veren, mevzuata hakim, şeffaf, yapay zeka klişelerinden uzak ve zanaatkar.
- **Tasarım:** Linear ve Mercury estetiğinde; saç teli çizgiler, yüksek bilgi berraklığı, sakin renkler, amaca yönelik mikro-animasyonlar.

## Evidence on Hand

- Doğrulanabilir gerçek modüller ve kanıtlanmış fiyatlandırma yapısı.
- Gerçek 634 sayılı KMK yasal gecikme faiz formülleri.
- 167+ birim testi ve RLS izolasyon mimarisi.

## Product Principles

1. **Doğrulanabilir gerçeklik:** Sayfada asılsız "5000+ mutlu müşteri" gibi uydurma metrikler yerine kanıtlanabilir özellikler ve yasal dayanaklar öne çıkar.
2. **Sıfır sürtünme:** Sakin bir şey ödemek için şifre hatırlamak veya uygulama yüklemek zorunda kalmaz.
3. **Şeffaf maliyet:** Özellik sınırlaması veya "teklif alın" gizemi yoktur.
4. **Hızlı ve dokunsal:** Sayfa her etkileşimde kullanıcıya anında güven ve akıcılık hissettirir.
