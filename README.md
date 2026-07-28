# Site Yönetim SaaS Platformu

Türkiye'deki apartman, site, rezidans ve plazalar için çok kiracılı (multi-tenant)
site yönetim platformu. Ürün kapsamı ve kararlar [`SPEC.md`](./SPEC.md) dosyasında
tanımlıdır; kodun her modülü ilgili şartname bölümüne referans verir.

## Hızlı başlangıç

Gereksinimler: Node 20+, pnpm 9+, Docker (yerel Postgres/Redis için).

```bash
cp .env.example .env          # değerleri doldurun (boş entegrasyonlar devre dışı kalır)
pnpm install
pnpm db:up                    # Postgres + Redis (docker compose)
pnpm db:generate              # Drizzle migration üret
pnpm db:migrate               # şema + RLS politikaları + trigger'lar
pnpm db:seed                  # planlar, 55 bakım şablonu, kampanyalar, demo site
pnpm dev                      # web :3000, app :3001
```

Yerel oturum açmak için demo kullanıcı ve çerez üretin:

```bash
pnpm --filter @yonetim/auth dev:session manager    # yönetici
pnpm --filter @yonetim/auth dev:session resident   # sakin
# çıkan token'ı `yonetim_session` çerezi olarak kullanın
```

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `pnpm dev` | Her iki uygulamayı geliştirme modunda başlatır |
| `pnpm build` | Üretim derlemesi |
| `pnpm test` | Birim testleri (167 test, DB gerektirmez) |
| `pnpm test:integration` | RLS izolasyonu ve borç motoru testleri (Postgres gerekir) |
| `pnpm exec tsc --noEmit -p tsconfig.check.json` | Tüm paketlerin tip kontrolü |
| `pnpm db:up` / `pnpm db:down` | Yerel altyapıyı başlat/durdur |
| `pnpm setup` | Kurulumun tamamını tek komutta yapar |

## Mimari

```
apps/
  web/    Pazarlama sitesi (SSG/ISR) — fiyatlandırma, kampanyalar, blog, site landing sayfaları
  app/    Ürün (SSR) — yönetici paneli, sakin portalı, süper-admin, webhook'lar, cron
packages/
  config/         Tek merkezî yapılandırma (marka, domain, iş kuralları) — Bölüm 4.4
  core/           Para/tarih/TR doğrulayıcı, RBAC, hata, yeniden deneme, veri aktarımı
  core/crypto     Alan bazlı şifreleme (Node'a bağlı; ayrı alt yol)
  db/             Drizzle şeması (63 tablo), RLS SQL'i, migration, seed
  auth/           Oturum, OTP/TOTP, parola, yetki muhafızları, hız sınırlama
  dues/           Borçlandırma formülleri, gecikme tazminatı, mahsup, KMK yeter sayıları, simülatör
  pricing/        15 kademeli paket kataloğu ve fiyat motoru
  campaigns/      Kampanya motoru + 11 hazır şablon
  kvkk/           İçerik filtresi, risk skoru, talep yönetimi, aydınlatma metni
  whatsapp/       Cloud API istemcisi, AI'sız niyet tespiti, durum makinesi, şablonlar
  sms/            Netgsm + İleti Merkezi adaptörleri (failover)
  emails/         Resend + Türkçe şablonlar
  notifications/  Akıllı kanal yönlendirme ve gönderim
  payment/        iyzico + PayTR, şeffaf komisyon hesabı, makbuz
  bank/           Open banking aggregator, eşleştirme ve mutabakat
  jobs/           19 zamanlanmış iş tanımı ve çalıştırıcıları
  seo/            schema.org, llms.txt, programmatic SEO yardımcıları
  ui/             Tailwind 4 tabanlı bileşen kütüphanesi
  i18n/           Çeviri sözlükleri (TR varsayılan)
infra/
  docker/         Yerel Postgres + Redis
  ci/             GitHub Actions iş akışı (.github/workflows/ altına kopyalayın)
```

## Çok kiracılı izolasyon

İzolasyon uygulama katmanında değil, **PostgreSQL Row-Level Security** ile sağlanır.
Bunun doğru çalışması için iki ayrı veritabanı rolü kullanılır:

| Rol | Bağlantı değişkeni | Kullanım |
| --- | --- | --- |
| `yonetim_app` | `DATABASE_URL` | Tüm tenant verisi. RLS zorunlu (`NOBYPASSRLS`). |
| `yonetim_admin` | `DATABASE_ADMIN_URL` | Oturum çözümleme, süper-admin, cron, denetim yazımı (`BYPASSRLS`). |
| şema sahibi | `DATABASE_OWNER_URL` | Yalnızca migration ve seed. |

> **Önemli:** Uygulama asla süper kullanıcı ile bağlanmamalıdır — süper kullanıcılar
> RLS'i her koşulda baypas eder. Oturum değişkenine dayalı bir "bypass" mekanizması
> bilinçli olarak yoktur; uygulama rolü kendi izolasyonunu kaldıramaz.

Tenant verisine erişen her sorgu `withTenant(tenantId, ...)` içinden geçer; bu
fonksiyon `app.tenant_id` oturum değişkenini transaction kapsamında set eder ve
RLS politikaları buna bakar. Bağlam set edilmezse hiçbir satır dönmez (fail-closed).

## Değiştirilemez kütükler

`audit_logs`, `audit_debt_changes` ve `data_access_logs` tabloları trigger ile korunur:

- **UPDATE her koşulda yasak** — kayıt içeriği değiştirilemez.
- **DELETE yalnızca** yetkili rol + açık imha izniyle mümkündür
  (`withBypassRls(reason, fn, { allowLogPurge: true })`). Bu istisna, KVKK saklama
  süresi sonunda verinin silinmesi zorunluluğu için gereklidir.

Borç tutarı veya vadesi değiştiğinde timeline kaydı **veritabanı trigger'ı** ile
otomatik oluşur; uygulama kodu bunu atlayamaz.

## Yasal dayanaklar

Kod içindeki hesaplamalar ilgili mevzuata referansla yazılmıştır:

- **634 sayılı Kat Mülkiyeti Kanunu** — ortak gider paylaşımı (md.20), gecikme
  tazminatı üst sınırı aylık %5 (md.20/son), kanuni ipotek hakkı (md.22),
  toplantı ve karar yeter sayıları (md.29–32, 34, 42, 44), işletme projesi (md.37).
- **6698 sayılı KVKK** — aydınlatma (md.10), ilgili kişi hakları (md.11), silme
  (md.7), güvenlik tedbirleri (md.12), ihlal bildirimi (md.12/5).
- **VUK md.253 / TTK md.82** — mali kayıtların 5 yıl saklanması.
- **5651 sayılı Kanun** — işlem loglarının saklanması.
- Asansör, yangın, su deposu, topraklama vb. periyodik kontroller için ilgili
  yönetmelik referansları bakım şablonu kütüphanesinde alan olarak tutulur.

## Zamanlanmış işler

19 iş `packages/jobs/src/definitions.ts` içinde tanımlıdır (tek doğruluk kaynağı).
Zamanlamayı `apps/worker` açılışta Redis'e yazar: tanımdaki her iş bir BullMQ
repeatable job'a karşılık gelir, tanımdan çıkan iş Redis'ten de silinir.
İkinci bir liste yoktur — `vercel.json` kaldırıldı.

Cron ifadeleri **Europe/Istanbul**'a göredir; sunucunun `TZ`'sine güvenilmez.

Elle yeniden koşturma (platform yöneticisi yetkisiyle):

```
POST /v1/panel/platform/jobs/<iş-slug>/run[?tenantId=…]
```

Yanıt `202`: iş kuyruğa alındı, bitmedi. Bir HTTP isteğinin arkasında 15
dakikalık borç üretimi koşturmak, istek zaman aşımına uğradığında işi yarıda
bırakırdı — kuyruğun var olma nedeni bu.

## Yapay zekâ kullanımı

Şartname gereği aidat hesabı, borç eşleştirme, gecikme tazminatı, KVKK filtreleme
ve rapor üretimi **deterministiktir**; bu alanlarda yapay zekâ kullanılmaz.
WhatsApp niyet tespiti kural motoruyla yapılır (167 testin 38'i bunu doğrular);
yalnızca eşik altı kalan mesajlar için isteğe bağlı model çağrısı öngörülmüştür
(`siteConfig.ai.enabled`, varsayılan kapalı).

## Marka ve domain değişikliği

Marka adı, domainler, renkler, fontlar ve iş kuralları tek dosyadadır:
`packages/config/src/site.ts`. Kodun hiçbir yerinde domain veya marka adı sabit
yazılmaz. Domain netleştiğinde bu dosya ve `.env` içindeki `NEXT_PUBLIC_*`
değişkenleri güncellenir.
