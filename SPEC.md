# Site Yönetim SaaS Platformu — Teknik Şartname (SPEC)

> **Hedef:** Türkiye'nin en modern, en kolay kullanılan, en kapsamlı site/apartman yönetim SaaS ürününü sıfırdan inşa etmek. Piyasa liderleri Apsiyon (16.626 site, 1.17M konut, 2.36M kullanıcı — piyasanın tartışmasız en büyüğü), Biyos (20.323 site, 991.876 daire), Dijiyon, Yonetimcell'in tüm özelliklerini kapsayacak; **+ onlarda olmayan akıllı, fark yaratan özellikler** ekleyeceğiz.
>
> **İlk sürüm:** Sadece **web** (mobil uygulama canlı çıkıştan **sonra** ayrı bir fazda).
>
> **Geliştirme:** Tüm proje (tüm modüller) tamamlandıktan sonra canlıya çıkılır. Faz faz geliştirilir; her fazda çalışır demo + test edilmiş kabul kriterleri.
>
> **Mimari:** Multi-tenant SaaS, SSR, SEO+GEO optimized, modern stack.

---

## 0. İçindekiler

1. [Pazar Analizi & Rakip Karşılaştırma](#1-pazar-analizi--rakip-karşılaştırma)
2. [Ürün Vizyonu & Konumlandırma](#2-ürün-vizyonu--konumlandırma)
3. [Vurucu (Killer) Özellikler — Kimsede Olmayanlar](#3-vurucu-killer-özellikler--kimsede-olmayanlar)
4. [Mimari & Teknoloji Stack](#4-mimari--teknoloji-stack)
5. [Veritabanı Tasarımı (Multi-Tenant)](#5-veritabanı-tasarımı-multi-tenant)
6. [Özellik Kataloğu (Modüller)](#6-özellik-kataloğu-modüller)
7. [Servis Entegrasyonları](#7-servis-entegrasyonları)
8. [Bildirim Stratejisi (SMS / E-posta / WhatsApp)](#8-bildirim-stratejisi)
9. [AI Stratejisi (Maliyet Kontrollü)](#9-ai-stratejisi-maliyet-kontrollü)
10. [SEO + GEO (Generative Engine Optimization)](#10-seo--geo-generative-engine-optimization)
11. [UX / UI Prensipleri & Tasarım Sistemi](#11-ux--ui-prensipleri--tasarım-sistemi)
12. [Marka & Görsel Kimlik](#12-marka--görsel-kimlik) — yeni eklendi
13. [Multi-Tenant Mimarisi & İzolasyon](#13-multi-tenant-mimarisi--izolasyon)
14. [Güvenlik & KVKK & Uyum](#14-güvenlik--kvkk--uyum)
15. [Ödeme & Faturalama (B2B SaaS)](#15-ödeme--faturalama-b2b-saas)
16. [Kampanya & Promosyon Motoru](#16-kampanya--promosyon-motoru) — yeni eklendi
17. [Onboarding & Aktivasyon Akışı](#17-onboarding--aktivasyon-akışı)
18. [Yönetim Paneli (Super-Admin)](#18-yönetim-paneli-super-admin)
19. [Performans, Ölçeklenebilirlik & Gözlemlenebilirlik](#19-performans-ölçeklenebilirlik--gözlemlenebilirlik)
20. [Geliştirme Yol Haritası (Fazlara Bölünmüş)](#20-geliştirme-yol-haritası-fazlara-bölünmüş)
21. [Kabul Kriterleri (Definition of Done)](#21-kabul-kriterleri-definition-of-done)
22. [Veri Açıkları & Riskler](#22-veri-açıkları--riskler)
23. [Açık Sorular (Karar Verilmemiş)](#23-açık-sorular-karar-verilmemiş)

---

## 1. Pazar Analizi & Rakip Karşılaştırma

### 1.1 Rakip Haritası

| Rakip | Site Sayısı | Kullanıcı | Güçlü Yön | Zayıf Yön (bizim fırsatımız) |
|-------|-------------|-----------|-----------|------------------------------|
| **Apsiyon** | 16.626 site / 1.17M konut / 2.36M user | Piyasa lideri | Apsis ekonomik paket, Akbank kampanyası (24 ay ücretsiz), sertifikalı eğitim, AVM + sayaç okuma + telefon santral + güvenlik donanımı | KVKK şikayetleri (144), haksız hizmet bedeli kesintisi, eski banka entegrasyonu arızaları, geriye dönük borç yansıtma, kullanıcı arayüzü eski, mobil UX tutarsız |
| **Biyos** | 20.323 site / 991.876 daire | En çok sitede kullanılan | Sade UI, ücretsiz başlangıç planı, iOS+Android app, sık sık yenilenen UI | Küçük sitelerde güçlü, kurumsal/yönetim şirketlerinde zayıf, gelişmiş raporlama yok |
| **Dijiyon** | Orta ölçek | Banka entegrasyonu, elektrikli araç şarj istasyonu, icra takip modülü | Niş özellikler, avukatlık hizmeti | UI eski, daire bazlı borç yansıtmada şeffaflık sorunu, SEO zayıf |
| **Yonetimcell** | Binlerce site | Modüler girişim (denetçi + güvenlik + iş-takip ek modülleri), 15 paket fiyat yapısı, hediye SMS paketleri, kampanya motoru (yeni proje, tavsiye, geçiş, sayaç ortaklığı) | **Fiyatı en yüksek pazar** (5.899–88.899 ₺/yıl), UI/görsel eski, çok fazla manuel blok |

### 1.2 Şikayetvar Bulguları (Apsiyon — 144 şikayet, en çok ses getiren)

Bunlar **doğrudan bizim fark yaratan özellik listemize** girdi olacak:

| Şikayet Tekrarı | Kök Neden | Bizim Çözümümüz |
|-----------------|-----------|-----------------|
| **Haksız hizmet bedeli kesintisi** | Platform tarafı gizli komisyon | **Şeffaf komisyon göstergesi** — ödeme anında "X TL platform ücreti + Y TL banka komisyonu" ayrı gösterilecek |
| **Bildirim olmadan geriye dönük aidat zammı yansıtma** | Manuel müdahale, şeffaflık eksik | **Immutable aidat değişiklik timeline'ı** — her değişiklik tarih/saat/eski değer/yeni değer ile kayıt altında |
| **Banka entegrasyonu arızası (Şekerbank örneği: 1+ aydır tahsilatlar yansımıyor)** | Tek sağlayıcıya bağımlılık | **Çoklu banka aggregator** (Param+BKM+open banking), otomatik failover, retry queue, monitoring dashboard |
| **İptal edilen üyelik sonrası tekrar fatura çıkarılması** | State yönetimi hatası | **Strong consistency** — ödeme iptali tek transaction'da, audit log immutable |
| **Borç bilgisi 3+ gün gecikmesi** | Replay/polling | **Webhook-first mimari** — push-based, gerçek zamanlı mutabakat |
| **"Borcu yoktur" belgesi geç verilmesi → kredi başvurusu engelleniyor** | Manuel süreç | **Self-service "Borcu Yoktur" PDF** — sakin tek tıkla, e-imza ile, KEP ile muhtara/bankaya gönderilebilir |
| **KVKK ihlali (WhatsApp grubunda borç paylaşımı)** | Süreç bilinçsizliği | **KVKK uyumlu paylaşım** — topluluk duyuruları her daireye ayrı mesaj, "Bu Daire Borçlu" gibi ifadeler yasak, denetim logu |

### 1.3 Pazar Boşlukları (kimsenin doldurmadığı)

1. **AI-powered aidat tahminlemesi & bütçe planlama** — Geçmiş veriden yıllık artış tahmini, nakit akışı forecast'u.
2. **WhatsApp'tan doğal dil borç sorma** — Sakin "ne kadar borcum var" yazınca, AI olmadan pattern matching ile yanıt.
3. **Sakin deneyimi puanlaması (NPS)** — Otomatik toplanan memnuniyet skoru, yöneticiye dashboard.
4. **Komşu pazarı / ikinci el eşya / hizmet ilanları** (opsiyonel).
5. **Ortak alan rezervasyonu (salon, spor salonu, misafir odası, otopark)** — Apsiyon'da var ama modern UX yok.
6. **Bakım anımsatıcı (asansör, hidrofor, jeneratör yıllık bakım)** — Yasal zorunluluklar için takvim.
7. **Karbon ayak izi raporu** — Ortak alan elektrik/su tüketimi göstergesi.
8. **Çoklu dil** — TR (varsayılan), EN, AR, RU (TR'de 4M+ sığınmacı+mülteci nüfus, Arapça/Rusça konuşan aidat ödeyen var).

---

## 2. Ürün Vizyonu & Konumlandırma

### 2.1 Tek Cümle Vizyon
> **"Türkiye'nin ilk AI-augmented, WhatsApp-native, multi-tenant site yönetim platformu — apartman yöneticisinin telefonundan 1 dakikada kurulur, daire sakini WhatsApp'tan 'ne kadar borcum var' yazarak öğrenir."**

### 2.2 Konumlandırma (3 Katman)
| Segment | Persona | Birincil Değer Önerisi |
|---------|---------|------------------------|
| **Bireysel yönetici** (komşu yöneticisi, genelde yaşlı + teknik bilgisi az) | "Apartman yöneticisi Ali Bey" | "Telefondan 5 dakikada kur, Excel'den kurtul" — Kurulum sihirbazı, sıfır muhasebe bilgisi gerektiren UX |
| **Yönetim şirketi** (profesyonel, 10-500 site yönetir) | "ABC Yönetim Operasyon Müdürü" | "Bir ekrandan 200 site yönet, fatura kes, raporla" — Çoklu site konsol, ekip yetkilendirme, fatura modülü |
| **Site sakini** (30-70 yaş, çeşitli dijital okuryazarlık) | "Daire sakini Ayşe Hanım" | "Aidatımı WhatsApp'tan öğren ve öde" — Self-servis, sıfır telefon trafiği, KVKK güvencesi |

### 2.3 Fiyatlandırma Stratejisi — Yonetimcell Fiyatlarının Yarısı + 1 Ay Ücretsiz

**Yonetimcell fiyatları (kaynak: yonetimcell.com/aidat-ve-gider-takip-programi-fiyatlari.html):**

| Paket | Bağımsız Bölüm | SMS/Yıl | YC Fiyatı (Yıllık) | **Bizim Fiyatımız (Yıllık)** |
|-------|----------------|---------|---------------------|------------------------------|
| 1 | 5–15 | 90 | 5.899 ₺ | **2.950 ₺** |
| 2 | 16–30 | 150 | 9.499 ₺ | **4.750 ₺** |
| 3 | 31–50 | 225 | 12.499 ₺ | **6.250 ₺** |
| 4 | 51–100 | 500 | 16.499 ₺ | **8.250 ₺** |
| 5 | 101–150 | 750 | 21.899 ₺ | **10.950 ₺** |
| 6 | 151–200 | 1.000 | 27.899 ₺ | **13.950 ₺** |
| 7 | 201–300 | 1.500 | 39.899 ₺ | **19.950 ₺** |
| 8 | 301–400 | 2.000 | 48.899 ₺ | **24.450 ₺** |
| 9 | 401–500 | 2.500 | 55.899 ₺ | **27.950 ₺** |
| 10 | 501–600 | 3.000 | 63.899 ₺ | **31.950 ₺** |
| 11 | 601–700 | 3.500 | 69.899 ₺ | **34.950 ₺** |
| 12 | 701–800 | 4.000 | 77.899 ₺ | **38.950 ₺** |
| 13 | 801–900 | 7.500 | 81.899 ₺ | **40.950 ₺** |
| 14 | 901–1000 | 8.000 | 84.899 ₺ | **42.450 ₺** |
| 15 | 1001+ | 10.000 | 88.899 ₺ | **44.450 ₺** |

**Yapısal kararlar:**
- **Anlaşma modeli:** Yıllık (Yonetimcell gibi — 1 yıl/6 ay/3 ay/1 ay seçenekleriyle ödeme).
- **Aylık eşdeğeri:** Yıllık fiyatı 12'ye bölerek aylık bazda sun.
- **SMS:** Paket başına hediye SMS kota; kota aşımı **adet başı 0.30 ₺** (Yonetimcell'deki "Ön Ödemeli SMS" paketleri yerine).
- **Domain:** Net (yıl sonu yenilemede aynı fiyat **yok** — TÜFE bazlı artış max +%30).
- **Yenileme:** Lisans süresi bitince 30 gün ek süre; sonra askı.
- **İade:** 14 gün koşulsuz iade (yasal).

**Trial stratejisi:**
- **1 ay ücretsiz deneme** — yeni kayıt olan herkes (kart bilgisi **istenmez**).
- Deneme bitince: **otomatik askı** (veri silinmez, 6 ay bekletilir, sonra arşiv).
- Yeniden aktifleştirme: Güncel fiyat üzerinden yıllık kayıt.

**Karşılaştırmalı konumlandırma:**
- **Yonetimcell:** 5.899–88.899 ₺/yıl (bizim %100'ü).
- **Apsiyon:** Paket + Akbank kampanyası (24 ay ücretsiz, sonra pazarlık) → bileşke maliyet pazarlığa bağlı.
- **Biyos:** Ücretsiz başlangıç + Standart/Premium (fiyat sayfası şeffaf değil, pazarlık).
- **Biz:** Yarı yarıya fiyat + 1 ay ücretsiz = **en düşük TCO** + **en şeffaf fiyat**.

---

## 3. Vurucu (Killer) Özellikler — Kimsede Olmayanlar

> Bu özellikler tek başına "neden siz?" sorusunu yanıtlar. Hepsi AI-sız veya AI-minimal olacak şekilde tasarlanır.

### 3.1 🏆 WhatsApp-First Sakin Deneyimi
**Problem:** 70 yaşındaki sakin mobil uygulama indirip kayıt olmuyor. WhatsApp'a herkes girdi.
**Çözüm:**
- Her site, WhatsApp Business API Cloud üzerinden **tek numara** ile çalışır.
- Sakin WhatsApp'tan numarayı kaydeder, **doğal dil komutları** pattern-match edilir (AI gerekmez):
  - `"borc"` → aidat borcu
  - `"odeme"` → ödeme linki (iyzico hosted payment page)
  - `"duyuru"` → son 5 duyuru
  - `"talep arıza"` → arıza kayıt formu (inline button)
  - `"kalan"` → kalan taksit
  - `"yönetici"` → yönetici iletişim
- **AI katkısı sıfır** — keyword/regex + conversation state machine.
- Sakin bir kere kaydolduktan sonra **push bildirim** olarak tüm site duyuruları, aidat hatırlatmaları, ödeme onayları otomatik.
- **KVKK uyumu:** Kişi WhatsApp'a "IPTAL" yazarsa verisi silinir + KVKK logu.

### 3.2 🏆 Komut Bazlı "Sakin Chat-Bot" (No-AI)
**Neden AI yok:** Pattern matching + slot filling %95 vakayı çözer. AI sadece **niyet tespitinden emin olamadığımızda** devreye girer (bkz. Bölüm 9).
- **Yapı:** State machine (telgraf-tarzı), her mesaj için niyet sınıflandırması → cevap şablonu.
- **Örnek:**
  - Gelen: "doğalgaz faturası 450 tl geldi ne yapayım"
  - Intent detection (AI-free): "fatura şikayet/talep" → form sunar
  - Sakin formu doldurur → yöneticiye iletir
- **AI olmadan başarı oranı hedefi:** %90+ niyet doğru tespit.
- **AI fallback:** Kalan %10 için minimum token kullanımı (kullanıcı başına ~50 token, ayda 5K mesaj = 250K token = ~$0.30).

### 3.3 🏆 Self-Service KVKK Denetim Kütüğü
**Problem:** Yöneticiler KVKK'dan korkuyor, hangi veri paylaşılabilir bilmiyor.
**Çözüm:**
- Her sakin için **veri erişim logu**: kim ne zaman hangi verisini gördü, paylaştı, sildi.
- **Otomatik silme politikası:** Site ile ilişki bittikten 6 ay sonra kişisel veri anonimleştirme.
- **Yönetici için "KVKK risk skoru"** (0-100): yüksek risk → uyarı + öneri.
- **"Veri talep et" akışı:** Sakin KVKK md.11 kapsamında talep ederse, **72 saat içinde** paket (PDF + JSON) üretilir.

### 3.4 🏆 Bütçe/Aidat Simülatörü (What-If Engine)
**Problem:** Yönetici "aidatı %20 artırırsam ne olur?" sorusunu Excel'de hesaplıyor.
**Çözüm:**
- Arayüz: aidat artış %, ek bütçe kalemleri, özel durumlar.
- Çıktı: 12 ay nakit akışı forecast'u, gecikme oranı tahmini, sakin başı aylık yük, geçmiş yıllarla karşılaştırma.
- **AI yok** — tüm hesaplar deterministik (Excel-formül mantığı).

### 3.5 🏆 Akıllı İcra-Asistan (Hukuki Süreç Takip)
**Problem:** Apsiyon'da var ama pasif. İcra süreci tek-tıkla başlatılamıyor, evrak eksik.
**Çözüm:**
- Borç 90+ gün geciktiğinde **avukat atama akışı**: sitede anlaşmalı avukat varsa tek tık, yoksa Türkiye Barolar Birliği entegrasyonu ile en yakın avukata yönlendirme.
- **İcra takip tablosu:** Aşama (ihtarname → dava → ilam → haciz → tahsilat), her aşama için belge yükleme, sonraki adım hatırlatma.
- **Tahsilat şansı skoru** (basit kural motoru): borçlu profili (kiracı mı malik mi, daha önce ödeme yaptı mı) → avukata yol gösterici.

### 3.6 🏆 "Borcu Yoktur" / "Borcu Vardır" Resmi Belge Motoru
**Problem:** Banka konut kredisi için belge ister, yönetici 3-5 günde gönderir, müşteri kredisini kaçırır.
**Çözüm:**
- Sakin self-servis talep eder → sistem otomatik kontrol → e-imza (KEP ile) veya ıslak imza çıktısı.
- **Aktif banka entegrasyonu varsa:** Banka API'den direkt talep → banka otomatik alır.
- **Ücretli opsiyonel:** 49 TL karşılığı KEP ile bankaya gönderim.

### 3.7 🏆 Bakım Takvimi + Yasal Zorunluluk Asistanı
**Problem:** Asansör yıllık muayene, yangın söndürücü dolum, baca temizliği gibi 15+ periyodik bakım takibi Excel'de unutuluyor, ceza geliyor.
**Çözüm:**
- 50+ bakım tipi kütüphanesi (asansör, hidrofor, jeneratör, yangın, elektrik pano, havalandırma, ortak alan haşere ilaçlama vb.).
- Otomatik hatırlatma (T-30, T-15, T-7, T-0, T+3 gün) → yönetici + sakin (whatsapp).
- **Belge yükleme**: her bakım sonrası fatura + muayene raporu, sonraki tarih otomatik.

### 3.8 🏆 Sakin Deneyim Puanı (NPS Otomasyonu)
- Her ay 1 rastgele sakin'e kısa anket (WhatsApp veya e-posta, 3 soru).
- Yılda 12 anket/sakin, 100 daireli sitede 1200 veri noktası/yıl.
- Yönetici dashboard: NPS trend, "şikayet temaları" (text clustering — AI sadece burada, ayda 1 kez çalışır, ~$0.05/site/ay).

### 3.9 🏆 Site Landing Page Builder (Programmatic SEO)
- Her site otomatik olarak `NEXT_PUBLIC_BASE_URL/[site-slug]` adresinde public landing page alır.
- Site adı, adresi, fotoğraf, yönetici iletişim, **"Bu siteyi nasıl değerlendirirsiniz?"** gibi community section.
- **SEO yemi:** "İstanbul Kadıköy X Apartmanı yönetimi" gibi long-tail keyword'ler → organic trafik.

### 3.10 🏆 Çoklu Banka Failover & Mutabakat
- Apsiyon Şekerbank 1 ay boyunca aidat yansıtmamış → kullanıcı kaybı.
- **Biz:** En az 3 aggregator (Param + BKM Express + iyzico) ile aynı bankaya bağlanma, biri düşerse diğeri aktif.
- **Reconciliation queue:** Tüm ödemeler webhook + günlük polling karşılaştırması, mismatch → alert + auto-retry.

### 3.11 🏆 Self-Servis Veri Migration (Apsiyon/Biyos'tan Geçiş)
- Apsin/Biyos/Yonetimcell/Dijiyon export → otomatik import wizard.
- Excel/CSV import tüm major rakipler için template.
- **Yonetimcell kampanyası benzeri "Sözleşmeniz Bitene Kadar Ücretler Bizden"** — geçiş kampanyası (bkz. Bölüm 16).

---

## 4. Mimari & Teknoloji Stack

### 4.1 Mimari Genel Bakış

```
┌─────────────────────────────────────────────────────────────────┐
│                      Edge / CDN / Firewall                       │
│  Cloudflare (WAF + DDoS + Rate Limit + Bot Mgmt + R2 cache)     │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
        ▼                    ▼                     ▼
┌──────────────┐   ┌─────────────────┐   ┌────────────────┐
│  Marketing   │   │   App (SSR)     │   │   API Routes   │
│  Site (SSG)  │   │   Next.js 15    │   │   Next.js      │
│  Next.js 15  │   │   React 19      │   │   /api/v1/*    │
│              │   │   App Router    │   │   (BFF pattern)│
└──────────────┘   └─────────────────┘   └────────────────┘
                             │
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
        ▼                    ▼                     ▼
┌──────────────┐   ┌─────────────────┐   ┌────────────────┐
│  Auth        │   │   PostgreSQL    │   │   Redis        │
│  Better Auth │   │   + RLS         │   │   (sessions,   │
│  + RBAC      │   │   (multi-tenant)│   │    rate limit, │
│              │   │   + Prisma/Dz.  │   │    queue)      │
└──────────────┘   └─────────────────┘   └────────────────┘
                             │
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
        ▼                    ▼                     ▼
┌──────────────┐   ┌─────────────────┐   ┌────────────────┐
│  Workers     │   │  Object Storage │   │   Observability│
│  Trigger.dev │   │  Cloudflare R2  │   │   Sentry +     │
│  + Inngest   │   │  (PDF, fatura,  │   │   OpenTelemetry│
│  (jobs,      │   │   upload)       │   │   + Grafana    │
│   cron)      │   │                 │   │                │
└──────────────┘   └─────────────────┘   └────────────────┘
                             │
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
        ▼                    ▼                     ▼
┌──────────────┐   ┌─────────────────┐   ┌────────────────┐
│  WhatsApp    │   │   SMS           │   │   Ödeme        │
│  Meta Cloud  │   │   Netgsm        │   │   iyzico       │
│  + State     │   │   İleti Merkezi │   │   PayTR        │
│  Machine     │   │   Twilio        │   │   Param POS    │
└──────────────┘   └─────────────────┘   └────────────────┘
```

### 4.2 Stack Seçimi (Detaylı, Gerekçeli)

| Katman | Teknoloji | Gerekçe |
|--------|-----------|---------|
| **Framework** | **Next.js 15 (App Router) + React 19 + TypeScript strict** | SSR + RSC + Server Actions, Vercel uyumlu, pazar standardı, SEO için ideal |
| **UI Library** | **Tailwind CSS 4 + shadcn/ui + Radix UI + Lucide** | Hızlı geliştirme, erişilebilir, modern, Claude iyi bilir |
| **State** | **Zustand (client) + TanStack Query (server cache) + Server Actions (mutations)** | Karmaşıklık düşük, tip güvenli |
| **Forms** | **React Hook Form + Zod** | Tip güvenli validasyon |
| **DB** | **PostgreSQL 17 (Neon serverless)** | RLS, JSONB, performans, çoklu kiracı uyumu |
| **ORM** | **Prisma 6 veya Drizzle ORM** | Drizzle tercih (daha lightweight, edge uyumlu). Seçim Claude'a bırakıldı |
| **Auth** | **Better Auth** (multi-tenant destekli) | Multi-tenant, OAuth, magic link, 2FA, SSO (kurumsal) |
| **Multi-tenant** | **PostgreSQL Row-Level Security (RLS)** + tenant_id her tabloda | Veri izolasyonu garantili, SQL seviyesinde |
| **Cache** | **Redis (Upstash)** | Sessions, rate limit, job queue |
| **Job Queue** | **Trigger.dev v3** veya **Inngest** | Periyodik işler (aidat hatırlatma, banka mutabakatı, yıllık bakım hatırlatıcı) |
| **Object Storage** | **Cloudflare R2** | S3 uyumlu, ucuz, KVKK uyumlu bölge (TR yok ama Frankfurt AB yeterli) |
| **Email** | **Resend** + React Email templates | Geliştirici dostu, deliverability iyi |
| **SMS** | **Netgsm** (TR yerli, ucuz, stabil) | Alternatif: İleti Merkezi, Vatansms, Twilio |
| **WhatsApp** | **Meta WhatsApp Business Platform (Cloud API)** | Resmi, ücretsiz service window, utility template'leri |
| **Ödeme (B2C — sakinden)** | **iyzico** Checkout Form (hosted) + PayTR (yedek) + Param (POS) | PCI-DSS yükü bize geçmez, taksit desteği |
| **Ödeme (B2B — platformdan bize)** | **iyzico** (TR kart) veya **Stripe** (global) | SaaS abonelik tahsilatı |
| **E-Fatura** | **Foriba / Logo İşbaşı / BizimHesap** | Yasal zorunluluk |
| **E-İmza / KEP** | **Türkiye'nin KEP sağlayıcıları** (KEP.tr, Keppy, Turknet KEP) | "Borcu yoktur" belgesi yasal teslim |
| **Monitoring** | **Sentry** (errors) + **OpenTelemetry** + **Grafana Cloud** | APM, log, metrik |
| **Deployment** | **Vercel** (önyüz + API) + **Neon** (DB) + **Upstash** (Redis) + **Trigger.dev Cloud** | Hızlı başlangıç, düşük operasyon |
| **Alternatif deployment** | **Self-hosted (Hetzner + Docker)** | Maliyet düşürme, KVKK uyumu (veri TR'de) |
| **CMS / Blog** | **MDX in repo** (basit, SEO) | Geliştirici dostu, sürüm kontrolü |
| **Search** | **Postgres FTS** (başlangıç) → **Meilisearch** (ölçek) | Daire, sakin, fatura araması |
| **Anti-bot** | **Cloudflare Turnstile** | Ücretsiz, KVKK-uyumlu |
| **i18n** | **next-intl** | TR (varsayılan), EN, AR, RU, DE |

### 4.3 Proje Yapısı (Monorepo)

```
site-yonetim/
├── apps/
│   ├── web/                  # Marketing site (SSG) — BASE_URL
│   ├── app/                  # Ana ürün (SSR) — app.BASE_URL
│   └── docs/                 # Yardım & API docs
├── packages/
│   ├── db/                   # Prisma/Drizzle schema + migrations
│   ├── auth/                 # Better Auth config
│   ├── ui/                   # shadcn/ui component library
│   ├── emails/               # React Email templates
│   ├── whatsapp/             # WhatsApp Cloud API client + state machine
│   ├── sms/                  # Netgsm + İletimerkezi adapter
│   ├── payment/              # iyzico + PayTR adapter
│   ├── bank/                 # Open Banking / BKM aggregator
│   ├── campaigns/            # Kampanya & promosyon motoru (Bölüm 16)
│   ├── kvkk/                 # Veri silme, talep motoru
│   ├── analytics/            # PostHog + custom events
│   ├── jobs/                 # Trigger.dev job definitions
│   ├── seo/                  # SEO helpers, schema.org generators
│   ├── pricing/              # Fiyatlandırma paket motoru (Bölüm 2.3)
│   ├── i18n/                 # next-intl messages
│   └── config/               # Site config (aşağıda)
├── infra/
│   ├── terraform/            # Hetzner + Cloudflare
│   ├── docker/               # Self-host için
│   └── ci/                   # GitHub Actions
└── turbo.json / pnpm-workspace.yaml
```

**Paket yöneticisi:** pnpm (daha hızlı, monorepo standardı)

### 4.4 Merkezi Konfigürasyon (Domain ve Marka Bilinmiyor)

> **Karar:** Domain ve marka adı henüz netleşmediği için **tüm konfigürasyon tek bir dosyada** toplanmalı, sonradan tek satırla değiştirilebilmeli.

**`packages/config/src/site.ts`** — tek dosya, her yerden import:

```ts
// packages/config/src/site.ts
// Tüm değerler buradan okunur. Domain/marka/renk adı netleşince TEK DOSYA DEĞİŞİR.
export const siteConfig = {
  // === KİMLİK (değişecek) ===
  brand: {
    name: "Yönetimcell",          // [DEĞİŞECEK] Marka adı
    shortName: "Yönetimcell",     // [DEĞİŞECEK] Kısa ad
    tagline: "Site Yönetiminin Dijital Adresi",  // [DEĞİŞECEK]
    legalName: "Yönetimcell Yazılım A.Ş.",       // [DEĞİŞECEK] Kuruluş sonrası
    logo: {
      light: "/logo-light.svg",   // [DEĞİŞECEK]
      dark: "/logo-dark.svg",     // [DEĞİŞECEK]
      favicon: "/favicon.ico",    // [DEĞİŞECEK]
    },
    contact: {
      email: "destek@yonetimcell.com.tr",   // [DEĞİŞECEK]
      phone: "+90 282 606 01 90",           // [DEĞİŞECEK]
      address: "Çorlu, Tekirdağ",           // [DEĞİŞECEK]
    },
  },

  // === DOMAIN ===
  domains: {
    base: "yonetimcell.com.tr",          // [DEĞİŞECEK] Ana domain
    app: "app.yonetimcell.com.tr",       // [DEĞİŞECEK] App subdomain
    admin: "admin.yonetimcell.com.tr",   // [DEĞİŞECEK] Super admin
    api: "api.yonetimcell.com.tr",       // [DEĞİŞECEK] API
    cdn: "cdn.yonetimcell.com.tr",       // [DEĞİŞECEK] Static asset
    mail: "mail.yonetimcell.com.tr",     // [DEĞİŞECEK] E-posta
    wildcard: "*.yonetimcell.com.tr",    // [DEĞİŞECEK] Tenant subdomain
  },

  // === LİSTEYİ AL (Cloudflare, Vercel, vb. env'de de override edilebilir) ===
  env: {
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "https://yonetimcell.com.tr",
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://app.yonetimcell.com.tr",
  },

  // === GÖRSEL KİMLİK (Bölüm 12) ===
  design: {
    // varsayılan: lacivert + turkuaz (güven + teknoloji)
    colors: {
      primary: "#0F4C81",       // [DEĞİŞEBİLİR] Kurumsal lacivert
      secondary: "#06B6D4",     // [DEĞİŞEBİLİR] Turkuaz
      accent: "#F59E0B",        // [DEĞİŞEBİLİR] Amber
      success: "#10B981",
      warning: "#F59E0B",
      danger: "#EF4444",
      background: "#FFFFFF",
      foreground: "#0F172A",
    },
    fonts: {
      heading: "Plus Jakarta Sans",   // [SEÇİLECEK] Bölüm 12
      body: "Inter",                 // [SEÇİLECEK] Bölüm 12
      mono: "JetBrains Mono",        // [SEÇİLECEK] Bölüm 12
    },
  },

  // === İŞ KURALLARI (Bölüm 2.3 + 16) ===
  billing: {
    trial: {
      durationDays: 30,
      requiresCard: false,
    },
    currency: "TRY",
    defaultPeriod: "yearly",   // yıllık varsayılan
    refundPeriodDays: 14,
    smsOverageUnitCost: 0.30,  // ₺
    maxYearlyPriceIncreasePct: 30,
  },

  // === YASAL (Türkiye) ===
  legal: {
    country: "TR",
    timezone: "Europe/Istanbul",
    locale: "tr-TR",
    currency: "TRY",
    taxIdLength: 10,        // VKN
    ibanLength: 26,
    phoneCountryCode: "+90",
  },

  // === ÖZELLİK FLAG'LERİ (Bölüm 12 + 22) ===
  features: {
    whatsappBot: true,
    smsNotify: true,
    bankIntegration: true,
    campaignsEngine: true,
    kvkkAudit: true,
    icraModule: true,
    npsAutomation: true,
    aiFallback: false,         // AI sadece fallback
    multiLanguage: false,      // V2'de açılacak
  },
} as const;
```

**Kural:** Kodun hiçbir yerinde "yonetimcell.com" gibi hardcoded string olmamalı. Her zaman `siteConfig.domains.app` veya `siteConfig.env.baseUrl` kullanılır.

---

## 5. Veritabanı Tasarımı (Multi-Tenant)

### 5.1 Multi-Tenant Stratejisi
**Seçim:** **Shared DB + Row-Level Security** (Postgres RLS).
- **Neden?** Operasyonel maliyet düşük, kaynak kullanımı verimli, geliştirme hızı yüksek.
- **Trade-off:** RLS bug'ı = tüm tenant'lar açık. Çözüm: her query'de `tenant_id` filter'ı zorunlu, RLS policy'ler versiyonlanmış, audit log.

### 5.2 Tenant Modeli

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,        -- 'merkez-mahallesi' (subdomain)
  name VARCHAR(200) NOT NULL,
  type ENUM('apartment','site','residence','plaza','avm','office','vakif','dernek') NOT NULL,
  unit_count INT NOT NULL DEFAULT 0,
  manager_id UUID REFERENCES users(id),
  settings JSONB DEFAULT '{}',              -- tenant-specific config
  status ENUM('trial','active','past_due','suspended','archived','cancelled') DEFAULT 'trial',
  plan_id UUID REFERENCES plans(id),
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  suspension_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_period_end ON tenants(current_period_end);
```

### 5.3 Temel Tablolar (Özet)

| Tablo | Amaç | Kritik Alanlar |
|-------|------|----------------|
| `users` | Platform kullanıcıları (sakin + yönetici + admin) | `id`, `email`, `phone`, `role`, `tenant_id` (nullable, super admin için null) |
| `sessions` | Auth session'ları | `user_id`, `tenant_id`, `expires_at`, `device` |
| `units` | Daireler/dükkanlar/ofisler | `tenant_id`, `block_id`, `floor`, `number`, `type`, `area_m2`, `ownership_type` (malik/kiracı), `current_owner_id`, `current_tenant_id` |
| `unit_owners` | Malik-kiracı ilişkisi (zaman içinde değişebilir) | `unit_id`, `user_id`, `start_date`, `end_date`, `ownership_pct` |
| `blocks` | Bloklar | `tenant_id`, `name`, `floor_count`, `unit_count` |
| `dues` | Aidat tanımları (her dönem) | `tenant_id`, `period_year`, `period_month`, `base_amount`, `formula`, `due_date` |
| `debts` | Daireye ait borç kayıtları | `tenant_id`, `unit_id`, `dues_id`, `amount`, `due_date`, `status`, `late_fee_pct` |
| `payments` | Ödemeler (aidat, fatura, ek ödeme) | `tenant_id`, `debt_id`, `amount`, `method`, `processor`, `processor_ref`, `status`, `paid_at` |
| `expenses` | Giderler | `tenant_id`, `category`, `vendor`, `amount`, `date`, `attachment_url`, `paid_via` |
| `expense_categories` | Özelleştirilebilir | `tenant_id`, `name`, `parent_id`, `is_shared` (arsa payı mı, sayaç mı) |
| `meter_readings` | Sayaç okumaları (su, doğalgaz, elektrik) | `tenant_id`, `unit_id`, `meter_type`, `value`, `period`, `reading_date`, `photo_url` |
| `maintenance_records` | Bakım kayıtları | `tenant_id`, `equipment_type`, `last_done_at`, `next_due_at`, `vendor`, `document_url` |
| `maintenance_templates` | Bakım kütüphanesi (asansör, hidrofor vb.) | `equipment_type`, `interval_days`, `regulatory_ref`, `checklist_json` |
| `announcements` | Duyurular | `tenant_id`, `title`, `body`, `audience`, `channels`, `published_at` |
| `polls` | Anketler | `tenant_id`, `question`, `options_json`, `closes_at`, `visibility` |
| `poll_votes` | Anket oyları (anonim veya açık) | `poll_id`, `user_id`, `option_id` |
| `reservations` | Rezervasyonlar (salon, otopark) | `tenant_id`, `resource_id`, `user_id`, `start_at`, `end_at`, `fee`, `status` |
| `requests` | Arıza/talep/şikayet | `tenant_id`, `unit_id`, `category`, `priority`, `status`, `assigned_to`, `sla_due_at` |
| `request_comments` | Talep yorumları | `request_id`, `user_id`, `body`, `is_internal` |
| `documents` | Yüklenen belgeler (PDF, foto) | `tenant_id`, `category`, `owner_type`, `owner_id`, `url`, `expires_at` |
| `messages` | Mesajlaşma (uygulama içi + WhatsApp log) | `tenant_id`, `user_id`, `channel`, `direction`, `body`, `meta` |
| `audit_logs` | Her kritik aksiyonun logu | `tenant_id`, `user_id`, `action`, `resource`, `resource_id`, `diff_json`, `ip`, `user_agent` |
| `kvkk_requests` | KVKK talepleri | `tenant_id`, `user_id`, `type`, `status`, `due_at`, `fulfilled_at` |
| `subscriptions` | SaaS abonelik bilgisi | `tenant_id`, `plan_id`, `processor`, `processor_sub_id`, `status`, `current_period_end` |
| `invoices` | SaaS faturaları (bize ödenen) | `tenant_id`, `subscription_id`, `amount`, `period`, `status` |
| `notifications` | Gönderilen bildirim logu | `tenant_id`, `user_id`, `channel`, `template`, `status`, `sent_at`, `cost` |
| `integrations` | Tenant başına 3rd-party bağlantılar | `tenant_id`, `provider`, `credentials_encrypted`, `status` |
| `bank_accounts` | Site banka hesapları (open banking bağlı) | `tenant_id`, `bank`, `iban`, `provider_ref`, `last_synced_at` |
| `bank_transactions` | Banka hareketleri (eşleştirme için) | `tenant_id`, `account_id`, `amount`, `direction`, `counterparty`, `matched_payment_id` |
| `legal_cases` | İcra/dava takibi | `tenant_id`, `unit_id`, `debt_id`, `lawyer_id`, `stage`, `next_action_at` |
| `lawyers` | Anlaşmalı avukatlar | `tenant_id`, `name`, `bar_no`, `phone`, `email`, `commission_pct` |
| `vendors` | Anlaşmalı tedarikçiler | `tenant_id`, `category`, `name`, `phone`, `contract_url` |
| `staff` | Yönetici yanında çalışan personel | `tenant_id`, `user_id`, `role`, `salary`, `schedule` |
| `staff_attendance` | Personel giriş-çıkış | `staff_id`, `check_in_at`, `check_out_at`, `method`, `location` |
| `meetings` | Kat malikleri toplantısı | `tenant_id`, `date`, `agenda`, `attendees_json`, `minutes_url` |
| `meeting_decisions` | Alınan kararlar | `meeting_id`, `title`, `body`, `vote_count`, `passed` |
| `nps_responses` | Sakin memnuniyet anketleri | `tenant_id`, `user_id`, `score`, `comment`, `period` |
| `promo_codes` | Promosyon kodları (Bölüm 16) | `code`, `discount_type`, `discount_value`, `valid_from`, `valid_until`, `usage_limit`, `used_count` |
| `promo_code_redemptions` | Kod kullanım logu | `promo_code_id`, `tenant_id`, `redeemed_at` |
| `campaigns` | Kampanya tanımları (Bölüm 16) | `name`, `type`, `audience`, `status`, `config_json`, `starts_at`, `ends_at` |
| `audit_debt_changes` | Aidat değişiklik timeline (vurucu özellik) | `tenant_id`, `debt_id`, `old_amount`, `new_amount`, `changed_by`, `reason` |

### 5.4 RLS Policy Örneği

```sql
ALTER TABLE units ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON units
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Session değişkeni: SET LOCAL app.tenant_id = '<uuid>';
```

### 5.5 Partitioning (Ölçek)
- `audit_logs` → aylık partition (1 yıl+ hot, 2+ yıl cold R2'ye arşiv).
- `payments` → yıllık partition.
- `bank_transactions` → aylık.

### 5.6 Encryption
- **At-rest:** Postgres TDE + R2 SSE.
- **In-transit:** TLS 1.3 everywhere.
- **Field-level:** TCKN, IBAN, telefon → `pgcrypto` veya uygulama katmanı AES-256-GCM.
- **KVKK uyumu:** Şifreleme anahtarları tenant başına (KMS — Key Management Service) — KVKK md.12 teknik tedbir.

---

## 6. Özellik Kataloğu (Modüller)

> Her modül MVP + Gelişmiş olarak işaretlendi.

### 6.1 Modül: Kiracı/Aidat Yönetimi (Core)
**MVP:**
- Aidat tanımı (aylık, 3 aylık, 6 aylık, yıllık, özel dönem).
- Borçlandırma formülleri: **eşit**, **arsa payı**, **sayaç endeksi**, **karma** (örn. %50 eşit + %50 arsa payı).
- Otomatik aylık borç üretimi (cron job, her ayın 1'i 03:00).
- Gecikme tazminatı otomatik (TCMB reeskont + %5 — yasal oran).
- Tahsilat yöntemleri: **kredi kartı** (taksitli), **banka havalesi/EFT**, **otomatik ödeme talimatı**, **nakit** (manuel).
- **Borç paylaşımı:** Kiracı ayrılırsa kalan borç yeni kiracıya veya malike geçer, tutar ayarlanabilir.
- **Toplu borç yansıtma:** Excel import + validasyon.
- **Beyaz etiket makbuz:** her ödemede otomatik PDF makbuz (e-imza opsiyonel).
- **Audit timeline** (Bölüm 3) — aidat değişiklikleri her daire sakini için görünür.

**Gelişmiş:**
- Dinamik fiyatlandırma (kademeli aidat).
- İndirim/kampanya motoru (erken ödeme indirimi %3, yıllık peşin %10).
- **Bütçe simülatörü** (Bölüm 3.4).

### 6.2 Modül: Finansal Yönetim & Muhasebe
**MVP:**
- Gelir/gider defteri (tahsilat + ödemeler → tek hesap).
- Banka entegrasyonu (bkz. 7.5) — hareketler otomatik, mutabakat.
- **E-Fatura / e-Arşiv:** Entegratör üzerinden gider faturaları otomatik işlenir.
- KDV hesaplama (giderlerde KDV ayrıştırma).
- Kategori bazlı raporlar (aylık, yıllık, daire bazlı).
- Bütçe vs gerçekleşen karşılaştırma.
- **Yönetici hesap ekstresi** — yöneticinin site adına açtığı IBAN üzerinden tüm hareket.
- Stopaj hesaplama (personel maaşı varsa).

**Gelişmiş:**
- Çift taraflı muhasebe (tam muhasebe defteri).
- Birden fazla banka hesabı yönetimi (aidat, avans, personel maaş ayrı hesaplar).
- Avans yönetimi.
- Beyanname hazırlama yardımcısı (KDV, muhtasar — gerçek muhasebeci onayı şart).

### 6.3 Modül: Bakım & Arıza Yönetimi
**MVP:**
- Arıza kayıt formu (sakin veya yönetici, kategori, fotoğraf, öncelik).
- Kategoriler: asansör, su tesisatı, elektrik, doğalgaz, ortak alan, güvenlik, temizlik, çatı, dış cephe, peyzaj, haşere.
- SLA tanımı (kritik: 4 saat, yüksek: 24 saat, normal: 3 gün).
- Atama (yönetici / personel / dış firma).
- Yorum thread + foto ekleme.
- **SLA ihlal alarmı** + yönetici push.

**Gelişmiş:**
- **Periyodik bakım takvimi** (Bölüm 3.7) — 50+ şablon.
- Tedarikçi puanlama (yapılan iş, süre, maliyet, memnuniyet).
- **Otomatik teklif talebi:** bakım eşiği aşıldığında 3 firmadan fiyat al.
- Kontrat/bitiş hatırlatıcı.

### 6.4 Modül: İletişim & Duyuru
**MVP:**
- Duyuru oluşturma (başlık, içerik, ek dosya, hedef kitle — tüm sakinler / tek blok / tek daire).
- Çoklu kanal gönderim: WhatsApp + SMS + e-posta + uygulama içi push.
- Acil durum override (Türkçe: "KOMBİ PATLADI" → tüm kanallar + sesli arama opsiyonel).
- **KVKK uyumlu:** "X dairesi borçlu" gibi ifadeler yasak → otomatik filtre.
- Okundu/teslim raporu.
- Toplu SMS şablonu (ay başı hatırlatma, gecikme uyarısı).

**Gelişmiş:**
- **Hedefli duyuru:** Kiracılara ayrı, maliklere ayrı, yeni taşınanlara ayrı.
- Duyuru zamanlama (T-7, T-0, T+1 otomatik gönderim).
- A/B test (aynı duyuru 2 farklı mesajla, açılma oranı karşılaştırma).

### 6.5 Modül: Anket & Oy Sistemi
**MVP:**
- Anket oluşturma (tek soru, çoklu şık, açık uçlu, gizli/açık oy).
- Oy oranı: **arsa payı** veya **eşit** (yönetici seçimi — KMK'ya uygun).
- **Kat Mülkiyeti Kanunu md. 31, 32** karar yeter sayısı kontrolü (salt çoğunluk, 2/3, oybirliği).
- Sonuç görselleştirme + PDF çıktı.
- Toplantı karar defteri (PDF).

**Gelişmiş:**
- E-İmza ile karar imzalama (masrafı sakinlere ait).
- Oy pusulası çıktısı.

### 6.6 Modül: Toplantı Yönetimi
**MVP:**
- Toplantı oluşturma (tarih, saat, yer, gündem).
- Katılım çağrısı (SMS/WhatsApp/e-posta, T-15, T-7, T-1).
- Gündem maddeleri + karar taslakları.
- Tutanak oluşturma (otomatik, gündem + alınan kararlar + oy oranları).
- **KMK md. 32** yeter sayısı kontrolü.
- Tutanak dağıtımı (imza karşılığı veya e-imza).

**Gelişmiş:**
- Video konferans entegrasyonu (Zoom/Google Meet linki).
- Toplantı sırasında canlı oylama.

### 6.7 Modül: Rezervasyon Sistemi
**MVP:**
- Kaynak tanımı (salon, spor salonu, misafir odası, otopark, hamam, sauna, toplantı odası).
- Rezervasyon takvimi (haftalık görünüm).
- Rezervasyon ücreti + otomatik borç yansıtma veya online ödeme.
- Çakışma kontrolü + onay mekanizması.
- İptal/erteleme politikası.

**Gelişmiş:**
- Çoklu dilde kullanım kılavuzu.
- Hasar depozitosu yönetimi.
- Temizlik takvimi.

### 6.8 Modül: Personel Yönetimi
**MVP:**
- Personel CRUD (kapıcı, güvenlik, temizlik, bahçıvan).
- Maaş + SGK primi hesaplama (asgari ücret güncel parametreleri).
- İzin/yıllık takibi.
- Avans takibi.
- **Personel giriş-çıkış** (mobil konum + parmak izi opsiyonel).
- Vardiya planlaması.
- Kıdem/ihbar hesabı.

**Gelişmiş:**
- Bordro oluşturma + bankaya toplu transfer.
- e-Bildirge entegrasyonu (SGK).

### 6.9 Modül: Sayaç & Fatura Yönetimi
**MVP:**
- Sayaç tanımı (su, doğalgaz, elektrik, kalorimetre).
- Aylık okuma girişi (manuel veya fotoğraf → OCR — sonradan).
- Tüketim hesabı (önceki-şimdiki = tüketim × birim fiyat).
- Paylaşım formülü (eşit, alan, kişi sayısı).
- Fatura yükleme (PDF → OCR ile otomatik).
- **GİB e-Fatura kontrolü**.

**Gelişmiş:**
- Akıllı sayaç IoT.
- Tüketim trend grafiği, anomalı uyarı.

### 6.10 Modül: Doküman Yönetimi
**MVP:**
- Kategorize dokümanlar (sözleşmeler, ruhsat, toplantı tutanakları, faturalar, bakım raporları, yönetim planı).
- Versiyonlama.
- Son kullanma tarihi hatırlatıcı.
- KVKK uyumlu erişim (yetki bazlı).
- Tam metin arama (Postgres FTS).

**Gelişmiş:**
- e-İmzalı doküman (KEP üzerinden alım/iletme).
- Toplu belge yükleme + OCR.

### 6.11 Modül: Mesajlaşma (İç + WhatsApp)
**MVP:**
- Uygulama içi birebir mesajlaşma (yönetici ↔ sakin).
- WhatsApp köprüsü (Bölüm 3.1) — yönetici web'den cevap yazar, sakine WhatsApp gider.
- Toplu mesaj (duyuru farkı: interaktif).
- Konuşma geçmişi.
- Medya (foto, sesli not, dosya).

**Gelişmiş:**
- AI destekli niyet tespiti (Bölüm 3.2 + 9).
- Sesli mesaj transkripsiyonu (Whisper — opsiyonel, pahalı).

### 6.12 Modül: Hukuk & İcra
**MVP:**
- İhtarname oluşturma (90+ gün gecikme → otomatik taslak, yönetici onayı + KEP gönderim).
- Avukat atama + komisyon takibi.
- İcra aşaması yönetimi (8 aşama).
- Hukuki metin kütüphanesi (100+ şablon).

**Gelişmiş:**
- **UYAP entegrasyonu** (yargı süreci takibi) — varsa açık API.
- Adli para cezası takibi.

### 6.13 Modül: Raporlama & Analitik
**MVP:**
- Standart raporlar: aylık tahsilat oranı, gecikme analizi, gider kalemleri, daire bazlı karşılaştırma.
- Custom dashboard (yönetici widget'ları).
- Excel/PDF export.
- Email ile otomatik rapor (ayın 5'i).

**Gelişmiş:**
- Karşılaştırmalı benchmark (anonim, benzer büyüklükteki siteler).
- Gecikme tahmini ML (basit regresyon — opsiyonel).

### 6.14 Modül: Site Landing Page (Programmatic SEO)
**MVP:**
- Her tenant için public sayfa: `siteConfig.env.baseUrl/[slug]`
- SEO meta (Open Graph, Twitter, JSON-LD `LocalBusiness` + `ApartmentComplex`).
- Google Maps embed.
- Site fotoğrafları (slider).
- Yönetici iletişim.
- **"Bu siteyi değerlendir" NPS widget'ı.**

**Gelişmiş:**
- Çoklu dil.
- Site haber bandı.
- QR kod.

### 6.15 Modül: Marketplace & Ek Gelir (Opsiyonel)
- Komşu pazarı.
- Anlaşmalı servis sağlayıcılar.
- Komşu etkinlikleri.

### 6.16 Modül: Yönetici Self-Onboarding
- Sihirbaz: site tipi, daire sayısı, mevcut yazılım varsa veri aktarımı.
- Mevcut sistemden import (Excel, Apsiyon export, Biyos export, Yonetimcell export).
- İlk aidat dönemi tanımı + test ödemeleri.
- Sakin davet akışı (SMS/WhatsApp ile toplu davet).

### 6.17 Modül: Kampanya & Promosyon Motoru (Bölüm 16)
Bkz. detaylı tasarım Bölüm 16.

---

## 7. Servis Entegrasyonları

### 7.1 Ödeme (B2C — Sakinden aidat tahsilatı)

| Sağlayıcı | Neden | Komisyon | Entegrasyon |
|-----------|-------|----------|-------------|
| **iyzico** | Türkiye'nin 1 numarası, taksit destekli | %3.49 + 0.35 TL (sakinden) | Hosted Checkout (PCI-DSS yükü onlarda) |
| **PayTR** | Alternatif, sanal POS | Değişken | Hosted iFrame |
| **Param POS** | Hızlı kurulum, mikro site uyumlu | Değişken | Hosted Form |

**Strateji:**
- **Başlangıç:** Sadece iyzico (tek entegrasyon, hızlı).
- **V2:** PayTR yedek (iyzico downtime → otomatik geçiş).
- **Webhooks:** Tüm ödemeler `payment.completed` event'i ile gerçek zamanlı işlenir (3 dakika içinde eşleştir).
- **3D Secure:** Tüm ödemelerde zorunlu (BKM yönergesi).

### 7.2 Banka Entegrasyonu (Open Banking)

| Sağlayıcı | Kapsam | Maliyet |
|-----------|--------|---------|
| **Param Open Banking** | 20+ banka | Aylık abonelik |
| **BKM Express** | Çoğu Türk bankası | Değişken |
| **iyzico Banka Entegrasyonu** | 12 banka | Komisyon bazlı |
| **Direkt banka API** | Büyük bankalar | Sözleşme |

**Strateji:** Multi-aggregator + Polling fallback.
- Primary: Param Open Banking (1 entegrasyon = 20+ banka).
- Backup: BKM Express.
- Manual: Webhook (banka direkt destekliyorsa).

### 7.3 SMS Sağlayıcıları

| Sağlayıcı | Fiyat (TR numara) | Özellik |
|-----------|-------------------|---------|
| **Netgsm** | ~0.20 TL/SMS | Türkçe karakter, unicode, OTP, toplu |
| **İleti Merkezi** | ~0.18 TL/SMS | Yüksek hacimde ucuz |
| **Vatansms** | ~0.25 TL/SMS | Kolay API |
| **Twilio** | $0.05/SMS | Global, ama TR pahalı |

**Strateji:**
- Primary: **Netgsm** (Türkçe karakter desteği, hızlı, OTP için ideal).
- Backup: İleti Merkezi (Netgsm down).
- Adapter pattern ile soyutlama → istediğimizde değiştiririz.
- **Maliyet:** Sağlayıcı başına SMS başı ~0.20 TL; kira aşımı `siteConfig.billing.smsOverageUnitCost` (0.30 ₺) üzerinden sakin/yöneticiye yansıtılır.

### 7.4 E-posta
- **Resend** + React Email templates.
- Domain: `mail.[siteConfig.domains.base]` (DKIM + SPF + DMARC).
- Kullanım: aidat makbuzları, raporlar, toplantı davetleri, hoşgeldin.
- Maliyet: 100K e-posta/ay = $20 (Resend Pro).

### 7.5 WhatsApp Business Platform (Meta Cloud API)

**Maliyet modeli:**
- **Marketing messages:** ~$0.085/msg (TR).
- **Utility messages:** ~$0.04/msg (TR).
- **Authentication messages:** ~$0.03/msg (TR).
- **Service messages:** **ÜCRETSİZ** (sakin yazdı, biz 24 saat içinde cevap).
- **User-initiated conversations:** İlk 1000/ay **ücretsiz**.

**Strateji:**
- Bot **user-initiated**: Sakinden mesaj gelir → 24 saat "service window" açılır → tüm cevaplar ücretsiz.
- Hatırlatma mesajları **utility template** ile (Meta onaylı şablon gerekli).
- Pazarlama/duyuru → **marketing template** (pahalı, dikkatli kullan).

### 7.6 E-Fatura / e-Arşiv
- **Logo İşbaşı** veya **Foriba** entegratör.
- Site adına gider faturaları otomatik işleme (OCR + GİB e-Fatura kontrol).
- Platform faturası (bize ödenen) → Stripe Invoice veya iyzico e-Fatura.

### 7.7 e-İmza / KEP
- **KEP (Kayıtlı Elektronik Posta):** Resmi yazışmalar için.
- **e-İmza:** Toplantı tutanağı, sözleşme, "Borcu yoktur" belgesi.
- Sağlayıcı: **E-Güven**, **Türktrust**, **KEP.tr**.
- Maliyet: KEP 200-500 TL/yıl/hesap; e-İmza 300-800 TL/yıl (fiziksel kart okuyucu dahil).

### 7.8 CRM / Destek (İç Kullanım — Platform Operasyonu)
- **Plain.com** veya **Crisp** — sakin şikayetleri için canlı chat + ticket sistemi.

### 7.9 Analytics
- **PostHog Cloud** (EU sunucu, ücretsiz 1M event/ay).

### 7.10 Hata İzleme
- **Sentry** (errors + performance).
- **Logflare** veya **Better Stack** (log toplama).

---

## 8. Bildirim Stratejisi

### 8.1 Kanal Seçimi (Akıllı Yönlendirme)

```
Bildirim gönderilecek mi?
├─ Sakin WhatsApp'a kayıtlı mı?
│   ├─ Evet → WhatsApp gönder (ücretsiz service window'daysa)
│   └─ Hayır → SMS gönder
├─ Bildirim tipi kritik mi?
│   ├─ Evet (acil: asansör arıza, su kesintisi, güvenlik)
│   │   → Tüm kanallar: WhatsApp + SMS + e-posta + uygulama push
│   └─ Hayır → Birincil kanal yeterli
└─ Gönderim saati uygun mu?
    ├─ 22:00-08:00 arası acil değilse → sabah 09:00'a zamanlanmış
    └─ Gün içi → anında
```

### 8.2 Bildirim Tipleri & Şablonları

| Tip | Tetikleyici | Kanal | Template Adı |
|-----|-------------|-------|--------------|
| **OTP** | Login, ödeme onayı | SMS | `otp_login` |
| **Hoşgeldin** | Yeni kullanıcı | SMS + WhatsApp | `hosgeldin` |
| **Aidat hatırlatma** | Ayın 25'i, vade 30 ise | WhatsApp (utility) | `aidat_hatirlatma` |
| **Gecikme uyarısı** | Vade + 7 gün | WhatsApp (utility) | `aidat_gecikme_uyari` |
| **Ödeme onayı** | Ödeme alındı | WhatsApp (utility) | `odeme_onay_makbuz` |
| **Toplantı daveti** | T-15, T-7, T-1 gün | WhatsApp (utility) | `toplanti_daveti` |
| **Bakım hatırlatma** | T-30, T-7, T-0 | WhatsApp (utility) | `bakim_hatirlatma` |
| **Genel duyuru** | Yönetici oluşturur | WhatsApp (utility) | `duyuru_genel` |
| **Acil durum** | Yönetici "ACİL" işaretlerse | Tüm kanallar + sesli | `acil_durum_override` |
| **Talep durumu** | Talep atandı / çözüldü | WhatsApp (service) | `talep_durum_degisiklik` |
| **Anket daveti** | Yönetici anket açtı | WhatsApp (utility) | `anket_daveti` |
| **KVKK talep onayı** | Talep alındı / tamamlandı | SMS | `kvkk_talep_onay` |
| **Borcu yoktur belgesi** | Sakin talep etti | E-posta (PDF) | `borcu_yoktur_belge` |
| **Kampanya hatırlatma** | Kampanya başladı / bitiyor | E-posta + WhatsApp | `kampanya_bildirim` |

### 8.3 Maliyet Optimizasyonu
- WhatsApp service window (ücretsiz) %80 trafik.
- Utility template pahalı ($0.04/msg), sadece gerekli durumlarda.
- Marketing template **yasaklama** (çok pahalı).
- SMS: Yalnızca WhatsApp'a kayıtlı olmayanlar + OTP + acil durum.
- Tahmini **maliyet/sakin/ay**: ~0.50 TL.

---

## 9. AI Stratejisi (Maliyet Kontrollü)

### 9.1 Temel İlke
> **AI sadece gerçekten gerekli olan yerde, minimum token, BYOK (Bring Your Own Key) opsiyonel.**

### 9.2 AI Kullanım Alanları (Öncelik Sırasıyla)

| Öncelik | Alan | AI Gerekli Mi? | Maliyet Tahmini |
|---------|------|----------------|-----------------|
| 1 | **WhatsApp niyet tespiti** | Opsiyonel — pattern matching %90 çözer. Kalan %10 için küçük model (Llama 3 8B veya Claude Haiku). | ~$0.001/mesaj |
| 2 | **Anket yorum kümeleme** | Ayda 1 kez toplu çalışır, çok ucuz. | ~$0.05/site/ay |
| 3 | **OCR (fatura, sayaç)** | Google Cloud Vision veya Tesseract (ücretsiz). Vision AI daha iyi ama pahalı. | $1.50/1000 görsel |
| 4 | **Aidat tahmini (ML, opsiyonel)** | Sonraki faz. Basit regresyon yeterli, AI gereksiz. | - |
| 5 | **Duyuru taslağı önerme** | Yönetici "yeni aidat zammı duyurusu yaz" → AI taslak (istenirse). | Claude Sonnet, $0.03/1000 token |
| 6 | **Müşteri destek chatbot** (sakinin genel soruları için) | Açık. Kullanıcı başına ~500 token. | ~$0.005/sohbet |
| 7 | **Yapılandırılmış veri çıkarma** (yüklenen sözleşmeden bilgi çıkarma) | Opsiyonel. | $0.02/sözleşme |

### 9.3 AI Kullanılmayan Yerler (Sert Kural)
- ❌ Aidat hesaplaması (deterministik).
- ❌ Borç eşleştirme (rule-based).
- ❌ Gecikme tazminatı (KMK formülü).
- ❌ KVKK filtreleme (regex/keyword).
- ❌ Rapor oluşturma (template + veri).
- ❌ Bildirim metni (şablon).
- ❌ Duyuru gönderim (zaten şablon).

### 9.4 BYOK Desteği (Opsiyonel)
- Kurumsal müşteri kendi API key'ini girerse, o key ile çalışır (cost sıfır bizim için).
- Default bizim key'imiz, aylık $50 bütçe (limit aşılırsa AI özellikleri kapanır).

### 9.5 Model Seçimi
- **Primary:** Claude Haiku (hız, maliyet, Türkçe kalitesi).
- **Fallback:** OpenAI GPT-4o-mini.
- **Local:** Gerekirse Ollama + Llama 3.1 8B (self-hosted, sıfır API maliyeti — yüksek CPU).

### 9.6 LLM Kullanım Örnekleri

**Örnek 1 — WhatsApp Niyet Tespiti (Fallback):**
```
Sistem promptu:
"Bu kullanıcı mesajını analiz et. Şu niyetlerden birini seç: 
aidat_sorgu, odeme_talebi, talep_ariza, duyuru_sorgu, 
yonetici_iletisim, kvkk_talebi, bilinmiyor.
Mesaj: 'doğalgaz faturası 450 tl geldi ne yapayım'
Niyet: talep_ariza (gerekçe: doğalgaz + fatura + şikayet tonu)"
```

**Örnek 2 — Duyuru Taslağı (İsteğe Bağlı):**
```
Sistem: "Sen deneyimli bir Türk site yöneticisin. Yönetici sana şunu söyledi:
'Yeni aidat zammı %20 olacak, lütfen duyuru yaz.'
Kısa, profesyonel, KVKK-uyumlu WhatsApp taslağı yaz (max 400 karakter)."
```

---

## 10. SEO + GEO (Generative Engine Optimization)

### 10.1 SEO Stratejisi

**SSR + ISR + Static Content:**
- Marketing sayfaları → **SSG** (Next.js `output: 'standalone'` + ISR).
- App sayfaları → **SSR** (kullanıcıya özel).
- Landing pages (her site) → **ISR** + cache (günde 1 yenileme).

**Programmatic SEO:**
- `/siteniz/[city]/[district]/[site-name]` — şehir/ilçe/site adı kombinasyonları.
- `/ozellik/[feature]` — her özellik için detay sayfası.
- `/blog/[category]/[slug]` — SEO blog (haftada 2 içerik).
- `/kararlastirma/[topic]` — "Apartman aidat zammı nasıl hesaplanır" gibi long-tail.

**Schema.org (JSON-LD):**
- `LocalBusiness` (her site landing page).
- `ApartmentComplex` (yeni tip).
- `FAQPage` (SSS — SERP zengin sonuç).
- `SoftwareApplication` (marketing).
- `Organization` (hakkımızda).
- `BreadcrumbList`.

**Teknik:**
- Core Web Vitals: **LCP < 2.5s, INP < 200ms, CLS < 0.1** (Vercel Analytics).
- `robots.txt` + `sitemap.xml` (Next.js `next-sitemap`).
- Hreflang (TR, EN, AR, RU, DE).

### 10.2 GEO (Generative Engine Optimization)

**Amaç:** ChatGPT, Claude, Perplexity, Gemini gibi LLM'ler sitenizi **kaynak** olarak göstersin.

**Taktikler:**
1. **Yapılandırılmış veri bolluğu:** schema.org markup her sayfada.
2. **`/llms.txt`** — sitenin LLM-okunabilir özeti.
3. **`/llms-full.txt`** — tüm içeriğin markdown versiyonu.
4. **Sık sorulan sorular** — LLM'lerin çekmeyi sevdiği yapı.
5. **Otorite göstergeleri:** "X sitede Y konutta kullanılıyor" gibi sosyal kanıt.
6. **Press release:** TechCrunch, Webrazzi, Startup Radar.
7. **GitHub'da açık kaynak araçlar** (örn: küçük bir CLI script — backlink + marka).
8. **YouTube**: 30 kısa video (nasıl yapılır) — LLM'ler YouTube transcript'i okuyabilir.
9. **Wikipedia girdisi** (notable, ürün hakkında — zor ama değerli).

### 10.3 Yerel SEO
- Google My Business (platform adına).
- Her site için Google Maps pin (landing page'de).
- Şikayetvar — şikayet yönetimi (asıl iş).

---

## 11. UX / UI Prensipleri & Tasarım Sistemi

### 11.1 Tasarım Felsefesi
> **"Modern ama kullanması kolay."**
- **Apsiyon eski ama öğretmiyor** (karmaşık).
- **Biyos sade ama sınırlı** (güçsüz hissettiriyor).
- **Biz: sade ama güçlü** (progressive disclosure — basit başla, ihtiyaç olursa derinleş).

### 11.2 Prensipler

| İlke | Açıklama |
|-------|----------|
| **Sıfır öğrenme** | Yeni yönetici ilk gün her şeyi yapabilmeli. |
| **3 tık kuralı** | Her işlem max 3 tık. |
| **Mobil öncelikli** | Yöneticiler telefondan çalışacak. |
| **KVKK-first** | Her paylaşım adımında uyarı. |
| **Empty state'ler eğitici** | Boş ekran = "ilk adımı nasıl atarsın" + görsel. |
| **Onay yerine geri alma** | Yanlışlıkla silinen daire 30 gün "çöp kutusu"nda. |
| **Yapılan iş görünür** | Her aksiyon sonrası "✓ X kaydedildi" + undo. |
| **Türkçe-first** | Tüm mikrokopiler Türkçe. |

### 11.3 Tasarım Sistemi

**shadcn/ui + Tailwind 4 + Radix.**
- **Renkler:** `siteConfig.design.colors` (varsayılan: lacivert + turkuaz + amber).
- **Tipografi:** `siteConfig.design.fonts` (Bölüm 12).
- **Spacing:** 4px grid.
- **Radius:** 8px (kart), 4px (input), 16px (modal).
- **Icon:** Lucide React (ücretsiz, MIT).
- **Dark mode:** Sistem tercihi + manuel toggle.

### 11.4 Layout Pattern
- Sol menü (sidebar) + üst bar (search + bildirim + profil).
- Sayfa başlığı (breadcrumb + actions) + içerik.
- Drawer (yan panel) — detay gösterimi.
- Modal — sadece onay + kısa form.

### 11.5 Erişilebilirlik (A11y)
- WCAG 2.1 AA hedef.
- Klavye navigasyonu.
- ARIA labels (Radix default).
- Renk kontrastı.
- 60+ yaş sakin düşünülerek font min 14px.

---

## 12. Marka & Görsel Kimlik

> **Durum:** Henüz marka/renk/font/logo belirlenmedi. Aşağıdaki alternatifler ücretsiz veya uygun maliyetli — kullanıcı tercihine göre seçim yapılacak.

### 12.1 Marka Adı (Domain Belirsiz)
**Geçici kullanım:** "Yönetimcell" (spesifikasyon ve kod yazımında). Domain netleşince `siteConfig.brand.name` global replace yapılacak.

**Aday kısaltma / öneri:** Marka adı kısa, akılda kalıcı, "yönetim" kelimesini çağrıştırmalı. Domain müsaitliği kontrol edilmeli (örn. `siteyonetim.app`, `yonset.app`, `apartool.app`, `komsu.app`).

### 12.2 Tipografi — Font Alternatifleri

#### A. ÜCRETSİZ (Google Fonts, OFL lisansı — maliyet 0)

| Font | Karakter | Kullanım | Türkçe |
|------|----------|----------|--------|
| **Inter** | Nötr, modern, endüstri standardı | Body + UI | ✅ İyi |
| **Plus Jakarta Sans** | Sıcak, geometrik, kurumsal-modern | Heading + Body | ✅ İyi |
| **Manrope** | Modern, sıcak, UI odaklı | Body + UI | ✅ İyi |
| **Figtree** | Enerjik, sıcak, friendly | Heading + Body | ✅ İyi |
| **General Sans** | Nötr, kurumsal, duygusuz | Body + UI | ✅ İyi |
| **Sora** | Geometric, futuristic | Heading | ✅ İyi |
| **Outfit** | Geometric, modern | Heading + Body | ✅ İyi |
| **DM Sans** | Low contrast, uzun metin | Body | ✅ İyi |
| **Lexend** | Okunabilirlik odaklı (dijital) | Body | ✅ İyi |
| **Be Vietnam Pro** | Latin + Asian geniş | UI | ✅ İyi |

#### B. LİSANSLI (ücretli — "ücretsiz tercih edilecekse alternatif sun ücretlerine göre tercih edeyim" kapsamında)

| Font | Fiyat (Web Lisansı) | Foundry | Karakter |
|------|---------------------|---------|----------|
| **PP Neue Montreal** | ~€200-400 | Pangram Pangram | Modern, çok yönlü |
| **Söhne** | $350+ | Klim Type Foundry | Clean, klasik, premium |
| **Söhne Breit** | $400+ | Klim Type Foundry | Söhne kalın versiyon |
| **ABC Diatype** | $150-500 | Dinamo | Neutral, editöryel |
| **ABC Diatype Mono** | $200-300 | Dinamo | Mono versiyon |
| **Tobias** | $100-300 | Klim Type Foundry | Geometric, kurumsal |
| **PP Editorial New** | ~€200-400 | Pangram Pangram | Editorial, başlık |
| **Fragment** | $200-500 | Dinamo | Experimental, başlık |
| **Obviously** | $100-300 | Dinamo | Wide, başlık |
| **Aeonik** | £200+ | Colophon Foundry | Soft, geometric |
| **Migra** | ~€200+ | Pangram Pangram | Premium body |
| **GT America** | $300+ | Grilli Type | Modern, friendly |
| **Neue Haas Grotesk** | $300+ | Linotype | Helvetica ailesi, klasik |

#### C. Fontshare (Indus Type / Indian Type Foundry — FONT ÖZGÜR)

| Font | Lisans | Karakter |
|------|--------|----------|
| **Clash Display** | ÜCRETSİZ (FFL) | Bold, başlık, çarpıcı |
| **Switzer** | ÜCRETSİZ (FFL) | Body, nötr |
| **Satoshi** | ÜCRETSİZ (FFL) | Body, modern |
| **Cabinet Grotesk** | ÜCRETSİZ (FFL) | Heading, geometric |
| **Author** | ÜCRETSİZ (FFL) | Editorial |
| **General Sans** | ÜCRETSİZ (FFL) | Body, nötr |
| **Synonym** | ÜCRETSİZ (FFL) | Body, nötr |
| **Domaine** | ÜCRETSİZ (FFL) | Serif, editorial |
| **Tanker** | ÜCRETSİZ (FFL) | Bold, başlık |
| **Boldonse** | ÜCRETSİZ (FFL) | Display |

#### **Varsayılan (henüz karar verilmemiş):**
- **Heading:** `Plus Jakarta Sans` (Google Fonts, ücretsiz)
- **Body:** `Inter` (Google Fonts, ücretsiz)
- **Mono:** `JetBrains Mono` (Google Fonts, ücretsiz)

> **Karar:** `siteConfig.design.fonts` değişkenleri değiştirilerek sonradan lisanslı font'a geçiş tek satırla yapılır.

### 12.3 Icon Kütüphanesi

#### A. ÜCRETSİZ (Open Source, MIT)
| Kütüphane | Icon Sayısı | Lisans |
|-----------|-------------|--------|
| **Lucide React** | 1500+ | MIT (shadcn/ui ile tam uyumlu) — **varsayılan** |
| Heroicons | 300+ | MIT |
| Phosphor | 9000+ | MIT |
| Tabler | 4500+ | MIT |

#### B. LİSANSLI (opsiyonel)
| Kütüphane | Yıllık Ücret |
|-----------|--------------|
| Hugeicons Pro | $49/yıl |
| Phosphor Pro | $99/yıl |
| Nucleo Pro | $89/yıl |
| Streamline | $199/yıl |

> **Varsayılan:** Lucide React (ücretsiz, MIT, shadcn ile tam uyumlu).

### 12.4 Logo & Marka

#### A. ÜCRETSİZ / Düşük Maliyetli
| Araç | Fiyat | Çıktı |
|------|-------|-------|
| **Looka** | $0 başlangıç, $20 SVG indirme | AI logo |
| **Canva Free** | Ücretsiz | Şablon logo |
| **Brandmark.io** | $25 | AI logo |
| **LogoMakr** | Ücretsiz | Basit logo |
| **Hatchful (Shopify)** | Ücretsiz | Şablon logo |
| **Namecheap Logo Maker** | Ücretsiz | AI logo |

#### B. Profesyonel
| Kanal | Fiyat Aralığı |
|-------|---------------|
| 99designs (yarışma) | $299+ |
| Fiverr Pro | $100-500 |
| Türk ajans (Brandworks, Depar vb.) | ₺5.000-30.000 |
| Dribbble + Behance freelance | $300-1000 |

#### **Yaklaşım:**
1. **Aşama 1:** Looka / Canva ile hızlı logo (~$20) + placeholder kullanımı.
2. **Aşama 2 (müşteri kabulünden sonra):** $300-500 freelance ile profesyonel logo + brand book.
3. **Aşama 3 (kapsam arttıkça):** Ajans ile ₺10.000-20.000 kurumsal kimlik.

### 12.5 Renk Paleti

**Varsayılan (lacivert + turkuaz — "güven + teknoloji"):**

```
Primary:    #0F4C81  (Lacivert — güven, kurumsal)
Secondary:  #06B6D4  (Turkuaz — modern, teknoloji)
Accent:     #F59E0B  (Amber — CTA, dikkat çekici)
Success:    #10B981  (Yeşil)
Warning:    #F59E0B  (Amber)
Danger:     #EF4444  (Kırmızı)
Background: #FFFFFF
Foreground: #0F172A  (Slate)
```

**Alternatif paletler (seçim için):**

| Palet | Primary | Secondary | Karakter |
|-------|---------|-----------|----------|
| **Empatik** | `#0F4C81` (lacivert) | `#06B6D4` (turkuaz) | Güven + modern |
| **Sıcak** | `#7C3AED` (mor) | `#F59E0B` (amber) | Enerjik, cesur |
| **Minimal** | `#0F172A` (siyah) | `#64748B` (gri) | Minimal, profesyonel |
| **Doğa** | `#059669` (yeşil) | `#0EA5E9` (mavi) | Yeşil, sürdürülebilir |
| **Sosyal** | `#DB2777` (pembe) | `#8B5CF6` (mor) | Samimi, sosyal |

> **Karar:** `siteConfig.design.colors` değişkenleri değiştirilerek sonradan değiştirilebilir.

### 12.6 Görsel / Fotoğraf

**Ücretsiz kaynaklar:**
- **Unsplash** — yüksek kalite, lisanssız
- **Pexels** — foto + video
- **Pixabay** — foto + vector
- **Heroicons** — illüstrasyon

**Site fotoğrafları:** Site sahipleri yükler (KVKK onayı alınmış).

---

## 13. Multi-Tenant Mimarisi & İzolasyon

### 13.1 Tenant Bağlantı Stratejileri
- **Primary:** `[slug].[siteConfig.domains.wildcard]` (subdomain).
- **Public landing:** `siteConfig.env.baseUrl/[slug]` (path — SEO için).
- **Süper admin:** `siteConfig.domains.admin` (ayrı subdomain).

**Subdomain routing:**
- Wildcard DNS: `siteConfig.domains.wildcard` → Vercel/Cloudflare.
- SSL: Cloudflare universal cert.
- Tenant detection: middleware subdomain parse → `req.headers.get('host')`.

### 13.2 Tenant Switch
- Header'da site switcher dropdown.
- Tüm request'lerde `X-Tenant-Id` header'ı set edilir.
- Session'da `active_tenant_id` tutulur.

### 13.3 Veri İzolasyonu
- Her tabloda `tenant_id` (NOT NULL).
- Postgres RLS ile query seviyesinde zorunlu.
- Her prepared statement'a `app.tenant_id` set edilir.
- ORM katmanında **global middleware** (tüm sorgular otomatik filter).

### 13.4 Tenant Kayıt & Davet
- **Self-serve:** `siteConfig.env.baseUrl/signup` → sihirbaz.
- **Davet:** Mevcut yönetici davet linki gönderir.
- **Geçiş (import):** Apsiyon/Biyos/Yonetimcell/Dijiyon export → otomatik import wizard.

### 13.5 Custom Domain (Kurumsal Plan)
- `yonetim.merkez-mahallesi.com.tr` gibi.
- CNAME wildcard + Cloudflare for SaaS.
- SSL otomatik.

---

## 14. Güvenlik & KVKK & Uyum

### 14.1 KVKK (Türkiye)
**Veri envanteri (VERBIS):**
- Sakin ad, soyad, TCKN, telefon, e-posta, IBAN, daire bilgisi.
- Yönetici tüm bunlar + sözleşme, fatura, banka bilgisi.

**Aydınlatma metni:**
- Her üye kabul ederken "Aydınlatma Metni" + "Açık Rıza" checkbox.
- 2 ayrı checkbox: zorunlu (KVKK md.5/1) + opsiyonel (pazarlama).

**Veri saklama:**
- Aktif sakin: sözleşme süresince.
- Pasif (taşınmış): 2 yıl (yasal yükümlülükler için).
- Sonra **anonimleştirme**.

**KVKK talepleri:**
- md.11 (bilgi alma) → 72 saat içinde yanıt.
- md.7 (silme) → talep anında işleme (online).
- md.12 (güvenlik) → şifreleme + log + denetim.

**Veri ihlal bildirimi:**
- KVKK md.12/5 → 72 saat içinde Kurul'a bildirim.
- KVKK md.12/6 → sakinlere "en kısa sürede" bildirim.

**Açık rıza yönetimi:**
- Her sakine ait onay durumu: "tam onay", "kısmi onay", "ret".

### 14.2 Güvenlik Önlemleri

| Katman | Önlem |
|--------|-------|
| **Network** | Cloudflare WAF + DDoS + Rate Limit. |
| **App** | CSRF (Server Actions), XSS escape, SQL injection (ORM). |
| **Auth** | Better Auth + 2FA (TOTP) + magic link + WebAuthn. |
| **Session** | HttpOnly + Secure + SameSite=Lax, 30 dk idle. |
| **Encryption** | TLS 1.3, at-rest TDE, field-level (TCKN, IBAN, tel). |
| **Rate limit** | Upstash — login (5/dk), API (100/dk/IP), SMS (3/saat/tel). |
| **Audit** | Her kritik aksiyon log. |
| **Backup** | Neon günlük snapshot, R2 versioning. |
| **Pen test** | Yılda 1. |
| **Bug bounty** | Launch sonrası. |
| **Secrets** | Doppler / Vercel Env. |
| **Anti-bot** | Cloudflare Turnstile. |
| **MFA** | Yönetici + admin için zorunlu. |

### 14.3 Yasal Uyum
- **KVKK** (tam).
- **Kat Mülkiyeti Kanunu (634 sayılı)** — md. 18, 20, 28, 31, 32, 34.
- **Borçlar Kanunu** (gecikme tazminatı).
- **Türk Ticaret Kanunu** (şirket olarak biz).
- **Elektronik İmza Kanunu** (KEP, e-imza).
- **GİB mevzuatı** (e-Fatura).
- **BKM** (ödeme kuruluşu yönergeleri).
- **5651 sayılı Kanun** (log tutma — 1 yıl).

### 14.4 GDPR (EU Pazarı — V2)
- Açık rıza (GDPR md.7).
- Right to be forgotten (72 saat).
- Data portability (JSON export).

---

## 15. Ödeme & Faturalama (B2B SaaS)

### 15.1 SaaS Abonelik Ödeme Akışı

**Planlar** (Bölüm 2.3'teki fiyatların detaylı hali):

| Plan | Daire Limiti | Tenant Limiti | Yıllık Fiyat (KDV dahil) | Özellikler |
|------|--------------|--------------|--------------------------|------------|
| **Ücretsiz Deneme** | 30 | 1 | 0 (30 gün) | Tüm modüller, kartsız |
| **Standart 1** | 5–15 | 1 | 2.950 ₺ | Tüm modüller + 90 SMS |
| **Standart 2** | 16–30 | 1 | 4.750 ₺ | Tüm modüller + 150 SMS |
| ... | ... | ... | ... | ... |
| **Standart 15** | 1001+ | 1 | 44.450 ₺ | Tüm modüller + 10.000 SMS |
| **Kurumsal** | Sınırsız | Sınırsız | Pazarlık | White-label + SLA + SSO + KVKK denetim |

**Ödeme yöntemi (bize ödenen):**
- Kredi kartı (iyzico Checkout).
- Banka havalesi (kurumsal için — fatura kes, ödeme bekle).

**Trial:**
- **30 gün** ücretsiz deneme (kart bilgisi **istenmez**).
- Deneme bitince: otomatik askı (veri silinmez, 6 ay bekletilir).
- Yeniden aktifleştirme: Güncel fiyat üzerinden yıllık kayıt.

**Plan Değişimi:**
- Upgrade: Anında, orantılı ücretlendirme.
- Downgrade: Mevcut dönem sonunda, hemen değil.

### 15.2 E-Fatura Kesme (B2B)
- Yıllık plana geçen + kurumsal müşteri → **e-Fatura** zorunlu (GİB).
- Entegratör: **Logo İşbaşı** veya **Foriba**.
- Otomatik: ödeme alındı → fatura oluştur → GİB'e gönder → KEP ile müşteriye ilet.

### 15.3 Dunning (Ödeme Hatırlatma Akışı)
SaaS abonelik ödemesi başarısız olursa:
- 1. gün: e-posta "Ödeme başarısız, lütfen güncelleyin".
- 3. gün: SMS hatırlatma.
- 7. gün: e-posta + uygulama içi uyarı.
- 14. gün: site askıya alınır (read-only), yöneticiye acil uyarı.
- 30. gün: arşive alınır.

### 15.4 SMS Kota Aşımı
- Paket başına hediye SMS kota (Bölüm 2.3).
- Aşım durumunda: **0.30 ₺/SMS** (sakin aidatı üzerinden tahsil edilir veya sonraki fatura dönemine eklenir).

---

## 16. Kampanya & Promosyon Motoru

> **Karar:** Yapı, **Yonetimcell'in 5 farklı kampanyasını** (aşağıda) ve ötesini kurgulayabilecek şekilde **esnek** olmalı. Yeni kampanya türleri eklenebilir, kod yazılmadan yönetim panelinden tanımlanabilir.

### 16.1 Yonetimcell Mevcut Kampanyaları (Örnek)

| # | Kampanya Adı | Segment | Koşul | Ödül |
|---|---------------|---------|-------|------|
| 1 | **Yeni Projelere Hoş Geldin** | Site/Apartman | 3 yıllık sözleşme taahhüdü | İlk yıl ücretsiz |
| 2 | **Sözleşmeniz Bitene Kadar Ücretler Bizden** | Tüm Toplu Yapı | Mevcut yönetim programı sözleşmesi devam ediyor | Mevcut sözleşme bitene kadar ücretsiz |
| 3 | **6 Ay Ücretsiz** | Profesyonel Yönetim Firmaları | Yeni kurulmuş ve Yönetimcell'i ilk defa kullanacak | 6 ay ücretsiz |
| 4 | **3 Ay Ücretsiz** | Profesyonel Yönetim Firmaları | İlk defa kullanacak | 3 ay ücretsiz |
| 5 | **Tavsiye Et Kazan** | Site/Apartman | Tavsiye edilen site abone olursa | 10.000 ₺'ye varan kazanç |
| 6 | **Sayaç Ortaklığı** | Site/Apartman | Bulut Enerji'den sayaç okuma hizmeti alıyorsa | Yönetimcell tamamen ücretsiz |

### 16.2 Kampanya Veri Modeli (Esnek Mimari)

```ts
// packages/campaigns/src/types.ts
export type CampaignType =
  | "free_trial_extension"      // deneme süresini uzat
  | "x_months_free"             // X ay ücretsiz
  | "x_percent_off"             // %X indirim
  | "x_amount_off"              // X TL indirim
  | "free_first_period"         // İlk dönem (yıl) ücretsiz
  | "referral_reward"           // Tavsiye ödülü
  | "partner_bundled"           // Partner ortaklığı (sayaç vb.)
  | "migration_credit"          // Geçiş kampanyası (sözleşme devri)
  | "custom";                   // Custom JSON config

export interface Campaign {
  id: string;
  code: string;             // 'YENI20' / 'TAVSIYE50' / 'OLCULUYOR'
  name: string;
  description: string;
  type: CampaignType;
  status: 'draft' | 'active' | 'paused' | 'expired';
  audience: {
    segments: ('site_manager' | 'mgmt_company' | 'new_signup' | 'migrating')[];
    tenant_age_days?: { min?: number; max?: number };
    current_package?: string[];
    has_existing_subscription?: boolean;
  };
  conditions: {
    min_unit_count?: number;
    max_unit_count?: number;
    commits_to_years?: number;       // 3 yıl taahhüt
    has_partner_contract?: string[]; // ['bulut_enerji', 'akbank']
    referral_count_required?: number;
    min_period?: 'monthly' | 'quarterly' | 'yearly';
  };
  reward: {
    type: 'free_months' | 'percent_off' | 'amount_off' | 'free_period' | 'credit_balance';
    value: number;                   // 3 (ay), 20 (%), 1000 (TL), 1 (yıl)
    applicable_periods?: number;     // kaç dönem
    max_total_discount_tl?: number;
  };
  starts_at: Date;
  ends_at: Date;
  usage_limit?: number;              // toplam kaç tenant kullanabilir
  usage_count: number;
  per_tenant_limit?: number;         // tenant başına kaç kez
  show_on_pricing_page: boolean;
  badge?: string;                    // "YENİ" / "POPÜLER" / "SINIRLI"
  stackable: boolean;                // başka kampanya ile birleşir mi?
  promo_codes?: PromoCode[];         // kod ile kullanım
  metadata: Record<string, any>;
}
```

### 16.3 Kampanya Motoru Akışı

```ts
// packages/campaigns/src/engine.ts
export async function evaluateCampaigns(
  tenant: Tenant,
  candidate: PurchaseCandidate
): Promise<ApplicableCampaign[]> {
  const active = await db.campaigns.findMany({
    where: { status: 'active', starts_at: { lte: now() }, ends_at: { gte: now() } }
  });
  return active
    .filter(c => matchesAudience(c, tenant))
    .filter(c => matchesConditions(c, tenant, candidate))
    .filter(c => usageAvailable(c))
    .sort((a, b) => discountValue(b, candidate) - discountValue(a, candidate));
}

export function applyBestCampaign(
  candidate: PurchaseCandidate,
  campaigns: ApplicableCampaign[]
): {
  best: ApplicableCampaign | null,
  finalPrice: number,
  savings: number,
  reasons: string[],
  allApplicable: ApplicableCampaign[]
}
```

### 16.4 Admin'den Kampanya Yönetimi

Super-admin paneli (`siteConfig.domains.admin`):
- **Kampanya listesi:** aktif/draft/expired.
- **Yeni kampanya wizard:** Tip seç → koşulları gir → ödülü gir → önizle → yayınla.
- **Performans dashboard:** her kampanya için katılım, gelir etkisi, conversion.
- **A/B test:** Aynı segment için 2 kampanya, hangisi daha çok conversion.
- **Kod yönetimi:** tek kullanımlık / çok kullanımlık / tenant-specific kodlar.

### 16.5 Hazır Şablonlar (Yonetimcell + Fazlası)

Kampanya oluştururken super-admin "şablondan başla" diyebilir:

| Şablon | Açıklama |
|--------|----------|
| **Yeni Site Hoşgeldin** | 1 ay ücretsiz deneme (default) |
| **3 Yıl Taahhüt İlk Yıl Bedava** | 3 yıl ödeme taahhüdü → ilk yıl ücretsiz |
| **Yönetim Firması 6 Ay Bedava** | Profesyonel yönetim firmaları için 6 ay |
| **Geçiş Kampanyası** | Mevcut sözleşme bitene kadar ücretsiz (max 12 ay) |
| **Tavsiye Et Kazan** | Davet eden + davet edilen 1 ay bedava |
| **Partner Bundled** | Anlaşmalı partner (sayaç, enerji, banka) entegrasyonu → sürekli ücretsiz |
| **Yıllık Peşin %17 İndirim** | 12 ay peşin ödeme → 2 ay bedava |
| **Erken Kuş** | Lansmanda ilk 100 site → ömür boyu %25 indirim |
| **Black Friday** | Yıllık %25-50 indirim (sınırlı süre) |
| **Çevre Dostu** | Karbon ayak izi modülü kullanan siteler → %10 indirim |

### 16.6 Sayfa Gösterimi (Marketing Site)

`/kampanyalar` sayfası:
- Aktif kampanyalar grid (kart görseli + başlık + koşul + ödül + bitiş tarihi + "Hemen Başvur").
- Detay landing page her kampanya için: `/kampanya/[slug]`.
- Pricing page'de otomatik "Şu an aktif kampanyalar" bandı.

### 16.7 Sınırlamalar & Guard

- **Stacking:** Default `stackable: false` — sadece en avantajlısı uygulanır.
- **Kötüye kullanım:** Aynı TCKN/IBAN ile çoklu kayıt → fraud detection.
- **Kampanya süresi bitince:** Otomatik expire, devam eden aboneliklerde fiyat **kilitli** (kalan dönem bitene kadar aynı fiyat).

---

## 17. Onboarding & Aktivasyon Akışı

### 17.1 Yönetici İlk Günü

**Adım 1 — Kayıt (90 saniye):**
- E-posta + telefon + şifre veya magic link.
- KVKK aydınlatma metni + açık rıza checkbox.

**Adım 2 — Site Sihirbazı (5 dakika):**
- Site adı + adres + Google Maps pin.
- Daire sayısı + blok sayısı.
- Mevcut yönetim sistemi (Apsiyon, Biyos, Yonetimcell, Excel, hiçbiri).
- **Veri aktarımı** (varsa): Excel upload + otomatik parse.

**Adım 3 — Birim Tanımı (3 dakika):**
- Hızlı mod: toplam daire sayısı → tüm birimler otomatik (A-1, A-2...).
- Detaylı mod: blok + kat + daire no + m² + arsa payı tek tek.

**Adım 4 — Banka & Ödeme (2 dakika):**
- Site banka IBAN(lar)ı.
- iyzico sanal POS bağlantısı (basit form).

**Adım 5 — İlk Aidat (3 dakika):**
- Aylık aidat tutarı + formül (eşit/arsa payı).
- Vade tarihi (örn. her ayın 10'u).
- Test ödeme (kendi kartınla 1 TL öde, doğrula).

**Adım 6 — Sakin Davet (3 dakika):**
- WhatsApp/SMS ile toplu davet.
- Davet mesajı şablonu + kişiselleştirme.

**Adım 7 — Aktif Kampanya Uygulaması (varsa):**
- Eğer geçerli kampanya kodu girilmişse → indirimli plan.
- "Yıllık peşin %17 indirim" otomatik önerisi.

### 17.2 Sakin İlk Günü
- WhatsApp'a "Merhaba, site adına hoşgeldiniz!" mesajı.
- "Borç Sorgula" butonu → cevap.
- "Siteye Kayıt Ol" linki → web'de TCKN + telefon doğrulama → self-servis portal.

### 17.3 Aktivasyon Metrikleri
- D0 → D1 retention: %80+.
- D1 → D7: %60+.
- D7 → D30: %50+.

---

## 18. Yönetim Paneli (Super-Admin)

### 18.1 Platform İçi Süper Admin (`siteConfig.domains.admin`)

**Modüller:**
1. **Tenant Yönetimi** — tüm siteler, plan, durum, askıya al, sil.
2. **Kullanıcı Yönetimi** — arama, impersonate (KVKK loglu), şifre reset.
3. **Faturalama** — abonelikler, plan değişiklikleri, iade.
4. **Ödeme İzleme** — başarısız ödeme, komisyon, sağlayıcı health.
5. **Bildirim İzleme** — SMS/SMS/WhatsApp maliyetleri, hata oranları.
6. **KVKK Talepleri** — gelen talepler, durum, yanıt süresi.
7. **Audit Log** — tüm kritik aksiyonlar.
8. **Feature Flags** — yeni özellikleri %10 kullanıcıya aç.
9. **Pazarlama** — kampanya yönetimi (Bölüm 16), kampanya kodu, referral.
10. **Support Inbox** — sakin şikayetleri (Plain.com).
11. **Health Dashboard** — uptime, response time, error rate, queue lag.
12. **Changelog & Release Notes**.
13. **Doküman Yönetimi** — KVKK aydınlatma metni, sözleşme versiyonları.

### 18.2 Impersonation (KVKK Uyumu)
- Süper admin, sakini impersonate edebilir.
- Tüm aksiyonlar **ayrı audit log** ile kaydedilir (`impersonated_by` alanı).
- Sakinlere bildirim: "Hesabınıza X tarafından Y tarihinde erişildi".

---

## 19. Performans, Ölçeklenebilirlik & Gözlemlenebilirlik

### 19.1 Performans Hedefleri
| Metrik | Hedef | Nasıl Ölçülür |
|--------|-------|----------------|
| **TTFB** | < 200ms (p95) | Vercel Analytics |
| **LCP** | < 2.5s (p75) | Web Vitals |
| **INP** | < 200ms | Web Vitals |
| **CLS** | < 0.1 | Web Vitals |
| **API response** | < 500ms (p95) | Sentry + custom |
| **Time to Interactive** | < 3.5s | Lighthouse |

### 19.2 Ölçeklenebilirlik
- **Vercel:** Auto-scale (serverless).
- **Neon Postgres:** Auto-scale.
- **Upstash Redis:** Pay-per-request.
- **Cloudflare R2:** Sınırsız ölçek.

**Database scale:**
- 1.000 tenant (≈100K kullanıcı): RLS + connection pool.
- 10.000 tenant: Sharding by region.
- 100.000 tenant: Multi-cluster + read replica + cache layer.

### 19.3 Gözlemlenebilirlik
- **Logs:** Better Stack / Logflare.
- **Metrics:** Grafana Cloud + Prometheus.
- **Traces:** OpenTelemetry → Grafana Tempo.
- **Errors:** Sentry.
- **Uptime:** Better Stack (her 30s).
- **Business metrics:** PostHog dashboard.

### 19.4 Kritik Alertler
- API error rate > 1% (5 dakika).
- DB connection pool > 80%.
- Ödeme başarısızlık oranı > 5%.
- WhatsApp template rejection.
- KVKK talep yanıt süresi > 24 saat.
- Queue lag > 10 dakika.

---

## 20. Geliştirme Yol Haritası (Fazlara Bölünmüş)

> **Not:** Bu spec'i parça parça inşa edeceğiz. **Tüm modüller tamamlandıktan sonra canlıya çıkılır** (MVP ara sürümü olmaz). Her faz tamamlanınca kullanıcı demo görür, onay alır, sonraki faza geçilir.

### Faz 0 — Temel Kurulum
- [ ] Monorepo (pnpm + Turborepo).
- [ ] Next.js 15 + TypeScript + Tailwind 4 + shadcn/ui.
- [ ] `packages/config/src/site.ts` (Bölüm 4.4) — tek dosyadan tüm config.
- [ ] Neon Postgres + Prisma/Drizzle.
- [ ] Better Auth + magic link.
- [ ] Vercel + Neon + Upstash + Cloudflare kurulumu.
- [ ] CI/CD: GitHub Actions (PR preview, lint, type-check, test).
- [ ] Sentry + PostHog.
- [ ] Domain + DNS + SSL (Cloudflare).
- [ ] Logo ve marka (Looka/Canva ile placeholder, $20).
- [ ] Landing page draft (basit).

### Faz 1 — Multi-Tenant Çekirdek
- [ ] Subdomain routing + tenant detection.
- [ ] RLS kurulumu + global middleware.
- [ ] Tenant onboarding sihirbazı (signup).
- [ ] Tenant ayarları (branding, KVKK, vs.).

### Faz 2 — Birim & Kullanıcı Yönetimi
- [ ] Blok + birim (daire) CRUD.
- [ ] Malik/kiracı ilişkisi (zaman içinde değişebilir).
- [ ] Site sakini davet (SMS + WhatsApp).
- [ ] Sakin self-servis portal (web).
- [ ] KVKK aydınlatma metni + açık rıza.

### Faz 3 — Aidat & Borç Yönetimi
- [ ] Aidat tanımı (aylık, dönemsel, özel).
- [ ] Borçlandırma formülleri (eşit, arsa payı, sayaç, karma).
- [ ] Otomatik aylık borç üretimi (cron).
- [ ] Gecikme tazminatı (KMK + TCMB reeskont).
- [ ] Borç listesi + tahsilat oranı dashboard'u.
- [ ] **Audit timeline** (vurucu özellik — Bölüm 3).

### Faz 4 — Ödeme (B2C)
- [ ] iyzico Checkout entegrasyonu.
- [ ] Webhook → otomatik eşleştirme.
- [ ] Sakin self-servis online ödeme.
- [ ] Gecikme uyarısı (otomatik).
- [ ] PDF makbuz.
- [ ] 3D Secure zorunlu.

### Faz 5 — Bildirim Altyapısı
- [ ] WhatsApp Business API Cloud entegrasyonu.
- [ ] WhatsApp state machine (slot/intent).
- [ ] SMS (Netgsm).
- [ ] E-posta (Resend).
- [ ] Kanal seçimi akıllı yönlendirme.
- [ ] Bildirim template'leri (utility).

### Faz 6 — Finansal Yönetim
- [ ] Gelir/gider defteri.
- [ ] Banka entegrasyonu (Param Open Banking).
- [ ] Mutabakat (polling + webhook).
- [ ] e-Fatura entegrasyonu (Logo İşbaşı).
- [ ] Raporlar (aylık, yıllık, özel).
- [ ] Kategori bazlı dashboard.

### Faz 7 — Duyuru & Anket & Toplantı
- [ ] Duyuru modülü.
- [ ] Anket modülü ( KMK yeter sayısı kontrolü).
- [ ] Toplantı modülü (davet, gündem, tutanak).
- [ ] Karar defteri.

### Faz 8 — Bakım & Arıza
- [ ] Arıza kayıt formu.
- [ ] SLA tanımı + atama.
- [ ] Periyodik bakım takvimi (50+ şablon).
- [ ] Tedarikçi yönetimi.

### Faz 9 — Personel & Sayaç
- [ ] Personel CRUD + maaş.
- [ ] İzin/avans takibi.
- [ ] Giriş-çıkış (mobil konum).
- [ ] Sayaç okuma + OCR.
- [ ] Fatura yünetimi.

### Faz 10 — Rezervasyon & Doküman
- [ ] Rezervasyon sistemi (salon, otopark, hamam).
- [ ] Doküman yönetimi (versiyonlama, KVKK).
- [ ] Tam metin arama (Postgres FTS).

### Faz 11 — Hukuk & İcra & Mesajlaşma
- [ ] İcra takip modülü.
- [ ] Avukat atama + komisyon.
- [ ] Hukuki metin kütüphanesi.
- [ ] Mesajlaşma (uygulama içi + WhatsApp köprüsü).
- [ ] KVKK md.11 talep yönetimi.

### Faz 12 — Vurucu Özellikler (Tamamlama)
- [ ] Bütçe simülatörü (Bölüm 3.4).
- [ ] "Borcu yoktur" self-servis motoru (Bölüm 3.6).
- [ ] NPS otomasyonu (Bölüm 3.8).
- [ ] Site Landing Page builder (Bölüm 3.9).
- [ ] Çoklu banka failover (Bölüm 3.10).
- [ ] Self-servis veri migration (Bölüm 3.11).

### Faz 13 — Kampanya & Promosyon
- [ ] Kampanya motoru (Bölüm 16).
- [ ] Admin wizard'ı.
- [ ] Şablon kütüphanesi (Yonetimcell + 4 yeni).
- [ ] Promo kod yönetimi.
- [ ] Sayfa gösterimi (pricing, kampanyalar).

### Faz 14 — SaaS Faturalama
- [ ] Stripe Billing / iyzico subscription.
- [ ] Plan değişimi.
- [ ] Dunning akışı.
- [ ] Trial yönetimi (30 gün kartsız).
- [ ] E-Fatura (bize ödenen).
- [ ] Yıllık/yenileme akışı.

### Faz 15 — Fiyatlandırma & Landing (Marketing)
- [ ] Pricing page (Bölüm 2.3 fiyatlar).
- [ ] Kampanya bandı.
- [ ] Feature karşılaştırma tablosu.
- [ ] SSS sayfası.
- [ ] Blog (MDX).
- [ ] Programmatic SEO sayfaları.

### Faz 16 — Polish & Launch
- [ ] Performance optimization (Lighthouse 90+).
- [ ] SEO + GEO (JSON-LD, /llms.txt, FAQ schema).
- [ ] A11y test (WCAG 2.1 AA).
- [ ] Pen test.
- [ ] KVKK denetim.
- [ ] Doküman (help center, API docs).
- [ ] **CANLI YAYIN.**

### Faz 17 — Mobil Uygulama (Canlı Çıkıştan Sonra)
- [ ] React Native + Expo (Yönetici + Sakin için).
- [ ] iOS + Android.
- [ ] Push notification (FCM + APNs).
- [ ] App Store + Play Store yayın.
- [ ] Native biometric auth.

---

## 21. Kabul Kriterleri (Definition of Done)

### 21.1 Modül Bazlı (Örnek: Aidat)
- [ ] Yönetici aidat tanımı oluşturabilir.
- [ ] Borçlandırma formülü seçilebilir.
- [ ] Cron job her ayın 1'inde borçları otomatik üretir.
- [ ] Gecikme tazminatı otomatik uygulanır.
- [ ] Sakin WhatsApp'tan "borc" yazınca mevcut borcu görür.
- [ ] Sakin ödeme yapabilir (iyzico → webhook → borç eşleşmesi).
- [ ] Geç ödeme bildirimi otomatik gider.
- [ ] İcra takip modülü 90+ gün için avukata atama akışı başlatır.
- [ ] Tüm aksiyonlar audit log'a yazılır.
- [ ] KVKK uyumlu (veri silme talebi 72 saat).

### 21.2 Platform Genel
- [ ] SSR çalışır (kaynak görüntülemede içerik var).
- [ ] Multi-tenant izolasyon testi (Tenant A verisi Tenant B'den erişilemez).
- [ ] KVKK md.11 talep yanıt süresi < 72 saat.
- [ ] Lighthouse score > 90 (mobile + desktop).
- [ ] Sıfır kritik güvenlik açığı (Snyk + OWASP).
- [ ] Tüm endpoint'ler OpenAPI 3.1 ile dokümante.
- [ ] SEO: sitemap.xml + robots.txt + JSON-LD valid.
- [ ] Uptime > %99.9 (yıllık).
- [ ] Tüm konfigürasyon `siteConfig` (Bölüm 4.4) üzerinden.

---

## 22. Veri Açıkları & Riskler

### 22.1 Veri Açıkları (Araştırma Sırasında)
- Apsiyon, Biyos, Dijiyon fiyatlandırma sayfalarının çoğu **JS-shell** (server-rendered değil) → curl ile görünmedi. Yaygın gerçek fiyatlar ancak satış görüşmesinde öğrenilebiliyor.
- Biyos kullanıcı yorumları (Şikayetvar) sınırlı.
- Google Play rating'leri JS-shell → doğrudan karşılaştırma yapılamadı.
- Apsiyon App Store ID ve rating verisi: doğrulanmadı.
- KVKK resmileştirme: mevzuat.gov.tr PDF olarak erişilemedi.
- WhatsApp Cloud pricing TR bölgesi için Meta'nın fiyatları release sırasında doğrulanmalı.

### 22.2 Riskler & Azaltma

| Risk | Olasılık | Etki | Azaltma |
|------|----------|------|---------|
| **Banka entegrasyonu tek sağlayıcı** (Apsiyon Şekerbank arızası) | Yüksek | Kritik | Multi-aggregator + polling fallback |
| **WhatsApp Meta politikası değişikliği** | Orta | Yüksek | Utility template çeşitliliği + SMS fallback |
| **KVKK ihlali** | Düşük | Çok yüksek | Field-level encryption + audit log + DPO atama |
| **Çoklu tenant RLS bypass** | Çok düşük | Kritik | Otomatik test + bug bounty |
| **iyzico komisyon artışı** | Orta | Orta | Alternatif sağlayıcı (PayTR, Param) hazır |
| **Pazar doygunluğu** | Düta | Orta | Fark yaratan özellikler (WhatsApp-first, AI-sız simülatör, KVKK denetim) |
| **İlk 1000 tenant edinme zorluğu** | Yüksek | Yüksek | Closed beta + içerik pazarlama + Apsiyon/Biyos kullanıcılarına yönelik "geçiş promosyonu" |
| **Domain geç alınırsa** | Orta | Düşük | `siteConfig` tek dosyadan yönetim (Bölüm 4.4) |
| **Marka adı sorunlu çıkarsa** | Orta | Orta | `siteConfig.brand` tek dosyadan yönetim |
| **SMS aşımı** | Orta | Orta | Kota başlangıçta muhafazakâr; Kota aşımı ücretlendirilir |

---

## 23. Açık Sorular (Karar Verilmemiş)

Bu spec'i Claude'a vermeden önce şu kararlar verilmeli:

1. **Domain adı** → ŞİMDİLİK NULL: `siteConfig.domains` defaultları kullanılır, sonradan değiştirilir. (Öneri: `yonetimcell.com.tr` veya kısa yeni bir alan.)
2. **Marka adı** → ŞİMDİLİK NULL: `siteConfig.brand` defaultları kullanılır. (Öneri: kısa, akılda kalıcı, "yönetim" çağrışımlı.)
3. **Logo** → ŞİMDİLİK YOK: Aşama 1'de Looka/Canva ile $20 placeholder. Sonra $300-500 freelance.
4. **Font** → ŞİMDİLİK Plus Jakarta Sans + Inter (ücretsiz). İstenirse lisanslıya geçiş (Bölüm 12.2'deki listeden).
5. **Renk** → ŞİMDİLİK lacivert + turkuaz (Bölüm 12.5). İstenirse değiştirilir.
6. **İkon** → ŞİMDİLİK Lucide React (ücretsiz, MIT).
7. **Türkiye şirket kurulumu** → MVP canlı çıkıştan SONRA.
8. **Sermaye** → Self-funded (yatırım yok).

### Karar Verilince Yapılacaklar

Karar verildiğinde **tek dosya** değişir: `packages/config/src/site.ts`. Global replace ile tüm sistem güncellenir.

---

**Spec sonu.** Claude'a bu dosyayı verip **"Faz 0'dan başla, kodla"** demeniz yeterli. Her faz tamamlanınca demo + kabul kriterleri kontrol edilir, sonraki faza geçilir. Tüm proje (Faz 0-16) tamamlandıktan sonra canlıya çıkılır. Faz 17 (mobil uygulama) canlı çıkıştan sonra başlar.
