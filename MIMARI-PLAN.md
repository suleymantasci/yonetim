# MIMARI-PLAN.md — Backend Katmanı, Servis İzolasyonu ve UI Yenilenmesi

> Bu doküman [`GAP-DURUM.md`](./GAP-DURUM.md) §4'teki **yapılmayanlar** listesini ve
> [`GAP-ANALYSIS.md`](./GAP-ANALYSIS.md) §7'deki teknik borcu tek bir mimari hedefe
> bağlar. GAP-DURUM.md §2'de alınmış bazı kararlar burada **bilinçli olarak geri
> alınıyor**; hangileri ve neden, §3'te tek tek yazılı.
>
> Amaç: (1) veri erişimini web katmanından tamamen çıkarmak, (2) servisleri izole
> bir backend'de toplamak, (3) UI'ı olgun kütüphaneler üzerine taşımak, (4) kalan
> ~30 özellik boşluğunu bu yeni iskelete yerleştirmek.

---

## 1. Mevcut durum — ölçülmüş, tahmin değil

| Ölçüm | Değer | Anlamı |
| --- | --- | --- |
| `apps/app/src` içinde `@yonetim/db` / `drizzle-orm` import eden dosya | **55** | Veri erişimi UI'a dağılmış |
| — bunlardan `page.tsx` | **24** | React server component'i içinde `tx.select()` |
| — bunlardan `actions.ts` | **11** | Server action'lar doğrudan SQL yazıyor |
| — bunlardan `route.ts` | **10** | `/api/v1`, webhook, cron uçları |
| `withTenant` / `withBypassRls` / `withPlatform` çağrı yeri | **199** | RLS bağlamı 199 ayrı yerde elle kuruluyor |
| `apps/app/src/lib/queries/*` | **1.978 satır** | Repository katmanı başlamış ama yalnız 5 modülü kapsıyor |
| `packages/ui` bileşen / satır | **18 / 3.858** | Tamamı elle yazılmış, 3. parti yok |
| `apps/app/vercel.json` cron tanımı | **19** | Hepsi `maxDuration: 300` sınırında |

**Doğru olan taraf:** `packages/dues`, `pricing`, `kvkk`, `bank`, `payment`,
`notifications`, `campaigns`, `sms`, `whatsapp`, `emails` paketlerinin **hiçbiri**
`@yonetim/db` import etmiyor. Bunlar saf hesap/kural motorları. Yani iş mantığı
zaten izole; izole olmayan şey **veri erişimi ve orkestrasyon**. Bu, planın
maliyetini ciddi biçimde düşürüyor: yeniden yazılacak olan iş mantığı değil,
sorgu ve akış katmanı.

**Asıl sorun:** `talepler/page.tsx` gibi bir dosya aynı anda üç işi yapıyor —
yetki kontrolü, SQL, sunum. `requests` tablosundan 200 satır çekip SLA ihlalini
JavaScript'te `filter` ile hesaplıyor. Bu mantığın ikinci bir tüketicisi
(mobil, muhasebe entegrasyonu, sakin portalı) olduğu anda kopyalanmak zorunda.

---

## 2. Alınan üç karar

| Karar | Seçim |
| --- | --- |
| **Topoloji** | Ayrı **NestJS** servisi. Veritabanının tek sahibi o. `apps/app` render/BFF katmanına iner, veriyi tipli bir istemciyle HTTP üzerinden çeker. |
| **Dağıtım** | **Tamamen self-hosted Docker.** Postgres, Redis, MinIO, api, worker, app, web tek compose/k8s altında. Vercel Cron yerine gerçek scheduler. |
| **UI** | **Tam design system geçişi.** shadcn/ui + Radix primitives; `packages/ui` bunun üzerine yeniden kurulur. |

Bu üç karar birbirini destekliyor: self-host olmadan ayrı bir Nest process'i
barındıramazsınız, ayrı process olmadan 19 cron job'ı ve uzun süren işleri
(Excel import, PDF üretimi, WhatsApp gönderimi) süre sınırından kurtaramazsınız.

**Tek uyarım, sonra devam:** ayrı process, panel render'ında sayfa başına 1–4 HTTP
hop demek ve auth'un iki yerde konuşulması demek. Bu maliyet gerçek ama
yönetilebilir — §8'de tek oturum otoritesi, §9'da ekran başına tek çağrı tasarımı
ile karşılığını veriyorum. Riskin tamamı §16'da açık yazılı; plan bu maliyeti
kabul ederek kurgulandı.

---

## 3. GAP-DURUM.md §2'den geri alınan kararlar

Bu kararlar yanlış değildi — **dayandıkları koşul değişti**. Her birinin neden
artık geçerli olmadığı:

| # | Eski karar | Neden değişti |
| --- | --- | --- |
| **1** | react-hook-form yok; tek doğruluk kaynağı sunucudaki Zod | Gerekçe "aynı kuralı istemcide ikinci kez yazmak"tı. `packages/contracts` ile şema **artık tek nesne** ve iki taraf onu import ediyor. Duplikasyon gerekçesi ortadan kalktı. Sunucu hâlâ bağlayıcı otorite (§7). |
| **2** | Grafik kütüphanesi yok; 816 satır elle SVG | Recharts'ın ~100 kB'ı gerekçeydi. Ama kalan yol haritası forecast bandı, takvim ısı haritası, gauge, yığılmış kırılım istiyor — elle SVG'de her biri yeni bir 200 satır. ECharts tree-shaken ve **decal (desen dolgu)** desteğiyle erişilebilirlik hedefini kütüphanenin kendisi taşıyor (§13). |
| **3** | Radix yok; overlay ailesi elle (~250 satır) | Tam design system kararıyla birlikte odak tuzağı/ARIA bakımı Radix'e devrediliyor. |
| **5** | "Server Action UI için, REST dış dünya için" | Artık **tek** yol var: REST. Server Action'lar korunuyor ama içleri SQL değil, API çağrısı (§9). |
| **11** | Sakin API'sinde yazma ucu yok (KVKK md.10) | Bu karar **korunuyor** — ama gerekçesi değişiyor: artık yazma ucu var, yalnızca aydınlatma onayı kanıtı (`consent_version` + `consent_at` + metin sürümü) zorunlu alan. API anahtarı bunu sağlayamıyorsa 422 döner. |
| **12** | Kalıcı silme arayüzde yok | **Korunuyor.** Değişen tek şey: KVKK imha artık cron değil, kuyruk job'ı. |
| **6, 8, 9, 10, 13, 14** | Liste durumu URL'de · yıkıcı işlemde önizleme zorunlu · gerekçesiz düzeltme yok · KDV hesaplanıyor · tahmin deterministik · `withBypassRls` gerekçeli | **Hepsi korunuyor.** Bunlar mimariden bağımsız ürün/uyum kararları. §15'te bunları koruyan kalite kapıları var. |

**Karar 7 (telefon şifrelenmedi) özellikle korunuyor** ve yeni mimaride
gerekçesi güçleniyor: numara hem OTP kimliği hem webhook ters arama anahtarı.
TCKN/IBAN şifreli kalıyor; şifre çözme artık **yalnızca** `apps/api` içinde
mümkün (anahtar Next'e hiç verilmiyor) — bu, bölünmenin bedava kazancı.

---

## 4. Hedef topoloji

```
                                  ┌──────────────────────────────┐
   Tarayıcı ──── cookie ────────► │ apps/app   (Next 15, RSC)    │
                                  │ panel + sakin portalı        │
                                  │ SQL YOK · DB import'u YOK    │
                                  └──────────┬───────────────────┘
                                             │ HTTP (docker iç ağı)
                                             │ cookie forward + X-Request-Id
                                  ┌──────────▼───────────────────┐
   Muhasebe yz. ─ API key ──────► │ apps/api   (NestJS 11)       │
   Mobil (Faz 17) ─ JWT ────────► │ TEK DB SAHİBİ                │
   Webhook (Meta/iyzico) ───────► │ guard → Ctx → ALS → tenant tx │
                                  └──┬────────────────┬──────────┘
                                     │                │ BullMQ
                    ┌────────────────▼──┐        ┌────▼──────────────┐
                    │ Postgres + RLS    │◄───────┤ apps/worker       │
                    │ set_config per tx │        │ 19 job + kuyruklar│
                    └───────────────────┘        └───────────────────┘
                             ▲                          │
                    ┌────────┴────────┐        ┌────────▼────────┐
                    │ Redis (cache,   │        │ MinIO (S3)      │
                    │ kuyruk, session)│        │ belge/dekont    │
                    └─────────────────┘        └─────────────────┘
```

**Değişmeyen güvenlik sınırı:** RLS. `set_config('app.tenant_id', …, true)`
üçüncü argümanı `true` olduğu için **transaction-local**. Nest'te connection
pool kullanılsa bile sızma olmaz — *her sorgu bir transaction içinde koştuğu
sürece*. Bu şartı §8'de mekanik olarak zorunlu kılıyorum.

---

## 5. Hedef repo yapısı

```
apps/
  api/                        ★ YENİ — NestJS, DB'nin tek sahibi
    src/
      main.ts                 ← İKİ YÜZEY (§9.1):
      app.module.ts              /v1/*        dış sözleşme — donuk, sürümlü
      migrate.ts              ★  /v1/panel/*  iç BFF — serbestçe değişir
      infra/                     init: advisory lock'lu migration (§11)
        db/db.service.ts      ← tek DB giriş noktası (bare getDb yasak)
        db/db.module.ts
        cls/request-context.ts
        logging/pino.config.ts
        health/health.controller.ts
      identity/               ← oturum, OTP, membership, api-key, impersonation
        guards/session.guard.ts        ← cookie: panel + sakin portalı
        guards/api-key.guard.ts        ← muhasebe yazılımı / yönetim şirketi
        guards/mobile-jwt.guard.ts     ★ Faz 17: access + refresh token
        guards/internal.guard.ts       ← worker → api
        guards/tenant-context.guard.ts ← dördünü tek Ctx'e indirger
        guards/permission.guard.ts     ← @RequirePermission('unit:read')
      tenancy/                ← tenant, abonelik, plan, kampanya (platform)
      property/               ← blok, birim, sakin, adres, sayaç
      finance/                ← aidat planı, borç, tahsilat, gider, dağıtım,
                                 gecikme, banka mutabakat, borcu-yoktur
      operations/             ← talep+SLA, bakım, rezervasyon, personel, belge
      governance/             ← toplantı, anket, hukuk, denetim, KVKK
      communication/          ← duyuru, şablon, WhatsApp/SMS/mail, bildirim
      insight/                ← dashboard, rapor, simülatör, NPS
      integration/            ← webhook alıcıları, göç (Excel) import
    test/                     ← supertest e2e + testcontainers RLS testleri

  worker/                     ★ YENİ — NestJS standalone + BullMQ consumer
    src/
      main.ts
      scheduler.module.ts     ← 19 repeatable job (vercel.json'ın yerine)
      processors/*.processor.ts

  app/                        Next.js panel — SADELEŞİR
    src/
      lib/
        api/client.ts         ★ tipli fetch istemcisi (contracts'tan)
        api/server.ts         ★ RSC tarafı: cookie forward + React cache()
        context.ts            ← sadece oturum okur, DB'ye dokunmaz
      app/panel/**            ← yönetici paneli: sunum + actions API çağırır
      app/sakin/**            ★ sakin portalı (4.1.16) — AYRI APP DEĞİL.
                                 Aynı app, aynı kabuk/tema/oturum, aynı API.
                                 İki taraf farklı kabuk isterse URL'i
                                 değiştirmeyen route group'a sarılır:
                                 (yonetim)/panel/** ve (portal)/sakin/**
      ✗ lib/queries/*         ← SİLİNİR, apps/api'ye taşınır
      ✗ app/api/v1/*          ← SİLİNİR, apps/api'de /v1 olarak BİREBİR yaşar
      ✗ app/api/cron/*        ← SİLİNİR, worker'a geçer
      ✗ package.json'da @yonetim/db  ← KALDIRILIR (sert kapı, §15)

  web/                        Next.js pazarlama — landing builder buraya

packages/
  contracts/                  ★ YENİ — Zod şema + tip + hata kodu sözleşmesi
  ui/                         shadcn/Radix üzerine YENİDEN KURULUR
  db/                         Drizzle şema + migration — SADECE api & worker
  core/ config/ i18n/ seo/    değişmez
  dues/ pricing/ kvkk/ bank/  değişmez (zaten saf, api tarafından tüketilir)
  payment/ notifications/ …
  ✗ jobs/                     → apps/worker'a taşınır

infra/
  docker/
    docker-compose.yml        ← geliştirme
    docker-compose.prod.yml   ← self-host üretim
    Dockerfile.api  Dockerfile.worker  Dockerfile.app  Dockerfile.web
    caddy/Caddyfile           ← reverse proxy + TLS
  ci/ci.yml
```

---

## 6. Bounded context → modül → ekran → boşluk haritası

Sekiz bağlam. Her satır bir Nest modülü; son kolon GAP-DURUM §4'teki hangi
boşluğun burada kapanacağını gösteriyor.

### 6.1 identity
| Modül | Sorumluluk | Kalan boşluk |
| --- | --- | --- |
| `session` | OTP, cookie doğrulama, Redis oturum önbelleği (**60 sn TTL**) | — |
| `mobile-auth` | **access + refresh token akışı** — cookie'siz istemciler | **Faz 17** |
| `membership` | rol, çoklu üyelik, yetki matrisi | — |
| `api-key` | hash'li anahtar, scope, anahtar başına hız sınırı | — |
| `impersonation` | platform admin taklit + denetim | — |

### 6.2 tenancy
| Modül | Sorumluluk | Kalan boşluk |
| --- | --- | --- |
| `tenant` | site kaydı, durum, kurulum | — |
| `subscription` | abonelik, deneme, dunning, yenileme | — |
| `plan` / `campaign` | `packages/pricing` + `campaigns` sarmalayıcı | — |

### 6.3 property
| Modül | Sorumluluk | Kalan boşluk |
| --- | --- | --- |
| `block` / `unit` | blok + birim CRUD, toplu üretim | — |
| `resident` | tek cari, ilişki yaşam döngüsü, KVKK onayı | — |
| `meter` | sayaç tanımı, **okuma girişi, tüketim trendi** | **4.1.5** |

### 6.4 finance
| Modül | Sorumluluk | Kalan boşluk |
| --- | --- | --- |
| `dues-plan` | plan CRUD, `packages/dues` motoru | — |
| `debt` | borçlandırma, taksit, paylaşım, düzeltme+gerekçe | — |
| `payment` | tahsilat, mahsup, iyzico | — |
| `expense` | kategori, gider, onay akışı, daireye dağıtım | — |
| `bank` | `packages/bank` + **hareket eşleştirme arayüzü** | **4.1.15** |
| `certificate` | **"Borcu Yoktur" PDF + KEP** | **5.3** |

### 6.5 operations
| Modül | Sorumluluk | Kalan boşluk |
| --- | --- | --- |
| `request` | **talep thread, atama, SLA paneli** | **4.1.9** |
| `maintenance` | **plan + T-30/-15/-7/-0/+3 hatırlatma** | **5.5 / 4.1.10** |
| `reservation` | **takvim görünümü, çakışma kontrolü** | **4.1.8** |
| `staff` | **personel + bordro** | **4.1.11** |
| `document` | belge, süre bitimi uyarısı, **S3 depolama** | **dosya yükleme** |

### 6.6 governance
| Modül | Sorumluluk | Kalan boşluk |
| --- | --- | --- |
| `meeting` | **çağrı, gündem, tutanak, karar defteri** | **4.1.7** |
| `survey` | **anket + NPS akışı** | **4.1.7** |
| `legal` | **icra takibi, kademe yükseltme** | **4.1.7** |
| `audit` | append-only kütük, **diff görselleştirme** | **4.1.14** |
| `kvkk` | **talep gelen kutusu + 72 saat geri sayım**, imha | **4.1.13** |

### 6.7 communication
| Modül | Sorumluluk | Kalan boşluk |
| --- | --- | --- |
| `announcement` | **zamanlama + hedef kitle arayüzü** (şema hazır) | **4.1.6** |
| `template` | `message_templates`, **Meta onay akışı** | **5.1** |
| `whatsapp` | bot, **conversation log arayüzü** | **5.1** |
| `notification` | **olay → bildirim üretimi** (arayüz hazır, üretim yok) | **4.6.5** |

### 6.8 insight
| Modül | Sorumluluk | Kalan boşluk |
| --- | --- | --- |
| `dashboard` | toplu metrik, **widget mimarisi / sürükle-bırak** | **4.3.4** |
| `report` | **raporlar modülü** + Excel/PDF export | **6.13** |
| `simulator` | `packages/dues/simulator` + **bütçe arayüzü** | **5.4** |

### 6.9 integration
| Modül | Sorumluluk | Kalan boşluk |
| --- | --- | --- |
| `webhook` | Meta, iyzico, banka | — |
| `migration` | **Excel import + alan eşleme sihirbazı** | **4.1.17** |

**Bağlam dışı kalan boşluklar:** 4.1.16 sakin portalı (`apps/app/sakin/**`,
aynı API'yi tüketir), 5.8 landing builder + 4.5 motion (`apps/web`), 4.8.1–4.8.2
gözlemlenebilirlik (§14 Track D), ESLint yapılandırması (§15).

---

## 7. Sözleşme katmanı — `packages/contracts`

Tek doğruluk kaynağı. Nest DTO'su, OpenAPI şeması, Next form doğrulaması ve
istemci tipi **aynı Zod nesnesinden** türüyor. Codegen adımı yok — monorepo
içinde iki taraf da TypeScript.

> **Önkoşul:** `zod` `^3.24.1` → `^3.25` (minor bump). `nestjs-zod@5`'in peer'i
> `^3.25.0 || ^4.0.0`. Projede zod kullanan **14 dosya** var; Zod 4'e tam geçiş
> ayrı ve opsiyonel bir iş, şimdi gerekmiyor.

```ts
// packages/contracts/src/property/unit.contract.ts
import { z } from "zod";
import { listQuery, paginated } from "../_shared/list";
import { moneyMinor, tcknInput } from "../_shared/fields";

export const unitCreate = z.object({
  blockId: z.string().uuid(),
  doorNumber: z.string().min(1).max(16),
  floor: z.coerce.number().int().min(-5).max(80),
  grossArea: z.coerce.number().positive(),
  landShareNumerator: z.coerce.number().int().positive().optional(),
  landShareDenominator: z.coerce.number().int().positive().optional(),
  lateFeeExempt: z.boolean().default(false),
});

export const unitListQuery = listQuery.extend({
  blockId: z.string().uuid().optional(),
  status: z.enum(["occupied", "vacant", "all"]).default("all"),
  trashed: z.coerce.boolean().default(false),
});

export const unitRow = z.object({
  id: z.string().uuid(),
  doorNumber: z.string(),
  blockName: z.string(),
  residentName: z.string().nullable(),
  openDebtMinor: moneyMinor,          // kuruş — asla float
  lateFeeExempt: z.boolean(),
});

/** Ekran odaklı yanıt: liste + facet + toplam tek çağrıda (§9). */
export const unitListResponse = paginated(unitRow).extend({
  facets: z.object({
    byBlock: z.array(z.object({ blockId: z.string(), name: z.string(), count: z.number() })),
    occupied: z.number(),
    vacant: z.number(),
  }),
  totals: z.object({ openDebtMinor: moneyMinor }),
});

export type UnitCreate = z.infer<typeof unitCreate>;
export type UnitListResponse = z.infer<typeof unitListResponse>;
```

```ts
// packages/contracts/src/_shared/error.ts
/** Tek hata zarfı — GAP-DURUM'da /api/v1 için kurulmuş sözleşme korunuyor. */
export const apiError = z.object({
  error: z.object({
    code: z.enum([
      "unauthorized", "forbidden", "not_found", "validation_failed",
      "conflict", "rate_limited", "consent_required", "preview_required",
      "reason_required", "internal",
    ]),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});
```

`preview_required` ve `reason_required` kodları, GAP-DURUM kararları 8 ve 9'u
(önizleme zorunlu, gerekçesiz düzeltme yok) **protokol seviyesine** taşıyor.
Artık bu kural UI'ın iyi niyetine değil API'ye bağlı.

---

## 8. Kimlik ve RLS köprüsü — planın en kritik parçası

### 8.1 Oturum otoritesi tek yerde

Next **oturum çözmez**, cookie'yi olduğu gibi Nest'e iletir. Alternatif (Next'in
iç JWT üretmesi) daha az hop demekti ama Next'e "ben bu tenant'ın adminiyim"
iddiasını imzalama yetkisi verirdi. Tek otorite Nest; iptal (revocation) anında
etkili.

Maliyeti istek başına bir oturum aramasıdır; **Redis'te 60 sn TTL** ile kapanır.
Bu sayı bir denge: daha uzunu, yetkisi alınmış bir kullanıcının o süre boyunca
çalışmaya devam etmesi demek; daha kısası ölçülebilir fayda vermeden Redis'e yük
bindiriyor. Rol değişimi ve oturum kapatma önbelleği **anında düşürür**
(invalidation), yani 60 sn yalnızca en kötü durum penceresi.

**Dört kimlik yolu, tek çıktı.** Mobil (Faz 17) cookie kullanamayacağı için ayrı
bir access + refresh token akışı alır — ama `RequestContext`'e vardığı an diğer
üçünden ayırt edilemez hale gelir. Yetki, RLS ve denetim tek kod yolunda kalır:

```ts
// apps/api/src/identity/guards/tenant-context.guard.ts
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly resolver: ContextResolver,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async canActivate(exec: ExecutionContext): Promise<boolean> {
    const req = exec.switchToHttp().getRequest();

    // Dört kimlik yolu, tek çıktı: RequestContext
    const ctx =
      (await this.resolver.fromSessionCookie(req)) ??   // panel + sakin portalı
      (await this.resolver.fromMobileJwt(req)) ??       // Faz 17 mobil
      (await this.resolver.fromApiKey(req)) ??          // muhasebe yazılımı
      (await this.resolver.fromInternalToken(req));     // worker → api

    if (!ctx) throw new UnauthorizedException();

    this.cls.set("ctx", {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      roles: ctx.roles,
      scopes: ctx.scopes,
      impersonatedBy: ctx.impersonatedBy,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      locale: ctx.locale,
      requestId: req.headers["x-request-id"] ?? randomUUID(),
    });
    return true;
  }
}
```

### 8.2 Veritabanına tek kapı

```ts
// apps/api/src/infra/db/db.service.ts
import { withTenant, withPlatform, withBypassRls, type Database } from "@yonetim/db";

@Injectable()
export class DbService {
  constructor(private readonly cls: ClsService<RequestContext>) {}

  /**
   * Tenant kapsamlı transaction. set_config(..., true) transaction-local
   * olduğu için pool'da sızma yok. Repository'ler YALNIZ bunu kullanır.
   */
  async tx<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    const ctx = this.cls.get("ctx");
    if (!ctx?.tenantId) throw new ForbiddenException("tenant_context_missing");
    return withTenant(ctx.tenantId, fn, { userId: ctx.userId, role: ctx.roles[0] });
  }

  /** Gerekçeli düzeltme — GAP-DURUM kararı 9. Trigger app.change_reason'ı okur. */
  async txWithReason<T>(reason: string, fn: (tx: Database) => Promise<T>): Promise<T> {
    if (reason.trim().length < 10) throw new BadRequestException("reason_required");
    return this.tx(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.change_reason', ${reason}, true)`);
      return fn(tx);
    });
  }

  /** Platform (tenant'sız) — abonelik, plan, kampanya. */
  platform<T>(fn: (tx: Database) => Promise<T>) { return withPlatform(fn); }

  /**
   * RLS baypası. GAP-DURUM kararı 14 korunuyor: gerekçe zorunlu, kapsam dar.
   * Ek olarak artık her çağrı otomatik denetime yazılıyor — 199 çağrı yerini
   * tek kapıya indirmenin kazancı bu.
   */
  async bypass<T>(reason: string, fn: (tx: Database) => Promise<T>): Promise<T> {
    const ctx = this.cls.get("ctx");
    this.logger.warn({ event: "rls.bypass", reason, userId: ctx?.userId });
    return withBypassRls(reason, fn);
  }
}
```

### 8.3 Zorunlu değişmezler (invariants)

Bunlar yorum değil, §15'te makine tarafından denetlenen kurallar:

1. `apps/api` içinde `getDb()` / `getAdminDb()` **yalnız** `db.service.ts`'de çağrılır.
2. Her sorgu bir transaction içindedir. Transaction dışı sorgu = RLS'siz sorgu.
3. `apps/app` **hiçbir koşulda** `@yonetim/db` import etmez.
4. TCKN/IBAN şifre çözme anahtarı yalnız `apps/api` ortamında bulunur.
5. KVKK `data_access_logs` kaydı, **yanıtta dönen** kişi kümesiyle birebir yazılır
   (GAP-DURUM kararı 14'ün korunması) — interceptor'da değil, servis içinde,
   çünkü hangi kişinin gerçekten döndüğünü yalnız servis bilir.

### 8.4 KVKK erişim kaydının taşınması — dikkat noktası

Bugün `residents/page.tsx` ekranda görünen kişiyi loglıyor. HTTP'ye geçişte bu
kayıt Nest'e taşınıyor. **Yanlış yapılırsa** log "API 50 kişi döndürdü" der ama
kullanıcının ekranında 12 kişi vardır. Kural: sayfalama sunucuda yapıldığı için
API'nin döndürdüğü küme = ekrandaki küme. Bu, §9'daki "ekran odaklı uç" tasarımının
yan faydası; kaydın doğruluğu tasarımdan geliyor, disiplinden değil.

### 8.5 Dikey dilim iskeleti — `property/unit`

A1'de kanıtlanacak desen. Üç katman, her birinin tek sorumluluğu var:
**controller** HTTP ve yetki, **service** iş akışı ve KVKK kaydı, **repository**
SQL. Diğer 40+ modül bu şablonu kopyalar.

```ts
// apps/api/src/property/unit/unit.repository.ts — SQL YALNIZ BURADA
@Injectable()
export class UnitRepository {
  constructor(private readonly db: DbService) {}

  async list(q: UnitListQuery): Promise<UnitListResponse> {
    return this.db.tx(async (tx) => {
      const where = and(
        q.trashed ? isNotNull(units.deletedAt) : isNull(units.deletedAt),
        q.blockId ? eq(units.blockId, q.blockId) : undefined,
        q.search ? ilike(units.doorNumber, `%${q.search}%`) : undefined,
      );

      // Liste + facet + toplam TEK turda (§9a). Ekran 4 sorgu yapmıyor.
      const [rows, facets, totals] = await Promise.all([
        tx.select({ /* … unitRow projeksiyonu */ })
          .from(units).where(where)
          .orderBy(orderBy(q.sort, q.dir))
          .limit(q.perPage).offset((q.page - 1) * q.perPage),
        tx.select({ blockId: units.blockId, count: count() })
          .from(units).where(where).groupBy(units.blockId),
        tx.select({ openDebtMinor: sum(debts.amountMinor) })
          .from(debts).where(/* açık borçlar, aynı filtre */),
      ]);

      return { rows, facets: toFacets(facets), totals: totals[0], page: q.page, … };
    });
  }
}
```

```ts
// apps/api/src/property/unit/unit.service.ts — iş akışı, KVKK, olay
@Injectable()
export class UnitService {
  constructor(
    private readonly repo: UnitRepository,
    private readonly access: DataAccessLogger,
    private readonly events: EventEmitter2,
  ) {}

  async list(q: UnitListQuery): Promise<UnitListResponse> {
    const result = await this.repo.list(q);
    // §8.4: DÖNEN kümeyi logla — ekranda görünenle birebir örtüşür.
    await this.access.record("unit.list", result.rows.map((r) => r.id));
    return result;
  }

  async update(id: string, dto: UnitUpdate, reason: string) {
    // GAP-DURUM kararı 9: gerekçe DB trigger'ına oturum değişkeniyle geçer.
    const before = await this.repo.byId(id);
    const after = await this.repo.updateWithReason(id, dto, reason);
    this.events.emit("unit.updated", { id, before, after });   // → §10 bildirim
    return after;
  }
}
```

```ts
// apps/api/src/property/unit/unit.controller.ts — HTTP + yetki
@Controller("v1/panel/units")
@UseGuards(TenantContextGuard, PermissionGuard)
export class UnitController {
  constructor(private readonly service: UnitService) {}

  @Get()
  @RequirePermission("unit:read")
  @ZodSerializerDto(unitListResponse)
  list(@Query(new ZodValidationPipe(unitListQuery)) q: UnitListQuery) {
    return this.service.list(q);
  }

  @Patch(":id")
  @RequirePermission("unit:write")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(unitUpdate)) dto: UnitUpdate,
    @ChangeReason() reason: string,   // yoksa 400 reason_required
  ) {
    return this.service.update(id, dto, reason);
  }
}
```

**Next tarafında karşılığı** — `page.tsx` sunuma iner, `actions.ts` API'ye yazar:

```tsx
// apps/app/src/app/panel/birimler/page.tsx
export default async function UnitsPage({ searchParams }: PageProps) {
  const ctx = await requirePermission("unit:read");        // sadece oturum
  const data = await apiGet(
    `/v1/panel/units?${toQuery(await searchParams)}`,
    unitListResponse,                                       // contracts'tan
  );
  return <UnitsTable data={data} can={can(ctx, "unit:write")} />;
}
```

```ts
// apps/app/src/app/panel/birimler/actions.ts
"use server";
export const updateUnit = action(unitUpdate, async (dto, { id, reason }) =>
  apiPatch(`/v1/panel/units/${id}`, dto, { reason }),
);
```

Server Action **korunuyor** (form deseni, `useActionState`, revalidation aynı) —
değişen tek şey içinin SQL değil HTTP olması.

---

## 9. İki API yüzeyi ve chattiness

### 9.1 `/v1/*` donuk, `/v1/panel/*` serbest

Ekran odaklı uçlar (§9a) iç ihtiyaca göre sık değişir. Muhasebe yazılımının
tükettiği sözleşme ise **kırılmamalı**. Bu ikisi aynı yolda yaşayamaz:

| Yüzey | Tüketici | Değişim politikası |
| --- | --- | --- |
| `/v1/*` | Muhasebe yazılımı, yönetim şirketi paneli, mobil (Faz 17) | **Donuk.** Mevcut `/api/v1` sözleşmesi (units, debts, expenses, residents + OpenAPI 3.1 + `{error:{code,message,details}}` zarfı) **birebir** korunur. Kırıcı değişiklik `/v2` açar. |
| `/v1/panel/*` | Yalnız `apps/app` (panel + sakin portalı) | **Serbest.** Ekran değişince uç değişir; sürüm garantisi yok. İstemcisi aynı repoda olduğu için tip güvenliği derleme zamanında yakalanır. |

İkisi de aynı servisleri çağırır — ayrım yalnız **projeksiyon ve sözleşme
garantisinde**. `UnitService.list()` tektir; `/v1/units` sabit alan kümesi
döndürür, `/v1/panel/units` facet ve toplamları da ekler.

GAP-DURUM kararı 11 bu yüzeyde de geçerli: `/v1/residents` okuma ucunda telefon
maskeli, TCKN hiç dönmüyor; yazma ucu ancak KVKK aydınlatma onayı kanıtıyla
(`consentVersion` + `consentAt`) kabul ediyor, aksi halde `consent_required`.

### 9.2 Hop sayısı

Ayrı process'in tek gerçek bedeli bu. Üç önlem:

**(a) Ekran odaklı uçlar, CRUD değil.** `birimler` listesi bugün liste + facet +
toplam + blok listesi için 4 sorgu yapıyor. Uç **tek** yanıt döner
(`unitListResponse`, §7). Kural: *bir ekran = bir çağrı.* Detay sayfaları için
`?include=residents,debts,meters` ile sekme verisi tek turda gelir.

**(b) İç ağ, TLS yok, keep-alive var.** Docker servis DNS'i üzerinden
`http://api:3000`. Gerçek maliyet ~0.3–1 ms serileştirme; internet RTT'si yok.

**(c) Render içi dedupe.** RSC tarafında React `cache()` sarmalayıcısı — aynı
render pass'inde aynı çağrı bir kez gider.

```ts
// apps/app/src/lib/api/server.ts
import { cache } from "react";
import { cookies, headers } from "next/headers";

const BASE = process.env.API_INTERNAL_URL!;   // http://api:3000

/** RSC tarafı çağrı: cookie'yi ilet, trace id'yi taşı, Zod ile doğrula. */
export const apiGet = cache(async function apiGet<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  const cookie = (await cookies()).toString();
  const requestId = (await headers()).get("x-request-id") ?? crypto.randomUUID();

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { cookie, "x-request-id": requestId, accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) throw await toApiError(res);   // → error.tsx / not-found.tsx
  return schema.parse(await res.json());
});
```

**Sonuç — `talepler/page.tsx` neye dönüşüyor:**

```ts
// ÖNCE: 200 satır çek, SLA'yı JS'te filter ile hesapla
const rows = await withTenant(ctx.tenantId, (tx) =>
  tx.select().from(requests).where(isNull(requests.deletedAt))
    .orderBy(desc(requests.createdAt)).limit(200));
const breached = open.filter((r) => r.slaDueAt && r.slaDueAt < now);

// SONRA: SLA sunucuda, tek çağrı, sayfalanmış
const data = await apiGet(`/v1/requests?${qs}`, requestListResponse);
// data.rows · data.facets.breached · data.metrics.avgResolutionHours
```

SLA ihlali artık SQL'de hesaplanıyor: 200 satır sınırı kalkıyor, sayı doğru,
mantık worker'daki `sla-breach-check` job'ı ile **aynı** kodu kullanıyor.

---

## 10. Worker ve kuyruk

`packages/jobs` → `apps/worker`. 19 `vercel.json` cron tanımı BullMQ repeatable
job'a dönüşür. Kazanç sadece "süre sınırı yok" değil:

| Yeni yetenek | Hangi boşluğu açar |
| --- | --- |
| Gecikmeli job (delayed) | **5.5** bakım hatırlatmaları T-30/-15/-7/-0/+3 — tek tek zamanlanır, günlük tarama gerekmez |
| Uzun süren job + progress | **4.1.17** Excel göç sihirbazı (Vercel'de 300 sn'de ölüyordu) |
| Yeniden deneme + backoff | WhatsApp/SMS gönderimi, iyzico webhook işleme |
| Fan-out | **4.1.6** duyuru hedef kitlesine kanal kanal gönderim |
| Olay kuyruğu | **4.6.5** olay → bildirim üretimi (aşağıda) |
| Zamanlanmış üretim | **6.13** aylık rapor, **5.3** PDF sertifika |

**4.6.5 için mimari:** domain servisleri Nest `EventEmitter2` ile olay yayar
(`debt.created`, `request.sla_breached`, `payment.received`). Bir
`NotificationPolicy` haritası olay → şablon + kanal + alıcı eşlemesini tutar;
worker gönderir. Böylece "hangi olay hangi bildirimi doğurur" sorusu **tek
dosyada** tanımlı olur, 55 dosyaya dağılmaz.

```ts
// apps/worker/src/scheduler.module.ts — vercel.json'ın yerine
const SCHEDULE = [
  { name: "dues.generate-monthly", cron: "0 3 1 * *" },
  { name: "dues.late-fee",         cron: "0 4 * * *" },
  { name: "bank.sync",             cron: "*/30 * * * *" },
  { name: "sla.breach-check",      cron: "*/15 * * * *" },
  { name: "kvkk.retention",        cron: "0 3 * * 0" },
  // … 19 tanım, tek kaynak
] as const;
```

**Not:** worker api'yi HTTP ile değil, servisleri **doğrudan import ederek**
çağırır (aynı monorepo, aynı `DbService`). Tenant bağlamını `ClsService` ile
job payload'undan kurar. Böylece iç trafik sıfır.

---

## 11. Self-host Docker yığını

```yaml
# infra/docker/docker-compose.prod.yml (iskelet)
services:
  caddy:      # TLS + reverse proxy: / → web, /panel → app, /v1 → api
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes: ["./caddy/Caddyfile:/etc/caddy/Caddyfile", "caddy_data:/data"]

  postgres:
    image: postgres:17
    command: ["postgres", "-c", "max_connections=200"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"] }

  redis:      # oturum önbelleği (60 sn TTL) + BullMQ + rate limit
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]

  minio:      # S3 uyumlu: belge, dekont, sertifika PDF'leri
    image: minio/minio
    command: server /data --console-address ":9001"

  api:
    build: { context: ../.., dockerfile: infra/docker/Dockerfile.api }
    # MIGRATION SAHİBİ: init aşamasında migrate.ts, advisory lock ile.
    # Replika sayısı artsa da yalnız biri koşar; worker hiç koşmaz.
    command: ["sh", "-c", "node dist/migrate.js && node dist/main.js"]
    environment:
      DATABASE_URL: postgres://app:***@postgres:5432/yonetim      # RLS'e tabi
      DATABASE_ADMIN_URL: postgres://admin:***@postgres:5432/yonetim  # bypass
      ENCRYPTION_KEY: ***        # ← YALNIZ burada. app'te yok.
      SESSION_CACHE_TTL: "60"
    depends_on: { postgres: { condition: service_healthy }, redis: {} }

  worker:
    build: { dockerfile: infra/docker/Dockerfile.worker }
    # api ile aynı env; ölçeklenebilir: deploy.replicas
    # Migration KOŞMAZ — şemayı hazır bulur.
    depends_on: { api: { condition: service_healthy } }

  app:
    build: { dockerfile: infra/docker/Dockerfile.app }
    environment:
      API_INTERNAL_URL: http://api:3000    # iç ağ, TLS yok
      # DATABASE_URL YOK — kasıtlı. app veritabanını göremez.

  web:
    build: { dockerfile: infra/docker/Dockerfile.web }

volumes: { pgdata: {}, caddy_data: {}, minio_data: {} }
```

**`app` servisine `DATABASE_URL` verilmemesi** en güçlü kalite kapısı: birisi
yanlışlıkla web tarafına SQL yazarsa üretimde ayağa kalkmaz. Kural belgede değil,
altyapıda.

İki Postgres rolü: `app` (RLS'e tabi) ve `admin` (`BYPASSRLS`). Bugün
`getDb`/`getAdminDb` ayrımı bunu zaten varsayıyor — self-host'ta rol ayrımını
gerçekten kuruyoruz.

**Migration'ı yalnız `api` çalıştırır**, init aşamasında, Postgres advisory
lock'u alarak:

```ts
// apps/api/src/migrate.ts
const LOCK = 0x796f6e65;   // 'yone' — sabit, tüm replikalar aynı kilidi ister
await sql`SELECT pg_advisory_lock(${LOCK})`;
try   { await migrate(db, { migrationsFolder: "packages/db/drizzle" }); }
finally { await sql`SELECT pg_advisory_unlock(${LOCK})`; }
```

Replika sayısı artsa da migration bir kez koşar; geç kalan replikalar kilidi
bekler, şemayı hazır bulur ve devam eder. Worker migration'a hiç dokunmaz —
`api` sağlıklı olmadan başlamaz.

---

## 12. UI — tam design system geçişi

`packages/ui`, shadcn/ui + Radix üzerine yeniden kurulur. **Ama üç şey birebir
taşınır, kaybedilirse geçiş başarısız sayılır:**

### 12.1 Taşınması zorunlu olanlar

| Ne | Neden | Nereye |
| --- | --- | --- |
| `styles/tokens.css` — tasarım token'ları | `tests/design-tokens.test.ts` bunu denetliyor; marka kimliği burada | shadcn'in CSS değişken katmanına **eşlenir**, silinmez |
| A11y tercihleri: yazı ölçeği (S/M/L/XL), yüksek karşıtlık, hareket azaltma, `forced-colors` | Gerçek erişilebilirlik çalışması; shadcn bunu vermiyor | `theme/a11y-preferences.tsx` **olduğu gibi kalır** |
| Doğrulanmış 6 tonluk grafik paleti | Renk körlüğü eşiklerini geçiyor (deutan ΔE ≥ 8); eski palet düşüyordu | ECharts tema nesnesine aktarılır (§13) |
| TR'ye özgü alanlar: TCKN/IBAN algoritmik doğrulama, telefon, MoneyInput (POS mantığı), PeriodInput | shadcn karşılığı **yok**; iş değeri burada | Radix `Slot` + RHF üzerine **yeniden sarılır**, mantık korunur |
| `ChartFrame`'in zorunlu tablo görünümü | Açık temada 3 seri rengi 3:1 altında; tablo tek doğru kaynak | Yeni grafik katmanında **zorunlu kalır** |

### 12.2 Kütüphaneye devredilenler

| Alan | Kütüphane | Sürüm | Neden |
| --- | --- | --- | --- |
| Primitives (dialog, popover, select, tabs, tooltip, dropdown…) | `radix-ui` (tek paket) | 1.6.7 | Odak tuzağı/ARIA bakımı bize kalmaz. Tek import — 20 ayrı `@radix-ui/react-*` yok |
| Bileşen katmanı | `shadcn` CLI | 4.15.0 | Kod bizim repo'da kalır (bağımlılık değil, kaynak) → token'larla evlendirmek mümkün |
| Grafik | `echarts` + `echarts-for-react` | 6.1.0 / 3.0.6 | §13 |
| Veri tablosu | `@tanstack/react-table` | 8.21.3 | Headless — sunucu tarafı sayfalama ve URL state'i (karar 6) korunur |
| Form | `react-hook-form` + `@hookform/resolvers` | 7.83.0 / 5.5.7 | `packages/contracts` şemasını **aynen** kullanır; sunucu hâlâ bağlayıcı |
| Tarih | `date-fns` (+ `tr` locale) | 4.4.0 | Elle formatlama biter |
| Takvim | `@schedule-x/react` | 4.1.0 | Rezervasyon (4.1.8) + bakım planı (5.5). MIT, FullCalendar'ın resource timeline'ı ücretli |
| Sürükle-bırak | `@dnd-kit/core` | 6.3.1 | Dashboard widget düzeni (4.3.4) |
| PDF | `@react-pdf/renderer` | 4.5.1 | Sunucuda "Borcu Yoktur" (5.3) + raporlar. Chromium gerekmez → küçük imaj, deterministik çıktı. TR glif'li font gömülür |
| Excel | `exceljs` | 4.4.0 | Göç sihirbazı (4.1.17) + rapor export. SheetJS'in lisans/CVE geçmişi nedeniyle tercih edilmedi |
| Depolama | `@aws-sdk/client-s3` | 3.x | MinIO/R2, presigned PUT. Mevcut `FileInput` doğrudan kullanılabilir |

### 12.3 Bundle bütçesi

Bugün ~158 kB First Load JS. Bu geçiş onu artıracak — kaçınılmaz ve kabul
edilmiş. Ama denetimsiz kalmasın: **bütçe 250 kB**, `@next/bundle-analyzer` +
Lighthouse CI ile CI'da ölçülür (§14 Track D). ECharts yalnız grafik olan
sayfalarda `next/dynamic` ile yüklenir; panel iskeletine girmez.

---

## 13. Grafik katmanı — neden ECharts

Recharts daha kolay entegre olurdu. ECharts'ı seçmemin üç somut nedeni:

1. **`aria.decal` — desen dolgusu.** ECharts serilere otomatik desen atayabiliyor.
   Bu, GAP-DURUM kararı 4'teki asıl sorunu (açık temada 3 seri rengi 3:1
   kontrastın altında) *kütüphane seviyesinde* çözüyor: kimlik renkle değil
   desenle de taşınıyor. Elle SVG'de bunu yazmak yeni bir proje.
2. **Yol haritasının ihtiyacı.** Forecast güven bandı (5.4 bütçe simülatörü),
   takvim ısı haritası (bakım/rezervasyon yoğunluğu), gauge (NPS, tahsilat oranı),
   yığılmış kırılım (gider kategorileri), sankey (nakit akışı) — Recharts'ta bunların
   yarısı yok.
3. **Canvas render.** 200 daire × 12 ay veri setinde SVG DOM'u şişiyor; canvas
   şişmiyor.

**Korunacak kurallar** (mevcut `chart.tsx` yorumundaki disiplin ECharts temasına
taşınır): tek eksen — iki farklı ölçek asla iki y ekseninde; renk **seriye** bağlı,
sıralamaya değil; 2+ seride lejant zorunlu; her grafik `ChartFrame` içinde ve
**tablo görünümü zorunlu**; marka laciverti seri rengi olarak kullanılmaz.

`ChartFrame` API'si **aynı kalır** — içi ECharts'a döner. Böylece 24 sayfadaki
kullanım yerleri değişmez.

---

## 14. Yol haritası — dört paralel track

Kritik gözlem: **backend bölünmesi ve UI geçişi farklı dosyalara dokunuyor.**
Paralel yürüyebilirler. Track A ve C birbirini beklemez.

### Track A — Backend iskeleti ve modül göçü (kritik yol) — **TAMAMLANDI**

| Faz | İş | Bitti kriteri |
| --- | --- | --- |
| **A0** | `apps/api` boot, `packages/contracts`, `DbService`, guard'lar, ALS, pino, health probe, advisory lock'lu `migrate.ts`, Docker'a `api` servisi. zod `^3.25` bump. **ESLint yapılandırması** (§15'in üç kapısı buna bağlı). | `GET /health` yeşil, `/v1/docs` OpenAPI üretiyor, `pnpm lint` hatasız koşuyor. Davranış değişikliği **sıfır**. |
| **A1** | **Dikey dilim: `property/unit`.** Contract + modül + repo + `apps/app/panel/birimler` istemciye geçiş. RLS, KVKK log, liste parametreleri, tipli istemci — hepsi bu dilimde kanıtlanır. | `birimler/**` içinde SQL yok; testcontainers ile RLS testi geçiyor. |
| **A2** | `finance` (en büyük bağlam): debt, payment, expense, dues-plan. `lib/queries/{debts,expenses}.ts` → api. | `borclar/**`, `giderler/**`, `aidat/**` SQL'siz. Önizleme + gerekçe kuralları `preview_required`/`reason_required` ile API'de. |
| **A3** | `property/resident` + `identity`. TCKN şifre çözme yalnız api'de. `identity`'ye **`mobile-auth`** (access + refresh) dördüncü strateji olarak eklenir — Faz 17 beklemesin, kimlik yolları tek seferde otursun. | `sakinler/**` SQL'siz; `ENCRYPTION_KEY` app env'inden **çıkarılır**; dört kimlik yolu da aynı `RequestContext`'i üretiyor (e2e test). |
| **A4** | `insight` (dashboard, `lib/queries/dashboard-charts.ts`) + `governance/audit`. | `panel/page.tsx` tek API çağrısı. |
| **A5** | Kalan 24 `page.tsx`: operations, communication, tenancy, integration. `/api/v1` **birebir** api'ye taşınır (§9.1: dış sözleşme donuk) ve Next'ten silinir. | **`apps/app/package.json`'dan `@yonetim/db` ve `drizzle-orm` kaldırılır.** Sert kapı. Eski `/v1` yanıtları sözleşme testiyle bit-bazlı doğrulanır. |

**Track A durumu: A0–A5 tamamlandı.** `apps/app` içinde `@yonetim/db`,
`drizzle-orm` ve `@yonetim/jobs` importu **sıfır**; bağımlılıklar
`package.json`'dan kaldırıldı ve `eslint.config.mjs`'teki
`PENDING_DB_MIGRATION` muafiyet listesi **boşaldı**. Artık kural iki katmanlı:
lint kuralı niyeti anlatıyor, paket bağımlılığının yokluğu ihlali fiziksel
olarak imkânsız kılıyor.

A5'te ayrıca beklenenden fazlası taşındı, çünkü hepsi aynı değişmezin
(§8.3 değişmez 3) ihlaliydi:

| Taşınan | Nereye | Neden zorunluydu |
| --- | --- | --- |
| `/api/v1/{units,debts,expenses,residents}` + OpenAPI | `apps/api` `PublicModule` | Dış sözleşme; adres ve zarf **aynı** kaldı (Caddy `/api/v1*` → api). |
| Oturum açma/kapama (magic link + SMS OTP) | `identity/web-auth.service.ts` | Oturumun tek otoritesi api (§8.1). Çerezi app yazıyor, kararı api veriyor. |
| `lib/context.ts` bağlam çözümü | `GET /v1/auth/context` | Render katmanı kendi yetkisini imzalayamamalı. |
| Kabuk rozetleri + bildirim merkezi | `insight/shell`, `communication/notification` | Panelin her sayfasında çalışan sorgular. |
| Sakin portalı + ödeme başlatma | `property/resident/portal`, `finance/portal-payment` | Ödenecek tutar artık istemciden gelmiyor, sunucuda türüyor. |
| WhatsApp ve iyzico webhook'ları | `communication/whatsapp`, `integration/payment` | Bot ve mahsup veritabanına yazıyor. Next'te kalan yalnız adresi koruyan ince aktarım. |
| Zamanlanmış işler (`/api/cron/[job]`) | `POST /internal/cron/:job` (`CRON_SECRET`) | `@yonetim/jobs` DB'ye yazıyordu; dolaylı bir delikti. |
| Belge doğrulama, NPS widget'ı, platform paneli | `PublicModule`, `tenancy/platform` | Halka açık ya da tenant sınırı dışı sorgular. |
| Denetim kütüğü yazımı (`lib/audit.ts`) | `governance/audit` (silindi) | §8.4: kayıt **gerçekten değişen** veriyle, servis içinde yazılır. |

### Track B — Worker ve kuyruk — **TAMAMLANDI**

| Faz | İş |
| --- | --- |
| **B0** | Redis + BullMQ + `apps/worker` iskeleti; `packages/jobs` taşınır. |
| **B1** | 19 cron → repeatable job. `vercel.json` ve `/api/cron/[job]` silinir. |
| **B2** | Olay kuyruğu + `NotificationPolicy` → **4.6.5** kapanır. |
| **B3** | Uzun iş altyapısı (progress + iptal) → **4.1.17** göç sihirbazının önkoşulu. |

**Track B durumu: B0–B3 tamamlandı.**

- **B0/B1** — `apps/worker` NestJS standalone; zamanlamayı açılışta Redis'e
  **uzlaştırarak** yazıyor (eksik ekle, değişen yeniden kur, tanımdan çıkanı
  **sil**). `vercel.json` ve `gen-vercel.ts` silindi. `CRON_SECRET` de düştü:
  elle tetikleme artık `POST /v1/panel/platform/jobs/:job/run`, platform
  yöneticisi kimliğiyle. Dağıtılmayan sır sızmaz.
- **B2** — `packages/notifications/src/policy.ts`: "hangi olay hangi bildirimi
  doğurur" sorusunun **tek** cevabı. Üç karar bilinçli olarak ayrı yerde:
  olay oldu mu (domain servisi), bildirim doğar mı ve kime (politika), hangi
  kanaldan ve ne zaman (`router.ts`). Api olayı kuyruğa köprülüyor
  (`EventEmitter2` süreç içi), worker gönderiyor.
- **B3** — `job_runs` tablosu + `JobRunService`. İptal bir **bayrak**
  (`cancelling`), kuyruktan silme değil: silinen job yarısını yazmış olabilir
  ve o hâlde durdurmak veriyi tutarsız bırakır. İş kendi döngüsünde bayrağı
  okuyup temiz bir noktada duruyor.

Gövdesi henüz yazılmamış 16 iş `skipped: no_handler` raporluyor — sessizce
başarılı sayılmıyor. Gövdeler Track E'de ilgili modülle birlikte geliyor.

### Track C — Design system (A'dan bağımsız)

| Faz | İş |
| --- | --- |
| **C0** | shadcn kurulumu, token eşlemesi, a11y tercihlerinin korunduğunun kanıtı (`design-tokens.test.ts` yeşil). |
| **C1** | Primitives Radix'e: overlay, tabs, select, tooltip, dropdown. |
| **C2** | `ChartFrame` içi ECharts'a döner; API sabit, 24 kullanım yeri değişmez. |
| **C3** | Tablolar TanStack Table'a; URL state ve sunucu sayfalaması korunur. |
| **C4** | Formlar RHF + contracts şeması; TR alanları yeniden sarılır. |

### Track D — Gözlemlenebilirlik ve kapılar (**4.8.1–4.8.2**) — **KISMEN**

Sentry (`@sentry/nestjs` + `@sentry/nextjs` 10.68), OpenTelemetry trace
(app → api → worker, `x-request-id` ile), Web Vitals, PostHog, Lighthouse CI,
bundle analyzer, `dependency-cruiser` kuralları, testcontainers RLS testi.

**Yapılanlar:**

- **`dependency-cruiser` kuralları** — §15'in üç kapısından ikisi artık
  makine tarafından zorlanıyor. ESLint "kim neyi import ediyor" sorusunu dosya
  bazında cevaplıyor; burası **grafik** üzerinden cevaplıyor ve fark kritik:
  ESLint dolaylı yolu göremez. `apps/app → @yonetim/jobs → @yonetim/db`
  zinciri A5'te tam olarak böyle keşfedildi. Kuralların gerçekten ısırdığı
  ihlal enjekte edilerek doğrulandı. CI'da `pnpm arch`.
- **Sentry** — api, worker ve app. DSN yoksa hiç kurulmuyor. `sendDefaultPii`
  kapalı, çerez/yetki başlığı/istek gövdesi budanıyor ve hata **mesajının
  içindeki** TCKN/IBAN kalıpları maskeleniyor (bir doğrulama hatası
  "12345678901 geçersiz" diyebilir). Yalnız 5xx gönderiliyor.
- **İz kimliği** app → api → worker. Worker'ın pino'su ALS'den `requestId`
  okuyor; `genReqId` HTTP'siz süreçte hiç çalışmıyordu.
- **Web Vitals** — kendi ucumuza, Sentry'ye değil: soru "p75 LCP kaç" ve bu
  ancak toplulaştırılmış veriyle cevaplanır. Yol **şablona** indirgeniyor
  (`/panel/borclar/[id]`) — bir daire kimliği metrik etiketine düşerse,
  performans verisi kimin neye baktığını sızdıran bir kayda dönüşürdü.
- **Bundle analyzer** — `ANALYZE=true`. `transpilePackages` listesi de
  A5 sonrası gerçeğe göre kısaltıldı.

**Yapılmayanlar ve nedenleri:**

- **OpenTelemetry** — `x-request-id` korelasyonu üç süreçte de çalışıyor ve
  bugünkü soruları (hangi istek, hangi job, hangi hata) cevaplıyor. OTel'in
  ek getirisi span düzeyinde zamanlama; bunu değerlendirecek bir toplayıcı
  (Tempo/Jaeger) altyapıda yok. Toplayıcısız enstrümantasyon, maliyeti olan
  ama okuyanı olmayan bir kayıt üretir.
- **PostHog / Lighthouse CI** — ikisi de dış hesap ve barındırılan bir URL
  gerektiriyor; kurulum yapılandırma değil, operasyon kararı.
- **testcontainers RLS testi** — `tests/integration/rls.test.ts` zaten var ve
  CI'da gerçek Postgres servisiyle koşuyor. Testcontainers'a geçirmek aynı
  güvenceyi farklı bir mekanizmayla verirdi; kazanç yerel çalıştırma kolaylığı,
  bedeli CI'da ikinci bir Docker katmanı.

> **ESLint bu track'te değil, A0'da.** Projede bugün hiç yapılandırma yok
> (`pnpm lint` interaktif kurulum istiyor) ve §15'teki üç kapı ona bağlı —
> Track D'yi beklerse göç boyunca hiçbir kapı çalışmaz.

### Track E — Yeni özellikler (A ve C fazları bittikçe)

Sırası GAP-ANALYSIS §6 önceliklendirmesini izler; her biri artık **tek modül işi**:

1. **5.3** Borcu Yoktur PDF + KEP · **5.4** bütçe simülatörü (C2 sonrası)
2. **5.5/4.1.10** bakım planı + hatırlatma (B1 sonrası) · **4.1.6** duyuru zamanlama
3. **5.1** WhatsApp paneli · **4.1.9** talep/SLA · **4.1.13** KVKK gelen kutusu
4. **4.1.16 sakin portalı** — en büyük parça, ve bölünmenin en net kazancı:
   aynı API'yi tüketen ikinci istemci, sıfır mantık kopyası. `apps/app/sakin/**`
   içinde; ayrı app, ayrı deploy, ayrı oturum **yok** (§5)
5. **4.1.8** rezervasyon takvimi · **4.1.5** sayaç okuma · **4.1.15** banka eşleştirme
6. **4.1.11** bordro · **4.1.7** anket/toplantı/hukuk · **4.1.14** denetim diff
7. **6.13** raporlar · **4.3.4** widget dashboard · **4.1.17** göç sihirbazı
8. **5.8** landing builder · **4.5** motion (`apps/web`)

---

## 15. Kalite kapıları — kural değil, mekanizma

| Kapı | Nasıl | Neyi korur |
| --- | --- | --- |
| `apps/app` DB göremez | `eslint no-restricted-imports` + `apps/app` env'inde `DATABASE_URL` yok + `dependency-cruiser` (18.1.0) kuralı | §8.3 değişmez 3 |
| Bare `getDb()` yok | `dependency-cruiser`: `@yonetim/db` yalnız `infra/db/**`'den erişilebilir | §8.3 değişmez 1–2 |
| RLS gerçekten çalışıyor | `testcontainers` (12.0.4) ile gerçek Postgres: A tenant'ının B'nin satırını **göremediğini** kanıtlayan test | Çok kiracılı izolasyon |
| Önizleme/gerekçe zorunluluğu | Contract seviyesinde `preview_required` / `reason_required`; e2e test | GAP-DURUM kararları 8, 9 |
| Token/a11y regresyonu yok | Mevcut `design-tokens.test.ts` + `axe` ile smoke | §12.1 |
| Bundle bütçesi | Lighthouse CI + bundle analyzer, **250 kB** eşiği | §12.3 |
| Sözleşme uyumu | `packages/contracts` tek kaynak; OpenAPI CI'da diff'lenir | İstemci–sunucu kayması |
| **`/v1` donuk kalıyor** | Göç öncesi yanıtlar altın dosyaya (golden file) alınır; CI her build'de `/v1/*` çıktısını bunlarla karşılaştırır. Fark = kırmızı. | §9.1 dış sözleşme; muhasebe entegrasyonu |
| **Migration yarışı yok** | `pg_advisory_lock`; worker migration çalıştırmaz, `api` sağlıklı olmadan başlamaz | §11 |

**ESLint bugün hiç yapılandırılmamış** (GAP-DURUM §4'ün son notu) — bu tablodaki
üç kapı ona bağlı, dolayısıyla Track D'ye değil **A0'a** alındı (§14).

---

## 16. Riskler ve azaltma

| Risk | Etki | Azaltma |
| --- | --- | --- |
| **RLS bağlamı transaction dışına sızar** | Çok kiracılı veri sızıntısı — en ciddi risk | `set_config(…, true)` transaction-local; `DbService` dışında DB erişimi ESLint+dependency-cruiser ile imkânsız; testcontainers kanıt testi |
| **KVKK erişim kaydı ekranla örtüşmez** | Uyum ihlali (§8.4) | Sayfalama sunucuda; log servis içinde, dönen kümeyle yazılır |
| **55 dosyalık göç yarıda kalır** | İki paralel veri yolu, en kötü senaryo | Dikey dilim sırası (A1 → A5), her faz sonunda ilgili klasörde "SQL yok" kontrolü; A5'te bağımlılığın kaldırılması ikili durumu imkânsız kılar |
| **Tam design system geçişi a11y çalışmasını götürür** | Erişilebilirlik gerilemesi | §12.1 taşıma listesi; `design-tokens.test.ts` + axe CI'da; a11y-preferences dosyası **hiç dokunulmaz** |
| **Bundle şişer** | Sahada yavaş panel | 250 kB bütçe + ECharts `next/dynamic` |
| **Hop sayısı render'ı yavaşlatır** | Panel gecikmesi | Ekran odaklı uç (bir ekran = bir çağrı), iç ağ, `cache()` dedupe; A1'de p95 ölçülür ve bütçelenir |
| **İki servis, iki deploy** | Operasyon yükü | Tek compose, tek `pnpm setup`; health/readiness probe; migration'ı yalnız api container'ı çalıştırır |
| **Next 15 → 16 ve drizzle 0.38 → 0.45** | Sürüm borcu birikiyor | Bu plandan **ayrı** tutulur; göç sırasında sürüm yükseltmeyin — iki değişkeni aynı anda oynatmayın |

---

## 17. Kararlaştırılan ayrıntılar

Önceki turda açık bırakılan beş soru **karara bağlandı** ve plana işlendi. Özet
ve gerekçeleri:

| # | Karar | Gerekçe | Nerede |
| --- | --- | --- | --- |
| 1 | **Sakin portalı ayrı app değil.** `apps/app/sakin/**` içinde yaşar; kabuk, tema, oturum ve API istemcisi paylaşılır. İki taraf farklı kabuk isterse URL'i değiştirmeyen route group'a (`(yonetim)` / `(portal)`) sarılır. | Ayrı app = ikinci deploy hedefi, ikinci oturum köprüsü, kopyalanan kabuk. Kazancı yok. Portal zaten aynı API'yi tüketiyor. | §5, §14 Track E-4 |
| 2 | **Mobil için access + refresh token**, `identity` modülünde **dördüncü** kimlik stratejisi. A3'te eklenir, Faz 17'yi beklemez. | Cookie mobilde çalışmıyor. Dört yol da `RequestContext`'e indirgendiği için yetki/RLS/denetim tek kod yolunda kalıyor — sonradan eklemek guard'ı yeniden açmak demekti. | §5, §6.1, §8.1, §14 A3 |
| 3 | **İki API yüzeyi.** `/v1/*` dış sözleşme, **donuk**, kırıcı değişiklik `/v2` açar. `/v1/panel/*` iç BFF, serbestçe değişir. | Ekran odaklı uçlar sık değişir; muhasebe yazılımının sözleşmesi kırılmamalı. Aynı serviste iki farklı değişim hızı ancak ayrı yolla yönetilir. | §9.1, §14 A5, §15 |
| 4 | **Migration'ı yalnız `api` çalıştırır**, init aşamasında `pg_advisory_lock` ile. Worker hiç çalıştırmaz. | Replika sayısı arttığında iki migration yarışırsa şema bozulur. Advisory lock bunu tek satırla imkânsız kılıyor. | §11, §15 |
| 5 | **Oturum önbelleği TTL'i 60 sn**, rol değişimi ve çıkışta anında invalidation. | Daha uzunu, yetkisi alınmış kullanıcının çalışmaya devam etme penceresi. Daha kısası ölçülebilir fayda vermeden Redis'e yük. Invalidation olduğu için 60 sn yalnız en kötü durum. | §6.1, §8.1, §11 |

**Geriye açık karar kalmadı.** Yol haritası A0'dan başlatılabilir.

---

## 18. Sonuç — bu plan neyi satın alıyor

- `apps/app`'te **0 SQL**, 0 `drizzle-orm` importu, 0 `withTenant` çağrısı
  (bugün: 55 dosya, 199 çağrı).
- 199 dağınık RLS bağlam kurulumu → **tek** `DbService`. Baypas artık merkezi ve
  otomatik denetimli.
- İş mantığı tek yerde: sakin portalı, mobil ve muhasebe entegrasyonu aynı
  servisleri tüketir. SLA hesabı ekranla worker'da aynı kod.
- Süre sınırı olmayan worker: 19 job + uzun import + PDF + gecikmeli hatırlatma.
  Kalan boşlukların **6'sı** doğrudan bunu bekliyordu.
- `ENCRYPTION_KEY` web katmanından çıkar; TCKN/IBAN yalnız api'de çözülür.
- Grafikler ve tablolar olgun kütüphanelerde; erişilebilirlik çalışması korunarak.

**Kritik yol:** A0 (iskelet + ESLint) → A1 (dikey dilim, deseni kanıtla) →
A2–A5 (bağlam bağlam göç) → A5 sonunda bağımlılığın kaldırılması.
Track B, C, D bunlara paralel gider; Track E fazlar bittikçe açılır.

**Açık karar kalmadı** (§17). Bir sonraki somut adım **A0**: `apps/api` boot +
`packages/contracts` + `DbService` + dört kimlik guard'ı + advisory lock'lu
`migrate.ts` + ESLint yapılandırması — davranış değişikliği olmadan.
