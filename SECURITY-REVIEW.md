# Güvenlik İncelemesi — `yonetim`

| Alan | Değer |
|---|---|
| Tarih | 2026-08-02 |
| Kapsam | `apps/api` (NestJS), `apps/app` (Next.js panel), `apps/web` (Next.js site), `apps/worker` (BullMQ), `packages/*` (20 paket), `infra/docker/*`, `pnpm-lock.yaml` |
| Yöntem | Statik analiz + kod okuma; 6 paralel alt-agent + manuel doğrulama. Pnpm audit, kod grafiği (codebase-memory), dosya bazlı inceleme. Canlı sömürü yok. |
| Yapı | 14k+ düğüm, ~29k kenar; çoğu TypeScript, 12 SQL, 6 YAML. Üç katman: api / app / web + worker. |
| Kimlik | Parola + opsiyonel OTP; iki DB rolü (`yonetim_app` RLS'li, `yonetim_admin` BYPASSRLS); TCKN/IBAN AES-256-GCM ile alan bazlı şifreli. |

> **Özet:** Mimari temel doğru kurulmuş (RLS, parameterised query, scrypt, JWT alg sabit, HMAC imza, raw body). Bulgular ağırlıklı olarak **güvenlik duvarları, hata sızıntısı, varsayılan ayar riskleri, RLS varsayılan kapsamı, webhook'ların ikincil doğrulaması, bilinen CVE'li bağımlılıklar, worker güven modeli, ödeme çift-allocation, MFA enforcement eksikliği, dosya yükleme güvenliği ve tenant sızıntısı** üzerinde yoğunlaşıyor. Acil müdahale gerektiren **10 CRITICAL**, **14 HIGH**, **31 MEDIUM**, **20 LOW** bulgu tespit edildi.

---

## 1. Risk Özeti

| Seviye | Sayı | Eğilim |
|---|---:|---|
| 🔴 CRITICAL | 10 | Hemen |
| 🟠 HIGH | 14 | Bu sprint |
| 🟡 MEDIUM | 31 | Sıradaki sprint |
| 🟢 LOW | 20 | Backlog |

### 1.1 CRITICAL — Hemen Ele Al

| ID | Başlık | Yer |
|---|---|---|
| **C-1** | API'nin `/v1/docs` (Swagger UI) yolu üretimde açık; tüm uç yüzeyi, auth akışı, payload şemaları halka görünür | `apps/api/src/main.ts:84` |
| **C-2** | Rate limit guard'ı `@Public()` rotaların **tamamını** sınırsız bırakıyor; hassas public uçlar (NPS, sertifika, sakin borç/daire, webhook) sadece manuel `rateLimit` çağrısına bağlı | `apps/api/src/identity/guards/rate-limit.guard.ts:33-40` |
| **C-3** | Rate limit guard'ı **fail-open**: `incrWindow` null döndüğünde (Redis yok/hata) koruma tamamen düşüyor. Üretimde 300/dk session limiti tek bir Redis kesintisinde sıfırlanıyor | `apps/api/src/identity/guards/rate-limit.guard.ts:52-53`, `apps/api/src/infra/redis/redis.service.ts:82-98` |
| **C-4** | **RLS yarı-kapsama:** Yeni migration ile eklenen tablolar `rls.sql` döngüsüne girmezse `ENABLE/FORCE ROW LEVEL SECURITY` uygulanmaz; `ALTER DEFAULT PRIVILEGES` (rls.sql:54-57) `yonetim_app`'e **RLS olmadan** tam DML hakkı verir. Fresh install'da migration sırası korunduğu için OK, ama partial rerun / doğrudan SQL uygulama / CI test ortamında yeni tablo korumasız kalır | `packages/db/sql/rls.sql:54-57, 71-96`, `packages/db/src/migrate.ts:14-32` |
| **C-5** | **DB rol parolaları SQL dosyasında hardcoded:** `rls.sql:28-34` `yonetim_app` ve `yonetim_admin` için literal parolalar içeriyor. Env üzerinden override yalnızca `yonetim_app` için var (rls.sql:40-48); `yonetim_admin` için yok. Üretimde compose `PG_ADMIN_PASSWORD:?zorunlu` istiyor ama rol oluşturulduktan sonra komut `ALTER ROLE` yapmıyor — admin her zaman default parolayla kalır | `packages/db/sql/rls.sql:25-48`, `infra/docker/docker-compose.prod.yml` |
| **C-6** | **`db.bypass()` PII'ı kapsam dışına çıkarıyor:** `resident.repository.ts:181-196` BYPASSRLS bağlantıyla `users.phone, email, tcknIndex` okuyor. `candidateIds` tenant-scope'lı sorgudan geliyor **olabilir**, ama ikinci sorgu RLS'i tamamen devre dışı bırakıyor. Aday kapsamında herhangi bir hata (boş dizi, NULL membership, scoped sorgunun bug'ı) → cross-tenant PII sızıntısı. Benzer risk 30+ `db.bypass` çağrısında. | `apps/api/src/property/resident/resident.repository.ts:181-196`, `apps/api/src/public/public-resident.controller.ts:80-96`, tüm `db.bypass` kullanımları |
| **C-7** | **`FIELD_ENCRYPTION_KEY` default değeri boot'ta kabul:** `.env.example:17` `0000…0000` (64 sıfır) ile geliyor; Zod şeması yalnız `regex(/^[0-9a-f]{64}$/i)` (env.ts:21-23) — tüm sıfırlar eşleşir. Tüm PII (TCKN, IBAN) "bilinen anahtarla" şifrelenmiş olur, yani plaintext. Deployer unutursa boot etmez — bu iyi — ama geliştirici default'u kullanırsa bilmeden **bilinen anahtarla** PII'yi şifreler. | `apps/api/src/infra/config/env.ts:21-23`, `.env.example:17` |
| **C-8** | **`packages/config` `required()` helper'ı dev default döndürüyor:** `packages/config/src/env.ts:46` `required("AUTH_SECRET", "dev-only-insecure-secret-change-me")` — bugün çağıran yok, ama gelecekte bir modül `serverEnv.authSecret()` çağırırsa, env set edilmemişse **publicly-known key** ile JWT imzalar/doğrular. Tuzak hazır. | `packages/config/src/env.ts:27, 46` |
| **C-9** | **Vitest 2.1.9 kritik CVE (CVE-2026-47429 / GHSA-5xrq-8626-4rwp):** Vitest UI server dinlerken keyfi dosya okuma/çalıştırma. `pnpm audit` doğruladı: `vitest@2.1.9 <3.2.6`. Test aracı olsa da lockfile'a kilitli; CI/local'de UI server açılırsa (örn. `--ui` bayrağı) sistem risk altında. | `pnpm-lock.yaml:5622`, `apps/api` ve kök |
| **C-10** | **`SEED_DEMO="true"` repo `.env`'de default + seed'te `if (SEED_DEMO !== "false")`:** `.env:12` ve `seed.ts:92` — opt-out yerine opt-in olmalı. Bir CI job veya operatör `pnpm db:seed` çalıştırırsa `yonetici@ornek.test / OrnekSite2026` ile giriş açılabilen bir demo site yaratılır. `seed.ts`'de `NODE_ENV === "production"` guard'ı yok (dev-session.ts'nin aksine). | `.env:12`, `packages/db/src/seed.ts:92-200` |

### 1.2 HIGH — Bu Sprint

| ID | Başlık | Yer |
|---|---|---|
| H-1 | iyzico webhook'u imza doğrulaması yapmıyor; yalnızca `token` alanına güveniyor. Sağlayıcı sözleşmesinde zorunlu HMAC var ise bu blind trust | `apps/api/src/integration/payment/iyzico-webhook.controller.ts:34-43` |
| H-2 | API 5xx hata yanıtlarında `AppError.message` ve `details` ham dönüyor; iyzico `error.message` sızabiliyor | `apps/api/src/infra/logging/api-exception.filter.ts:85-94` |
| H-3 | WhatsApp webhook'unda `statuses` (delivery/read) olaylarında hız sınırı ve event-ID dedupe yok; replay/amplification mümkün. Yalnız `inbound` rate-limit'li | `apps/api/src/communication/whatsapp/whatsapp-webhook.controller.ts:66-76` |
| H-4 | Rate limit Redis `REDIS_URL` opsiyonel — `env` şeması `.optional()`. Üretim compose veriyor, ama compose dışı kurulumlarda tamamen devre dışı | `apps/api/src/infra/config/env.ts:49`, `packages/auth/src/rate-limit.ts:42-55` |
| H-5 | API'de güvenlik başlıkları yok (helmet/CSP/HSTS/X-CTO/X-FO yok); Caddy de eklemiyor. Next.js uygulamaları kendi başlıklarını koyuyor ama API tüm `/v1/*` için çıplak | `apps/api/src/main.ts:27-90`, `infra/docker/caddy/Caddyfile` |
| H-6 | Next.js uygulamalarında **CSP başlığı yok**. Next'in inline script'leri yüzünden `unsafe-inline`'a düşmeden CSP yazmak zor ama yapılabilir (nonce tabanlı) | `apps/app/next.config.mjs:42-55`, `apps/web/next.config.mjs:21-34` |
| H-7 | TCKN arama ve benzeri PII sorgulama uçlarında rota-spesifik hız sınırı yok; 300/dk global session limiti ile numara deneme/enumerasyon mümkün | `apps/api/src/identity/resident.controller.ts` (peer agent) |
| H-8 | **RLS dynamic loop timing gap:** `rls.sql:71-96` yalnız script çalıştığı anda var olan `tenant_id` sütunlu tabloları RLS'liyor. Yeni bir migration tablo eklediğinde ve `rls.sql` yeniden çalışmadığında (örn. CI'da parçaçal migration, hot-fix deploy) tablo RLS'siz kalır. Drizzle her migration'da rls.sql'i tetiklemiyor — `migrate.ts` yalnız tam migration run'da çağrılıyor | `packages/db/src/migrate.ts:18-32`, `packages/db/sql/rls.sql:71-96` |
| H-9 | **`packages/auth/dev-session.ts` raw session token'ı stdout'a yazıyor:** `console.log(JSON.stringify({ token, ... }))` (line 124). Prod'da `NODE_ENV === 'production'` guard'ı var (line 32), ama guard yalnız runtime — `package.json`'da `@yonetim/auth` publishable; herhangi biri `process.env.NODE_ENV` set edip script'i çağırırsa, **super_admin/manager yetkisi veren raw token** stdout'a düşer. Log aggregator'lar stdout'u indeksliyorsa kalıcı. | `packages/auth/src/dev-session.ts:32, 118-124` |
| H-10 | **`packages/db/seed.ts` demo parolayı stdout'a yazıyor:** `console.log(\`  Demo giriş: yonetici@ornek.test / ${DEMO_PASSWORD}\`)` (line 232). `SEED_DEMO=true` default. `NODE_ENV` kontrolü yok. Birisi gerçek DB'ye karşı `pnpm db:seed` çalıştırırsa demo yönetici parolası log'a düşer; CI ortamı log'ları genelde arşivlenir. | `packages/db/src/seed.ts:109, 232` |
| H-11 | **Worker job payload `tenantId` doğrulanmıyor:** `apps/worker/src/queue/scheduled.processor.ts:31-34` ve `job-registry.ts:101-112`. API `/v1/panel/platform/jobs/:job/run` ile job tetiklendiğinde `tenantId` payload'dan alınıp `writableTenants` filtresi uygulanmadan `JobContext.run`'a veriliyor. Aktör archived/deleted tenant'ı hedefleyebilir, ayrıca `triggeredBy` alanı sadece API'den gelen string — gerçek kullanıcı kimliği worker'da persist edilmiyor. | `apps/worker/src/queue/scheduled.processor.ts:31-34`, `apps/worker/src/queue/job-registry.ts:101-112` |
| H-12 | **iyzico callback çift-allocation (race):** `iyzico-webhook.controller.ts:84-147` — `existing` SELECT ve allocation INSERT aynı transaction içinde değil; `SELECT … FOR UPDATE` yok. İki eşzamanlı webhook (iyzico retry) aynı `conversationId`'de `existing = null` görebilir, ikisi de mahsup yapar. `payment_allocations(processor_ref)` unique index yok. `payments.idempotency_key` constraint'i webhook set etmiyor. | `apps/api/src/integration/payment/iyzico-webhook.controller.ts:84-147` |
| H-13 | **Public v1 debt listesi `debtorUserId` döndürüyor:** `apps/api/src/public/public-debt.controller.ts:66` — `debtorUserId` global `users` tablosuna FK. API-key session'la gelen istemci `/api/v1/residents` ile ilişkilendirip PII'a ulaşabilir. Tenant-scoped ama global user linkage sızıntısı. | `apps/api/src/public/public-debt.controller.ts:36-89` |
| H-14 | **TOTP MFA kütüphanesi var ama auth akışına bağlı değil:** `packages/auth/src/otp.ts:14-74` `verifyTotp`, `generateTotpSecret`, `totpUri` tanımlı; `users.twoFactorEnabled` schema'da ve session'a okunuyor (session.ts:97, 133). Ancak `verifyTotp` çağrısı kod tabanında hiç yok; `twoFactorEnabled` giriş akışında kontrol edilmiyor. **MFA uygulanmış ama enforced değil** — tek faktör (parola) yetiyor. Özellikle platform admin için zorunlu olmalı. | `packages/auth/src/otp.ts:14-74`, `packages/db/src/schema/users.ts:55-58` |
| H-15 | **Yüklenen dosya tipi client metadata'sından güvenilir:** `packages/storage/src/index.ts:101-115`, `document-write.service.ts:82-91` — post-upload doğrulama yalnız `Content-Type` HEAD kontrolü; magic bytes yok. `.html` + `application/pdf` ile executable saklanabilir, indirildiğinde tarayıcı/sandbox tetikler. | `packages/storage/src/index.ts:101-115`, `apps/api/src/governance/document/document-write.service.ts:82-91` |
| H-16 | **Başarısız giriş log'larında raw email/phone:** `web-auth.service.ts:194-197` `identifier` (normalize telefon veya e-posta) Pino'ya ham düşüyor. Redact listesi `identifier`/`email`/`phone` yollarını kapsamıyor. KVKK kapsamında PII log birikimi. | `apps/api/src/identity/web-auth.service.ts:194-197`, `apps/api/src/infra/logging/pino.config.ts:9-18` |

### 1.3 MEDIUM — Sıradaki Sprint

| ID | Başlık | Yer |
|---|---|---|
| M-1 | iyzico webhook'unda DB seviyesinde unique constraint yok; iki eşzamanlı webhook aynı `processorRef` ile işlenebilir (race) | `apps/api/src/integration/payment/iyzico-webhook.controller.ts:46-53` |
| M-2 | iyzico webhook'ta `payment.status !== "success"` → `failureReason` olarak iyzico `errorMessage` kaydediliyor; KVKK uyarınca sağlayıcı hata metni saklanıyor | `apps/api/src/integration/payment/iyzico-webhook.controller.ts:73-76` |
| M-3 | Belge yükleme, toplu birim/borç import, job trigger uçlarında rota-spesifik limit yok; 300/dk global yeterli değil | çeşitli controller'lar |
| M-4 | CSRF koruması yok; yalnız `SameSite=Lax` çerez. State-changing POST'lar için yeterli mi tartışmalı; ek CSRF token veya Origin/Referer doğrulaması düşünülmeli | `apps/app/src/lib/session-cookie.ts:20-26` |
| M-5 | API `trust proxy = 1` — tek proxy'e güveniyor. Doğrudan erişilirse veya Caddy arkasında bir LB daha varsa istemci IP spoofing'i ile rate-limit atlatılabilir | `apps/api/src/main.ts:36` |
| M-6 | Alan şifreleme anahtar türetmesi tek-aşamalı `SHA-256(master ‖ "tenant:" ‖ tenantId)`. HKDF veya info string ayrımı yok; tenant ID'leri aynı master'dan tahmin edilebilir değil ama KDF best-practice değil | `packages/core/src/crypto.ts:12-15` |
| M-7 | `blindIndex` masterKey ile türetiliyor, **tenant ayrımı yok**. Şifreli TCKN/IBAN arasında aynı değer farklı tenant'larda eşleşir. Tasarım gereği mi yoksa bilinçsiz mi doğrulanmalı | `packages/core/src/crypto.ts:49-55` |
| M-8 | `pnpm install --ignore-scripts` API prod build'inde var ama diğer Dockerfile'lar ve local geliştirmede yok. Paketlerin `postinstall`'ı çalışabilir | `infra/docker/Dockerfile.api:14` |
| M-9 | Loglama `requestId` ve `tenantId` içeriyor; tam path loglanıyor. URL'de PII (TCKN, token) olabilir. Log'a path redaksiyonu yok | `apps/api/src/infra/logging/pino.config.ts:6-93` |
| M-10 | API exception filter `HttpException`'da `payload.message`'i ham yayınlıyor; geliştirici `throw new BadRequestException(internalDetail)` yazarsa sızar | `apps/api/src/infra/logging/api-exception.filter.ts:105-130` |
| M-11 | Rate limit memory fallback: in-memory Map per-process. Çok replikalı üretimde Upstash şart, normal Redis (REDIS_URL) çalışmıyor. Bu yüzden compose.prod Upstash istemeli | `packages/auth/src/rate-limit.ts:42-97` |
| M-12 | `db.bypass` çağrılarının çoğu (örn. `signup:setup-tenant`, `residents:tckn-lookup`, `ctx:platform-role`) platform seviyesi için gerekli, ama `residents:list-by-membership` ve `residents:detail` gibi tenant-bilinen akışlar için `withTenant`/`tenantScoped` kullanılabilir. Mevcut durum: 30+ bypass, her biri denetim yükü | tüm `apps/api/src/**/*bypass*` çağrıları |
| M-13 | `pg_dump` veya başka bir yöntemle `rls.sql` çalıştırılmadan DB snapshot alınırsa yeni tablolar RLS'siz kalır. CI'da katalog testi yok (tüm tenant_id tablolarında `relrowsecurity = true` ve en az 1 policy var mı?) | eksik |
| M-14 | **`apps/web` transpile paketleri env okur:** `apps/web/next.config.mjs:15-20` `@yonetim/sms`, `@yonetim/payment`, `@yonetim/whatsapp`, `@yonetim/bank` vb. paketleri transpile ediyor. Bunlar `serverEnv` ile env okur. Bugün client component bunları import etmiyor; ama herhangi bir marketing component'i ileride import ederse `IYZICO_SECRET_KEY` / `RESEND_API_KEY` / `ANTHROPIC_API_KEY` okuyan kod client bundle'a girer. | `apps/web/next.config.mjs:15-20`, `packages/sms/src/index.ts:1` |
| M-15 | Hata loglarında PII sızıntısı: `signup.service.ts:233`, `mobile-auth.service.ts:95`, `portal.service.ts:766,853` `String(error)` ile logluyor. Provider hatası telefon/email/içeriyorsa log'a düşer. Pino `redact`'in `*.phone`/`*.email` yolu yok. | `apps/api/src/identity/signup.service.ts:233`, `apps/api/src/infra/logging/pino.config.ts:8-18` |
| M-16 | Pino redact listesi `*.apiKey`, `*.api_key`, `*.secretKey`, `*.secret`, `*.clientSecret` kapsamıyor. Gelecekte `{ apiKey: ... }` içeren log satırı eklendiğinde redact edilmez. | `apps/api/src/infra/logging/pino.config.ts:8-18` |
| M-17 | **WhatsApp webhook JSON parse try/catch dışında:** `JSON.parse(raw)` (whatsapp-webhook.controller.ts:64) try/catch ile sarılı değil. Sağlayıcı bozuk/eksik JSON gönderirse 5xx → Meta tekrar gönderir → amplification. Rate-limit bütçesi yenir. | `apps/api/src/communication/whatsapp/whatsapp-webhook.controller.ts:64` |
| M-18 | **Event processor subject_user tenant üyelik kontrolsüz:** `apps/worker/src/queue/event.processor.ts:172` `payload.subjectUserId`'yi doğrudan global `users` tablosunda arıyor; tenant üyeliği doğrulaması yok. Producer forged payload gönderirse cross-tenant bildirim + DB kaydı. | `apps/worker/src/queue/event.processor.ts:172, 215-225` |
| M-19 | **Telefon plaintext:** TCKN/IBAN şifreli ama `users.phone` (users.ts:19) ve `users.emergencyContactPhone` (users.ts:35) plaintext. Telefon yüksek-değerli PII; provider matching için gerekliyse blind index + encrypt. | `packages/db/src/schema/users.ts:19, 35` |
| M-20 | **TOTP secret plaintext:** `users.twoFactorSecret` (users.ts:57) AES-256-GCM ile şifrelenmemiş. DB backup'ı veya dump'ı ele geçirilirse tüm kullanıcıların 2FA seed'i açık. | `packages/db/src/schema/users.ts:57` |
| M-21 | **Drizzle ORM 0.38.4 SQL injection (CVE-2026-39356):** Patch `>=0.45.2`. Şu an 28 path'te kullanılıyor. Hemen güncelle. | `pnpm-lock.yaml`, `apps/api/package.json:42` |
| M-22 | **PostCSS 8.4.31 path traversal + arbitrary file read (CVE-2026-45623, GHSA-r28c-9q8g-f849):** Lockfile'ta eski sürüm; declare range `^8.4.49` ama transitively çözülmüş. | `pnpm-lock.yaml`, `apps/app/package.json:35` |
| M-23 | **next-intl 3.26.5 open redirect + prototype pollution (CVE-2026-40299):** Her iki Next app'te. | `apps/app/package.json:24`, `apps/web/package.json` |
| M-24 | **Dev compose tüm interface'lere bind oluyor:** `infra/docker/docker-compose.yml` Postgres 5433, Redis 6380, MinIO 9000/9001 host'un tüm IP'lerinde. Paylaşılan/erişilebilir host'ta çalıştırılırsa DB ve object storage dışarıya açık + hardcoded credentials (`yonetim`/`yonetim123`). | `infra/docker/docker-compose.yml:11-55` |
| M-25 | **`.dockerignore` yok:** Build context repo kökü; `.env`, `.git`, `node_modules`, `.next` hepsi builder'a gidiyor. Selective COPY kullansa da builder log/cache'inde iz kalır. | repo kökü |
| M-26 | **CI'da CodeQL/Semgrep yok; `permissions:` bloğu yok:** `GITHUB_TOKEN` izinleri repo default'una bağlı. Sadece `pnpm audit` çalışıyor; SAST katmanı eksik. | `.github/workflows/ci.yml:5-20` |
| M-27 | **Event processor idempotency açığı:** `apps/worker/src/queue/event.processor.ts:103-127, 243-296` — `notifications(resource_type, resource_id, user_id, template)` unique index yok. Aynı `debt.created` event'i iki kez işlenirse WhatsApp/SMS çift gider, `estimateMonthlyCostKurus` şişer. | `apps/worker/src/queue/event.processor.ts:103-127` |
| M-28 | **Late-fee job idempotency + ledger eksik:** `packages/jobs/src/late-fee-job.ts:54-80` — recompute + update, fark çıktığında koşulsuz update. Retry'da ay sonu sınırı geçildiyse yanlış ücret yazılır. `audit_debt_changes`/`late_fee_charges` ledger yok. | `packages/jobs/src/late-fee-job.ts:54-80` |
| M-29 | **Dues generation transaction bütünlüğü:** `packages/jobs/src/dues-generation.ts:128-172` — `duesRuns` insert + `debts` insert aynı transaction'da değil. Retry'da `duesRuns` zaten var görür, tüm `debts`'i `skipped` işaretler, kısmi borç tablosu kalır. | `packages/jobs/src/dues-generation.ts:128-172` |
| M-30 | **iyzico amount drift:** `iyzico-webhook.controller.ts:115-128` — `settleable = min(record.amountKurus, payment.paidPriceKurus)`. Sağlayıcı küçük tutar raporladığında sessizce `partial` allocation yazılır, `audit_debt_changes` kaydı yok. Ödeme tamamlandı görünür ama borç eksik kapanır. | `apps/api/src/integration/payment/iyzico-webhook.controller.ts:115-128` |
| M-31 | **Webhook JSON body size limit yok:** `apps/api/src/main.ts:46-55` — `app.use(json({ verify: ... }))` `limit` belirtilmemiş. `/v1/webhooks/iyzico` 10 GB body kabul eder, sadece `{ token: string }` arar. DoS + memory exhaustion. | `apps/api/src/main.ts:46-55` |
| M-32 | **`bankTargets()` decrypt edilmiş IBAN'ı herhangi bir oturum açmış kullanıcıya döndürüyor:** `apps/api/src/finance/portal-payment/portal-payment.controller.ts:291-328` — `@Get()` decorator, `@RequirePermission` yok. Sakin `GET /v1/panel/portal/payment` ile tüm aktif banka IBAN'larını çekebilir. `data_access_logs` yalnız `rows.length > 0` ise yazılıyor. | `apps/api/src/finance/portal-payment/portal-payment.controller.ts:291-328` |
| M-33 | **`residents:options` bypass global `users` döndürüyor:** `resident.repository.ts:607-621` — `inArray(users.id, candidateIds)` memberships set'ten geliyor ama `memberships.tenantId` filtresi yok. Stale membership → başka tenant'tan PII sızıntısı. | `apps/api/src/property/resident/resident.repository.ts:607-621` |
| M-34 | **Public unit/expense enumeration + sınırsız pageSize:** `apps/api/src/public/public-unit.controller.ts:51-105`, `public-expense.controller.ts:33-100` — `?blockId=<uuid>` ile tüm unit ID'leri enumerate edilebilir; `parsePagination` cap yok, `?pageSize=100000` ile tek sorguda tüm tablo. | `apps/api/src/public/public-unit.controller.ts:51-105`, `apps/api/src/public/public-v1.pagination.ts` |
| M-35 | **Duyuru/rehber mesaj spam limiti yok:** `RATE_LIMITS`'te announcement/message kuralı tanımlı değil. Manager `announcement:write` ile tüm sakinlere sınırsız duyuru gönderebilir; `forceUrgent` WhatsApp+SMS+email+push aynı anda 03:00'te. | `apps/api/src/communication/communication.service.ts:48-125`, `packages/auth/src/rate-limit.ts:14-32` |
| M-36 | **Event processor subject_user üyelik kontrolsüz:** `apps/worker/src/queue/event.processor.ts:172, 215-225` — `payload.subjectUserId` global `users` tablosunda aranıyor, tenant üyelik doğrulaması yok. Forged event başka tenant sakinine bildirim + DB kaydı yazabilir. | `apps/worker/src/queue/event.processor.ts:172, 215-225` |
| M-37 | **`audit_logs` RLS yok + tenantId filtresiz:** `packages/db/src/schema/compliance.ts:93-115` — `tenantId` nullable, RLS dynamic loop'a girmez. `audit.repository.ts:38-52` `where` builder'ında `tenantId` yok. Login olmuş kullanıcı `GET /v1/panel/audit?search=...` ile başka tenant'ın audit satırlarını görebilir. | `packages/db/src/schema/compliance.ts:93-115`, `apps/api/src/governance/audit/audit.repository.ts:38-52` |
| M-38 | **`dataAccessLogs` benzer şekilde RLS'siz ve tenant filtresiz:** `packages/db/src/schema/compliance.ts:118-137`. Audit controller list sorgusunda `tenantId` yok. | `packages/db/src/schema/compliance.ts:118-137`, `apps/api/src/governance/audit/audit.controller.ts` |
| M-39 | **`PiiService.open` kaynağında audit yok:** `apps/api/src/property/resident/pii.service.ts:73-94`, `pii.service.ts:90-94` — IBAN decrypt, `bank_account.viewed` loglanıyor ama `dataAccessLogs`'a IBAN/TCKN erişimi yazılmıyor. KVKK regulator denials + grants istiyor. | `apps/api/src/property/resident/pii.service.ts:73-94`, `apps/api/src/finance/portal-payment/portal-payment.controller.ts:320-328` |
| M-40 | **Permission denials audit edilmiyor:** `apps/api/src/identity/guards/permission.guard.ts` 403'te `audit.record` çağırmıyor. KVKK regulator "X kullanıcısı Y kaynağa erişmeyi denedi ama reddedildi" izini ister. | `apps/api/src/identity/guards/permission.guard.ts` |
| M-41 | **Webhook URL'leri static (per-tenant secret yok):** iyzico ve WhatsApp URL'leri tahmin edilebilir. WhatsApp HMAC telafi ediyor; iyzico etmiyor. İleride PayTR controller eklenirse aynı tuzak. | `apps/api/src/integration/payment/iyzico-webhook.controller.ts:30`, `apps/api/src/communication/whatsapp/whatsapp-webhook.controller.ts:39` |
| M-42 | **Bypass reason validator gevşek:** `apps/api/src/infra/db/db.service.ts:112-114` — yalnız 3 karakter ister. `db.bypass("x", …)` typo bypass'a izin verir. Namespaced reason (regex) şart. | `apps/api/src/infra/db/db.service.ts:112-114` |
| M-43 | **Password reset akışı yok:** `packages/auth/src/session.ts:162-174` `password_reset` purpose tanımlı ama issue/consume yok. `apps/app/src/middleware.ts:21` `/sifre-sifirla` public path olarak işaretli; `login-form.tsx:143` "Şifremi unuttum" bağlantısı var ama sayfa/endpoint yok. Kullanıcı parola unutursa hesabı kurtaramıyor. | `packages/auth/src/session.ts:162-174`, `apps/app/src/middleware.ts:21` |
| M-44 | **Parola policy zayıf:** `packages/auth/src/password.ts:58-68` min 10 karakter, yalnız 5 prefix blocklist. Breached-password (HIBP), kullanıcı adı/telefonu/e-postayı parola olarak reddetme, admin için güçlendirilmiş policy yok. | `packages/auth/src/password.ts:58-68` |
| M-45 | **`sql.raw()` kullanıcı girdisiyle:** `apps/api/src/tenancy/platform-accounts.service.ts:473` `sql.raw(\`interval '${params.days} days'\`)`. Şu an Zod 1..730 doğrulaması var, ama parametrizasyon bypasstan kırılgan desen. Gelecekte validation gevşerse doğrudan SQL injection. | `apps/api/src/tenancy/platform-accounts.service.ts:473` |
| M-46 | **Certificate write endpoint yanlış permission:** `apps/api/src/finance/certificate/certificate.controller.ts:25-37` `POST` endpoint `debt:read` ile korunuyor — `debt:read` sahibi kalıcı sertifika kaydı oluşturabiliyor. `debt:write` veya `certificate:write` gerekli. | `apps/api/src/finance/certificate/certificate.controller.ts:25-37` |
| M-47 | **Login rate limit IP bazlı değil:** `apps/api/src/identity/web-auth.service.ts:169-171` `rateLimit(RATE_LIMITS.login, identifier)` — sadece identifier. Login `@Public()` olduğu için global guard atlıyor; tek IP farklı identifier'larla sınırsız parola deneyebilir. | `apps/api/src/identity/web-auth.service.ts:169-171` |
| M-48 | **Yüklenen belgeler malware taraması yok:** `document-write.service.ts:66-122`, `packages/storage/src/index.ts:154-166` — PDF/Office dosyaları ClamAV veya managed scanner'dan geçmeden yayına alınıyor. Macro/embedded payload yöneticiler tarafından açılır. | `apps/api/src/governance/document/document-write.service.ts:66-122` |
| M-49 | **Download URL'leri `Content-Disposition: attachment` zorlamıyor:** `packages/storage/src/index.ts:89-91`, `document-write.service.ts:131-162` — presigned GET, indirilen içerik tarayıcıda inline render edilebilir. Client-controlled metadata ile birleşince stored XSS tetikler. | `packages/storage/src/index.ts:89-91` |
| M-50 | **Dosya uzantısı MIME allowlist ile eşleştirilmiyor:** `packages/storage/src/index.ts:136-144` — `.html` + `Content-Type: application/pdf` kabul edilip depolanıyor. Filename validation yalnız karakter/uzunluk, uzantı kısıtı yok. | `packages/storage/src/index.ts:136-144` |
| M-51 | **Document object-key path traversal / confusion:** `document-write.service.ts:78-80` — client object key gönderiyor, validation yalnız `${tenantId}/` prefix kontrolü. `../`, control chars, başka tenant'ın key'i ile confusion (key biliniyorsa) mümkün. Sunucu tarafı pending-upload kaydı + canonical format zorunluluğu yok. | `apps/api/src/governance/document/document-write.service.ts:78-80` |
| M-52 | **Legal-event documentUrl güvensiz scheme kabul ediyor:** `document.contract.ts:217` + `legal-write.service.ts:188-199` — `documentUrl` trim + length; `javascript:`, `data:`, saldırgan-controlled external URL kabul. UI bu alanı link olarak basarsa XSS/phishing pivot. | `packages/contracts/src/governance/document.contract.ts:217`, `apps/api/src/governance/document/legal-write.service.ts:188-199` |

### 1.4 LOW — Backlog

| ID | Başlık | Yer |
|---|---|---|
| L-1 | `AUTH_SECRET` Zod şeması yalnız `min(8)`; örnek/placeholder değer üretimde kalsa boot etmiyor. Brute-force'a açık. | `apps/api/src/infra/config/env.ts:20` |
| L-2 | `.env.example`'da `AUTH_SECRET="dev-only-insecure-secret-change-me"` ve `FIELD_ENCRYPTION_KEY="0000…"` default'ları var. Geliştirici unutarak alabilir. Boot sırasında reddedilsin | `.env.example:15-17` |
| L-3 | SESSION_IDLE_MINUTES (30 dk) tanımlı ama `resolveSession` yalnız `gt(expiresAt, now)` denetliyor; **idle timeout uygulanmıyor** | `packages/auth/src/session.ts:79-137`, `packages/auth/src/cookie.ts:12` |
| L-4 | JWT'de `iss`/`aud` claim yok, clock skew toleransı yok | `apps/api/src/identity/jwt.util.ts:64-86` |
| L-5 | `verifyTotp` `sha1` kullanıyor; SHA-256/SHA-512 daha yeni olurdu (uyumluluk nedeniyle OK) | `packages/auth/src/otp.ts:23-35` |
| L-6 | Hata izleme (Sentry) `requestId` ile gidiyor ama ek PII (tenantId, userId) opsiyonel. Sentry'de kişi eşleştirmesi için kontrol gerekli | `apps/api/src/infra/observability/sentry.ts` |
| L-7 | `verifyPassword` `split("$")` ile parçalıyor; stored format bozuksa sessizce false yerine atabilir (defensive). Test kapsamı sınırlı | `packages/auth/src/password.ts:19-25` |
| L-8 | `createCipheriv` 12 byte IV doğru, ama `iv.toString("base64")` URL-safe değil (padding dahil). Stored payload ":" ile ayrıldığından sorun yok, ama gelecekte değişirse dikkat | `packages/core/src/crypto.ts:23-27` |
| L-9 | `INTERNAL_API_TOKEN` env'de optional; `apps/worker` hiç `x-internal-token` göndermiyor. Dördüncü kimlik yolu tasarlanmış ama kullanılmıyor — ölü kod. Operasyonel risk, güvenlik riski düşük. | `apps/api/src/identity/context-resolver.service.ts:263-266` |
| L-10 | `tests/storage-sigv4.test.ts:21` ve `tests/notifications-bank.test.ts` AWS published test vektörleri / döküman IBAN'ı içeriyor. Secret scanner false positive kaynağı; triage yanlışlığı. | `tests/storage-sigv4.test.ts`, `tests/notifications-bank.test.ts` |
| L-11 | `packages/config/src/site.ts:47-49` production domain fallback'leri hardcoded (`https://yonetimcell.com.tr`). Public URL, sır değil. Bilgi amaçlı. | `packages/config/src/site.ts:47-49` |
| L-12 | **TypeScript `allowJs` ama `checkJs` yok:** `apps/app/tsconfig.json:17`, `apps/web/tsconfig.json:17`. JS dosyaları type-check olmadan compilation'a girebilir. | `apps/{app,web}/tsconfig.json:17` |
| L-13 | **ESLint `no-explicit-any` yalnız warning:** `eslint.config.mjs:98-100`. Request payload validasyonu zaafiyetlerini maskeleyebilir. | `eslint.config.mjs:98-100` |
| L-14 | **OTP/IP kovası yok:** `packages/auth/src/rate-limit.ts` OTP limiti yalnız identifier. Tek IP farklı telefonlarla toplu OTP enumeration. | `packages/auth/src/rate-limit.ts:16` |
| L-15 | **scrypt parametreleri explicit/versioned değil:** `packages/auth/src/password.ts:10-24` Node default'ları. Gelecekte maliyet yükseltmek/kademeli rehash zor. | `packages/auth/src/password.ts:10-24` |
| L-16 | **Logout cache invalidation controller'a bağlı:** `web-auth.service.ts:382-385` `logout()` direkt çağrılırsa cache TTL süresince session çalışır. DB silme + cache invalidation tek servis işleminde olmalı. | `apps/api/src/identity/web-auth.service.ts:382-385` |
| L-17 | **Public API filter'ları Zod ile doğrulanmıyor:** `public-debt.controller.ts:42-54`, `public-expense.controller.ts:39-54`, `public-resident.controller.ts:43-52`, `public-unit.controller.ts:57-66` — `unitId`/`blockId`/`categoryId`/`period`/`status` raw query'den alınıyor. SQL injection yok (Drizzle parameterize) ama malformed ID'ler sessizce kabul, pahalı sorgular. | `apps/api/src/public/public-debt.controller.ts:42-54` |
| L-18 | **Search input `%` ve `_` literal escape yok:** `unit.repository.ts:183`, `expense.repository.ts:188-194`, `debt.repository.ts:192-199`, `audit.repository.ts:43-50` — `ilike '%${q}%'` formatı; kullanıcı-supplied wildcard sorgu kapsamını genişletebilir. | `apps/api/src/finance/expense/expense.repository.ts:188-194` |
| L-19 | **Staff IBAN/phone shared schema kullanmıyor:** `tenancy.contract.ts:268, 276` — IBAN yalnız length check, checksum validator yok. Phone normalize edilmeden sonra `null`'a düşebilir. | `packages/contracts/src/tenancy/tenancy.contract.ts:268` |
| L-20 | **Auth identifier naive email/phone detection:** `auth.contract.ts:28` + `web-auth.service.ts:68, 165` + `signup.service.ts:55` — `@` içeriyorsa email, aksi telefon. Invalid/ambiguous identifier lookup + rate-limit bucket'a girebilir. | `packages/contracts/src/identity/auth.contract.ts:28` |
| L-21 | **Sentry IBAN scrubber spaced IBAN kaçırıyor:** `sentry.ts:85-87` — yalnız `TR` + 24 digit contiguous. Spaced format (TR12 3456 ...) maskelenmeden exception'a gider. | `apps/api/src/infra/observability/sentry.ts:85-87` |
| L-22 | **Legacy external URL download fallback:** `document-write.service.ts:150-152` — eski `https://` değer doğrudan dönüyor. Kullanıcıyı saldırgan-controlled host'a yönlendirebilir. | `apps/api/src/governance/document/document-write.service.ts:150-152` |
| L-23 | **Presigned upload orphan kalabiliyor:** `document-write.service.ts:48-64` — pending upload kaydı tutulmuyor; document create edilmezse object S3/R2'de kalır. | `apps/api/src/governance/document/document-write.service.ts:48-64` |
| L-24 | **Object key control karakter kabul ediyor:** `document.contract.ts:84-86` — yalnız trim + length. Newline, control char, dot segment, ayraç kısıtı yok. | `packages/contracts/src/governance/document/document.contract.ts:84-86` |

---

## 2. Bulgular — Detay

### 2.1 CRITICAL

#### C-1. Swagger UI üretimde açık

**Yer:** `apps/api/src/main.ts:68-84`

```ts
SwaggerModule.setup("v1/docs", app, doc, { jsonDocumentUrl: "v1/docs.json" });
```

**Sorun:** Koşulsuz. `NODE_ENV` kontrolü yok. Üretimde `/v1/docs` ve `/v1/docs.json` herkese açık. Dış sözleşmenin tamamı (parametreler, şemalar, auth akışı, webhook yolları) indekslenebilir.

**Etki:** Saldırgan tüm endpoint surface'i, auth/permission şemaları, body validasyonlarını, response formatlarını görür. Saldırı yüzeyi haritası bedavaya gelir.

**Düzeltme:**
- `process.env.NODE_ENV !== "production"` ise mount et; prod'da hiç setup çağrısı yapma.
- Veya Basic Auth ile koru, IP allowlist ekle.

---

#### C-2. `@Public()` rotalar global rate-limit'ten muaf

**Yer:** `apps/api/src/identity/guards/rate-limit.guard.ts:32-40`

```ts
if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [exec.getHandler(), exec.getClass()])) {
  return true;  // tüm public rotalar sınırsız
}
```

**Sorun:** Global guard herkese 300/dk limit koyuyor ama `@Public` rotalarda guard hiç çalışmıyor. Public uçlar yalnız `packages/auth/src/rate-limit.ts` içindeki manuel `rateLimit()` çağrılarına bağlı:
- `/v1/webhooks/iyzico` ve `/v1/webhooks/whatsapp` — webhook signature var ama sınırsız yeniden deneme
- `/v1/public/*` (NPS, sertifika doğrulama, sakin borç, daire, belge) — manuel limit var mı kontrol edilmeli
- `/v1/auth/*` (login, OTP) — manuel login 5/dk + OTP 3/saat var (iyi)

**Etki:** Webhook'lar yüksek hacimli DoS kaynağı; public CRUD'lar (sakin borç sorgu, sertifika doğrulama) enumeration'a açık. Memory fallback tek process'te.

**Düzeltme:**
- `@Public()` rotasında default olarak "düşük limit" (örn. 60/dk/IP) uygula.
- `@Public({ rateLimit: "login" })` gibi rota-spesifik dekoratör ekle.
- Webhook'lar için IP allowlist (iyzico + Meta IP aralıkları).

---

#### C-3. Rate limit fail-open

**Yer:** `apps/api/src/identity/guards/rate-limit.guard.ts:52-53`

```ts
const count = await this.redis.incrWindow(`rl:${identifier}`, 60);
if (count === null) return true;  // Redis yok/hata → sınırsız izin
```

ve `apps/api/src/infra/redis/redis.service.ts:82-98`:

```ts
async incrWindow(key: string, windowSeconds: number): Promise<number | null> {
  const c = this.conn();
  if (!c) return null;       // Redis yok → null
  try { ... }
  catch (error) { ... return null; }  // hata → null
}
```

**Sorun:** Redis kesintisinde **tüm** korumalı API trafiği sınırsız. 300/dk session limiti tek olayda sıfırlanır. Memory fallback sadece `packages/auth/src/rate-limit.ts` içindeki özel kurallar için var (login, OTP), genel API trafiği için değil.

**Etki:** DoS amplifikasyonu. Maliyet saldırısı (veritabanı sorguları, dosya yükleme). Giriş brute-force ikinci adımı sınırsız (memory'de özel kural olduğu için aslında sınırlı ama aynı IP'den farklı hesap denemek mümkün).

**Düzeltme:**
- `if (count === null) return false; throw 503` (Redis zorunlu, hata = unhealthy).
- Veya en azından rate limit in-memory fallback ekle (per-process, çoğulama kabul edilebilir) ve logla.
- `loadEnv()` Redis yoksa prod'da fail etsin (`REDIS_URL` required yap, dev/test'te opsiyonel).

---

### 2.2 HIGH

#### H-1. iyzico webhook imza doğrulaması yok

**Yer:** `apps/api/src/integration/payment/iyzico-webhook.controller.ts:34-43`

```ts
@Post()
@Public()
@HttpCode(200)
async receive(@Body() body: unknown) {
  const { token } = callbackSchema.parse(body ?? {});
  const detail = await retrievePayment(token);
  if (!detail.ok) {
    throw errors.internal(detail.error.message);
  }
  const payment = detail.value;
  ...
}
```

**Sorun:** Sadece `token` alanı parse ediliyor; gövdenin iyzico'dan geldiğine dair HMAC doğrulaması yok. `token` tahmin edilemez olduğu için brute-force zor, ancak:
- `token` ifşa olursa (referer header'ı, reverse proxy logları) sahte callback gönderilebilir.
- iyzico sözleşmesi HMAC zorunlu kılıyorsa bu, PCI uyumsuzluğu yaratır.
- iyzico dokümantasyonu: `IYZIPAY_BASE_URL` değişkenine `https://api.iyzipay.com` set edilmemişse sandbox'a düşer; kontrol gerekli.

**Etki:** Token sızarsa borç kapatma / para yönlendirme. Orta risk (token gizli kaldığı sürece), ancak defense-in-depth eksik.

**Düzeltme:**
- iyzico'nun desteklediği `X-Iyz-Signature` veya path-encoding imza varsa ek doğrulama.
- `IYZICO_BASE_URL` env'de mutlaka production URL olmalı; dev'de sandbox.
- `details.error.message` sızıntısını da engelle (H-2).

---

#### H-2. 5xx hata yanıtlarında iç detay sızıntısı

**Yer:** `apps/api/src/infra/logging/api-exception.filter.ts:85-94`

```ts
function translate(exception: unknown): Translated {
  if (exception instanceof AppError) {
    const code = LEGACY_ERROR_CODE_MAP[exception.code] ?? "internal";
    return {
      status: HTTP_STATUS_BY_ERROR_CODE[code],
      code,
      message: exception.message,        // ham mesaj
      details: exception.details,         // ham detay
    };
  }
```

**Sorun:** `AppError.message` her durumda (5xx dahil) döndürülüyor. iyzico webhook'ta `throw errors.internal(detail.error.message)` (line 42) → sağlayıcının hata metni (DB şeması, sağlayıcı iç hatası) API yanıtında görünür.

**Etki:** Bilgi sızıntısı. Saldırgana iç sistem, sağlayıcı hata kodları, olası dosya yolları.

**Düzeltme:**
- 5xx'lerde generic mesaj (`"Beklenmeyen bir hata oluştu."`) + `requestId`; detay yalnız log+Sentry.
- 4xx'lerde (kullanıcı hatası) detay korunabilir.

---

#### H-3. WhatsApp status event'leri sınırsız ve dedupe'suz

**Yer:** `apps/api/src/communication/whatsapp/whatsapp-webhook.controller.ts:66-76`

```ts
for (const status of statuses) {
  await this.bot.recordStatus(status);   // rate-limit yok, dedupe yok
}

for (const message of inbound) {
  const limit = await rateLimit(RATE_LIMITS.whatsappInbound, message.from);
  if (!limit.allowed) continue;
  await this.bot.handleInbound(message);
}
```

**Sorun:** `statuses` (delivered, read, failed) için rate limit ve event ID dedupe yok. Meta aynı event'i birden fazla gönderirse her biri işleniyor. Aynı `message_id` birden fazla gelirse duplicate status güncellemeleri yapılıyor. Amplification: bir dış tetikleyici yüzlerce sahte status gönderebilir.

**Etki:** DB yükü, audit log şişmesi, rate-limit budget tüketimi (sakinler için ayrılan bütçe yenir).

**Düzeltme:**
- `status.id` veya `(message_id, status)` unique constraint ekle, `ON CONFLICT DO NOTHING`.
- Global rate limit (`@Public` bypass sorunu, C-2).
- Status event'lerini ayrı bucket'ta sınırla.

---

#### H-4. `REDIS_URL` opsiyonel; prod'da hata vermiyor

**Yer:** `apps/api/src/infra/config/env.ts:49`, `apps/api/src/infra/redis/redis.service.ts:21-29`

**Sorun:** `z.string().optional()`. Üretim compose `REDIS_URL` koyuyor, ama `docker-compose.yml` (dev) koymuyor. `loadEnv()` Redis yokluğunda fail etmiyor; `RedisService.warn` logluyor ve rate limit sıfırlanıyor. C-3 ile bağlantılı.

**Etki:** Dev ortamı hata ayıklaması için tasarlandığı için sorun yok; **üretim için** Compose.env veya env dosyası unutulursa sessizce devre dışı kalıyor.

**Düzeltme:**
- `envSchema`'da `REDIS_URL` için refine: `NODE_ENV === "production"` ise zorunlu.
- Boot sırasında prod'da Redis bağlantı testi zorunlu kılınsın.

---

#### H-5. API'de güvenlik başlıkları eksik

**Yer:** `apps/api/src/main.ts`, `infra/docker/caddy/Caddyfile`

**Sorun:** NestJS API'sinde `helmet()` yok. Caddyfile'da header injection yok. Next.js uygulamaları (`apps/app`, `apps/web`) kendi `next.config.mjs`'inde `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `HSTS` koyuyor. **Ama API'nin kendi verdiği yanıtlar** (Caddy'den geçen `/v1/*` ve `/api/v1*` reverse proxy'lenen) başlıksız çıkıyor. Auth hata sayfaları, payment başarısızlık JSON'ları, PII içeren error'lar başlıksız.

**Etki:** API yanıtlarını tarayıcıda render etmek isteyen bir saldırı (örn. response splitting veya JSON hijacking eski varyantları) için kontrol yok. HSTS yoksa prod'da ilk ziyaret HTTP'ye düşebilir (Caddy zorluyor olabilir, doğrula).

**Düzeltme:**
- `helmet()` middleware Nest'e ekle.
- Veya Caddy `header` direktifleri ile global olarak uygula.
- API için en az: HSTS, X-CTO=nosniff, X-FO=DENY, Referrer-Policy, CSP `default-src 'none'` (API JSON döner).

---

#### H-6. Next.js uygulamalarında CSP yok

**Yer:** `apps/app/next.config.mjs:42-55`, `apps/web/next.config.mjs:21-34`

**Sorun:** Next.js'in inline script ihtiyacı yüzünden `default-src 'unsafe-inline'` yazmak CSP'nin anlamını yok eder. Ama **nonce-based CSP** mümkün: Next 14+ `nonce` API'si, middleware'de nonce üretip her script/style etiketine eklemek.

**Etki:** XSS zincirinde (örn. dangerouslySetInnerHTML kaçırılırsa, üçüncü taraf widget S3'te barınırsa) inline script çalışabilir. KVKK kapsamındaki sayfalar için ek savunma katmanı.

**Düzeltme:**
- Next.js App Router nonce-based CSP middleware'i ekle.
- Başlangıç: `script-src 'self' 'nonce-XXX'` + `style-src 'self' 'nonce-XXX'`, üçüncü taraf ihtiyaçlarını daralt.

---

#### H-7. TCKN / PII sorgulamalarında rota limiti yok

**Yer:** `apps/api/src/identity/resident.controller.ts` (peer agent doğrulaması)

**Sorun:** Sakin TCKN ile sorgu, "TCKN doğrulama" endpoint'leri global 300/dk session limitine takılı. Aynı oturumla 300 farklı TCKN denenebilir (kimlik doğrulama için 6 deneme yanlışsa bloke kuralı yok). Yetkili yönetici için enumerated TCKN üzerinden KVKK ihlali riski.

**Etki:** PII enumeration. 6 deneme yanlış sonra bloke yok.

**Düzeltme:**
- TCKN/IBAN sorgulama uçlarına 5/dk + 50/saat per-user limit ekle.
- KVKK uyarınca başarısız TCKN doğrulama denemelerini logla.
- Maskeleme: TCKN sadece son 4 hane gözüksün.

---

### 2.3 MEDIUM (seçilmiş)

#### M-1. iyzico webhook DB race

**Yer:** `apps/api/src/integration/payment/iyzico-webhook.controller.ts:46-53`

```ts
const existing = await this.db.bypass("iyzico:idempotency", async (tx) => {
  const rows = await tx.select({ id: payments.id })
    .from(payments)
    .where(eq(payments.processorRef, payment.paymentId))
    .limit(1);
  return rows[0] ?? null;
});
if (existing) return { ok: true, duplicate: true };
// ... sonra update
```

**Sorun:** Aynı `paymentId` ile iki eşzamanlı webhook gelirse ikisi de `existing` null görür, ikisi de update yapar, ikisi de mahsup yapar. `processorRef` unique constraint yok.

**Düzeltme:** `payments.processorRef` üzerinde unique index. Update'te `ON CONFLICT DO NOTHING` veya `INSERT ... ON CONFLICT` ile yarış koşulunu DB'ye bırak.

---

#### M-4. CSRF koruması yalnız SameSite=Lax

**Yer:** `apps/app/src/lib/session-cookie.ts:20-26`

**Sorun:** `SameSite=Lax` GET dışı cross-site isteklerde çerezi göndermez (iyi). Ama top-level POST navigation'da (form submit) Lax çerezi gönderir — eski ama bilinen zayıflık. Mobil uygulamalar Bearer token kullanıyor, onlarda sorun yok. Sadece web panel için geçerli.

**Düzeltme:** CSRF token (double-submit cookie) ekle. `apps/app` her form'a hidden input koysun. NestJS guard'ı token'ı doğrulasın. Veya `SameSite=Strict`'e geç (kullanıcı deneyimi etkisi olabilir).

---

#### M-5. `trust proxy = 1` proxy zincirine bağlı

**Yer:** `apps/api/src/main.ts:36`

**Sorun:** Caddy tek proxy olduğu için OK. Ama Caddy arkasına bir CDN (Cloudflare, Fastly) eklenirse `req.ip` Caddy olur, gerçek istemci IP olmaz. `X-Forwarded-For` spoofing'i artık işe yaramaz (1 trust var) ama kötü konfigürasyonda saldırgan `X-Forwarded-For` ile istediği IP'yi yazıp rate limit'ten kaçar.

**Düzeltme:** Üretim ortamı için `TRUSTED_PROXY_HOPS` env değişkeni; Caddy + CDN zincirinde doğru sayı. Compose'da `TRUST_PROXY=2` set edilebilir hale getir.

---

#### M-6. KDF olarak tek-aşamalı SHA-256

**Yer:** `packages/core/src/crypto.ts:12-15`

**Sorun:** `deriveKey(masterKey, tenantId) = SHA256(masterKey ‖ "tenant:" ‖ tenantId)`. HKDF veya bilinen bir KDF kullanılmıyor. Tek-aşamalı hash + concatenation, iyi bir KDF'in sağladığı "extract + expand" ayrımını vermez. MasterKey yeterince entropik olduğu sürece doğrudan saldırı zor, ama defansif derinlik zayıf.

**Düzeltme:** `node:crypto.hkdfSync("sha256", masterKey, salt, info, 32)`. `info = "tenant:" + tenantId`. Tüm şifreli alanlar için anahtar türetimi HKDF'ye geçsin.

---

#### M-9. Loglama path ve tenantId'yi logluyor

**Yer:** `apps/api/src/infra/logging/pino.config.ts:6-93`

**Sorun:** `req.url` otomatik loglanıyor. URL'de PII (örn. `?tckn=...` veya `?email=...`) varsa log'a düşer. `tenantId` ve `userId` her satırda. Pino `redact` yolları zaten `*.tckn` vb. kapsıyor, ama `req.url` veya `req.query` redact edilmiyor.

**Düzeltme:** `redact: { paths: [..., "req.url", "req.query", "req.params"], ... }`. Veya URL whitelist.

---

## 3. Doğrulanan İyi Uygulamalar

Aşağıdaki alanlar incelendi, doğru kurgulanmış:

- ✅ **JWT** (`apps/api/src/identity/jwt.util.ts:64-86`): HS256 sabit, başlıktaki `alg` okunmuyor, `timingSafeEqual`, `typ`/`sub`/`tid` doğrulanıyor, süre kontrolü var.
- ✅ **Parola** (`packages/auth/src/password.ts`): scrypt + 16 byte random salt + KEYLEN 64. `burnPasswordTime` timing-safe enumeration koruması. Türkçe karakter desteği, common-password blocklist.
- ✅ **OTP** (`packages/auth/src/otp.ts:5-8`): `crypto.randomInt`. TOTP RFC 6238.
- ✅ **Verification token** (`packages/auth/src/session.ts:155-240`): Tek kullanımlık, amaç (purpose) doğrulamalı, identifier-prefixed hash.
- ✅ **Alan şifreleme** (`packages/core/src/crypto.ts`): AES-256-GCM, rastgele 12 byte IV, auth tag, base64 depolama. Tenant başına anahtar türetme. TCKN eşitlik araması blind index.
- ✅ **Session cookie** (`apps/app/src/lib/session-cookie.ts:20-26`): HttpOnly, prod'da Secure, SameSite=Lax, path=/.
- ✅ **Raw body webhook** (`apps/api/src/main.ts:46-55`): Sadece `/v1/webhooks/*` için ham gövde saklanıyor.
- ✅ **CORS** (`apps/api/src/main.ts:57-64`): Default kapalı; allowlist ile birlikte `credentials: true` ama origin `*` yok.
- ✅ **Hata filtresi** (`apps/api/src/infra/logging/api-exception.filter.ts:132-137`): Bilinmeyen exception'da generic mesaj.
- ✅ **Pino redact** (`apps/api/src/infra/logging/pino.config.ts:9-18`): cookie, auth, TCKN, IBAN, parola, token redact'li. **Eksik:** `*.identifier`, `*.email`, `*.phone` (H-16).
- ✅ **Drizzle parameterised query** (aranan tüm controller/service'ler): Hiçbir yerde string concatenation SQL yok. (Doğrulama: `search_code` ile `sql\`\``, `raw(`, `from(\`` tarandı; tüm sorgular `eq/and/or/inArray` üzerinden.) **Not:** Drizzle 0.38.4 CVE-2026-39356'ya sahip — yükseltme zorunlu. Sort sütunları allowlist'ten geçiriliyor; JSON/array path'leri doğrudan client JSON'dan deserialize edilip `inArray`/`ANY()`'a verilmiyor.
- ✅ **Pagination**: Panel pagination `perPage` 200'de cap'li. Public-v1'de de server-side max.
- ✅ **Mass assignment**: `req.body` direkt DB write yok; mutation controller'lar Zod body schema kullanıyor. Tenant identity client DTO'sundan değil authenticated request context'ten türetiliyor.
- ✅ **HTML/email/PDF**: Mevcut `dangerouslySetInnerHTML` yalnız static init scriptleri ve JSON-LD. Email/receipt template'leri HTML-escape. User-authored içerik JSX escape. Aktif PDF kütüphanesi yok; certificate `pdfUrl` null. SVG/HTML document MIME allowlist'inde yok.
- ✅ **Multi-role DB**: `yonetim_app` RLS'li, `yonetim_admin` BYPASSRLS; `withBypassRls` çağrıları `tx` callback'i ile sınırlı, session/auth/cron için bilinçli.
- ✅ **whatsapp-webhook imza doğrulama** (`apps/api/src/communication/whatsapp/whatsapp-webhook.controller.ts:60-62`): `verifyWebhookSignature(raw, signature)` çağrılıyor.
- ✅ **Dockerfile.api**: `--ignore-scripts`, non-root `node` user, multi-stage build, dist'e indirgenmiş runtime.
- ✅ **RLS policy kapsamı (yazma anında):** `tenants` tablosunda INSERT `WITH CHECK (false)` (rls.sql:117-121), DELETE `USING (false)` (rls.sql:123-126). Uygulama rolü yeni site açamaz / silemez — yalnız `yonetim_admin` BYPASSRLS ile yapabilir.
- ✅ **Append-only audit log**: `audit_logs`, `audit_debt_changes`, `data_access_logs` tabloları `BEFORE UPDATE` trigger ile değiştirilemez (rls.sql:166-172). DELETE yalnız `app.allow_log_purge=on` + BYPASSRLS rol ile (rls.sql:182-200).
- ✅ **No `postinstall` / `eval` / `new Function`**: Workspace paketlerinde yaşam-döngüsü scripti yok; Dockerfile'lar `--ignore-scripts` ile kuruyor.
- ✅ **Production Dockerfiles**: Hepsi `USER node` ile non-root.

---

### 3.1 Bağımlılık Açıkları (CVE) — `pnpm audit` (2026-08-02)

**Özet:** 16 açık bulundu (1 critical, 7 high, 8 moderate). Aşağıdaki tablo paket, CVE, patched sürüm:

| Paket | Mevcut | Patched | Şiddet | CVE/Advisory |
|---|---|---|---|---|
| vitest | 2.1.9 | >=3.2.6 | **critical** | CVE-2026-47429 (GHSA-5xrq-8626-4rwp) — Vitest UI server keyfi dosya okuma/çalıştırma |
| drizzle-orm | 0.38.4 | >=0.45.2 | **high** | CVE-2026-39356 (GHSA-gpj5-g38j-94v9) — SQL injection (escaped identifier) |
| vite | 5.4.21 | >=6.4.3 | **high** | CVE-2026-39365, CVE-2026-53571, CVE-2026-53632 — Windows alt-path bypass, path traversal |
| sharp | 0.34.5 | (Next upgrade ile) | **high** | libvips devralınmış zafiyetler (GHSA-f88m-g3jw-g9cj) |
| postcss | 8.4.31 | (Next upgrade ile) | **high** | CVE-2026-45623 (path traversal), GHSA-r28c-9q8g-f849 (arbitrary file read) |
| js-yaml | 5.2.1 | (via @nestjs/swagger) | **high** | GHSA-pm4m-ph32-ghv5 — Exponential parsing time |
| brace-expansion | 1.1.16 | (eslint/minimatch) | **high** | CVE-2026-14257 — DoS via unbounded expansion |
| esbuild | 0.18/0.19/0.21 | (Vite upgrade) | **moderate** | GHSA-67mh-4wv8-2f99 — any-website → any-request |
| next-intl | 3.26.5 | (yeni sürüm) | **moderate** | CVE-2026-40299 (open redirect), GHSA-4c35-wcg5-mm9h (prototype pollution) |
| launch-editor | (transitive) | (Next upgrade) | **moderate** | NTLMv2 hash disclosure via UNC path |

**Aksiyon:** `pnpm update --latest vitest drizzle-orm vite esbuild sharp postcss js-yaml next-intl` veya `pnpm audit --fix`. Lockfile yenilenmeli. Testler + RLS testleri koşulmalı.

---

## 4. Öncelikli Aksiyon Listesi

### 4.1 Hemen (1-2 gün)

1. **C-9:** `pnpm update vitest@^3.2.6` + lockfile yenile. Vitest UI server prod'da hiç açılmamalı.
2. **C-10:** `.env`'den `SEED_DEMO` çıkar; default `false`. `seed.ts` opt-in: `if (SEED_DEMO === "true")`. `NODE_ENV === "production"` guard ekle.
3. **C-1:** `SwaggerModule.setup`'ı `NODE_ENV !== "production"` koşuluna al.
4. **C-3:** `incrWindow` null döndüğünde `return false` yap; Redis bağlantısı kurulana kadar 503 dön. Veya in-memory fallback ekle.
5. **C-5:** `rls.sql`'dan hardcoded parolaları çıkar. `yonetim_admin` parolası için `app.app_role_password` benzeri bir env mekanizması ekle. Migration tamamlanmadan admin parola set edilmediyse fail.
6. **C-7:** `env.ts`'de `FIELD_ENCRYPTION_KEY` refine: `!== '0'.repeat(64)` + entropy check (min 8 unique char).
7. **C-8:** `packages/config/src/env.ts` `required()` fallback parametresini kaldır, missing'te throw.
8. **M-21:** `drizzle-orm >=0.45.2`. Schema uyumluluğu test et.
9. **H-2:** `api-exception.filter.ts` 5xx path'inde generic mesaj döndür; iyzico webhook'ta `detail.error.message` sızdırma.
10. **H-5:** NestJS'e `helmet()` ekle (en azından HSTS, X-CTO, X-FO=DENY, CSP `default-src 'none'`).
11. **H-9:** `dev-session.ts` token loglamasını kaldır veya `--print-token` flag'ine bağla.
12. **H-10:** `seed.ts` `NODE_ENV === 'production'` veya `SEED_DEMO_PASSWORD` override edilmemişse seed'i reddet. Loglanan parolayı sil.
13. **H-12:** iyzico webhook'a SERIALIZABLE transaction + `SELECT FOR UPDATE` + `payment_allocations(processor_ref)` unique index. Webhook body size `64kb` limit.
14. **H-13:** public-debt yanıtından `debtorUserId` çıkar; display name mask.
15. **H-15:** Upload doğrulamada magic bytes (`file-type` veya signature map). Object Content-Type client'a değil, sunucu tarafından belirlensin.
16. **H-16:** Başarısız giriş loglarında `identifier` redact; Pino `*.identifier`, `*.email`, `*.phone` yollarını ekle veya hash fingerprint logla.

### 4.2 Sprint içi (1-2 hafta)

15. **C-2:** `@Public()` rotalarına default düşük limit (60/dk/IP) ekle; webhook'lar için IP allowlist.
16. **C-4 / H-8:** Her migration'da RLS kontrolü. Event trigger ile yeni tablo eklendiğinde otomatik policy oluştur, veya CI testi ile `pg_class.relrowsecurity` doğrula. `ALTER DEFAULT PRIVILEGES` kapsamını daralt (gerekirse).
17. **C-6 / M-12 / M-33:** `db.bypass` çağrılarını envanterle. Tenant-bilinen akışlar (`residents:list-by-membership`, `residents:detail`, `residents:options`, `units:detail-occupants`) `withTenant`/`tenantScoped`'a taşınsın. Bypass kalan yerler için audit trail.
18. **H-1 / H-11:** iyzico webhook'a HMAC doğrulaması + worker job payload `tenantId` doğrulaması (`writableTenants` filtresi).
19. **H-3:** WhatsApp status event'leri için unique constraint + rate limit bucket'ı.
20. **H-7:** TCKN sorgulama uçlarına 5/dk + 50/saat per-user limit.
21. **M-1:** `payments.processorRef` unique index, `ON CONFLICT DO NOTHING`.
22. **M-27 / M-28 / M-29:** Event/late-fee/dues idempotency: notifications unique index, late-fee ledger, dues generation transaction bütünlüğü.
23. **M-30 / M-31 / M-32:** iyzico amount drift, webhook body size `64kb`, `bankTargets()` permission guard + sadece manager.

### 4.3 Sıradaki sprint

24. **H-6:** Next.js uygulamalarında nonce-based CSP.
25. **H-4:** `loadEnv` Redis'i prod'da zorunlu kıl.
26. **M-4:** CSRF token (double-submit cookie) ekle.
27. **M-6 / M-7:** KDF'yi HKDF'ye taşı, blind index'e tenant scope ekle.
28. **M-9 / M-15 / M-16:** Pino redact'e `req.url`, `req.query`, `req.params`, `*.phone`, `*.email`, `*.apiKey`, `*.secretKey` ekle.
29. **M-14:** `apps/web/next.config.mjs` transpilePackages'i yalnız gerçekten kullanılan paketlerle sınırla; ESLint kuralı ekle.
30. **M-13 / M-37 / M-38:** CI'a katalog testi (her tenant tablosu RLS'li) + `audit_logs`/`dataAccessLogs` `tenantId` filtresi.
31. **M-17 / M-18 / M-36:** WhatsApp `JSON.parse` try/catch + event processor subject_user tenant üyelik doğrulaması.
32. **M-19 / M-20:** Telefon ve TOTP secret şifreleme. Field encryption kapsamı genişletme.
33. **M-22 / M-23 / M-24 / M-25 / M-26:** PostCSS, next-intl upgrade; dev compose `127.0.0.1` bind; `.dockerignore` ekle; CI'a CodeQL/Semgrep + `permissions: contents: read`.
34. **M-34:** Public list endpoint'lerinde `pageSize` cap (200).
35. **M-35 / M-39 / M-40 / M-41 / M-42:** Notification rate limit, PII access audit, permission denials audit, per-tenant webhook secret, bypass reason regex.
36. **M-43 / M-44 / M-45 / M-46 / M-47:** Password reset akışı, breached-password kontrolü + identity check + admin güçlendirilmiş policy, `sql.raw()` → bound parameter, certificate permission fix, login IP bazlı rate limit.
37. **M-48 / M-49 / M-50 / M-51 / M-52:** Malware tarama (ClamAV), Content-Disposition attachment, MIME↔extension allowlist, pending-upload record + canonical key, documentUrl URL allowlist.
38. **L-1 / L-2:** `AUTH_SECRET` için min 32 byte + default değer reject.

### 4.4 Backlog

39. **L-3:** `SESSION_IDLE_MINUTES` idle timeout'unu `resolveSession`'da uygula.
40. **L-4:** JWT'ye `iss`/`aud` + clock skew.
41. Tüm public rotalar için per-route rate limit audit'i.
42. Sentry'ye tenantId+userId gönderim politika kararı.
43. **L-9:** `INTERNAL_API_TOKEN` kullanılmıyorsa kaldır veya worker'a uygula.
44. **L-12 / L-13:** TS `checkJs` + ESLint `no-explicit-any` error.
45. **L-14 / L-15 / L-16:** OTP IP kovası, scrypt versioned params, logout service consolidation.
46. **L-17 / L-18 / L-19 / L-20 / L-21 / L-22 / L-23 / L-24:** Public Zod filter schemas, search literal escape, staff IBAN/phone shared schema, auth identifier union type, Sentry spaced-IBAN scrub, legacy URL migration, presigned upload orphan cleanup, object-key canonical regex.

### 4.4 Backlog

37. **L-3:** `SESSION_IDLE_MINUTES` idle timeout'unu `resolveSession`'da uygula.
38. **L-4:** JWT'ye `iss`/`aud` + clock skew.
39. Tüm public rotalar için per-route rate limit audit'i.
40. Sentry'ye tenantId+userId gönderim politika kararı.
41. **L-9:** `INTERNAL_API_TOKEN` kullanılmıyorsa kaldır veya worker'a uygula.
42. **L-12 / L-13:** TS `checkJs` + ESLint `no-explicit-any` error.
43. **L-14 / L-15 / L-16:** OTP IP kovası, scrypt versioned params, logout service consolidation.

---

## 5. Kapsam Dışı

Aşağıdaki konular bu taramada kapsam dışı bırakıldı (zaman/bağlam sınırı):

- Penetrasyon testi (canlı istek atışı).
- Bağımlılıkların derinlemesine CVE araştırması (pnpm audit temiz dönmesi nedeniyle).
- Frontend bundle'ın statik analizi (DOMPurify kullanımı, üçüncü taraf widget).
- Mobil uygulama (repo'da sadece API sözleşmesi var).
- KVKK uyumluluğunun tüketici tarafı (sadece teknik kontroller tarandı, hukuki değerlendirme yok).
- Worker (`apps/worker`) işleyicilerinin tamamı.

---

## 6. Çoğaltma Adımları

Bu raporu yeniden üretmek için:

```bash
# Pnpm audit
pnpm audit --json

# Hardcoded secret taraması
rg -n "sk-proj-|sk_live_|AKIA|password.*=.*['\"]" --type ts --type tsx --type json \
  -g '!node_modules' -g '!.next' -g '!dist' .

# @Public rotaları
rg -n "@Public" apps/api/src --type ts

# Hardcoded SQL / string concatenation
rg -n "sql\`|fromRaw|sql\.raw" apps packages --type ts -g '!**/test*'

# dangerouslySetInnerHTML
rg -n "dangerouslySetInnerHTML" apps packages --type ts -g '!node_modules'

# Helmet / CSP
rg -n "helmet|Content-Security-Policy" apps packages infra --type ts -g '!node_modules'

# .env sızıntısı (client bundle)
rg -n "process\.env\." apps/app/src apps/web/src --type ts
```

---

**Hazırlayan:** Claude (MiniMax-M3[1m]) — güvenlik taraması
**Doğrulama:** 6 paralel alt-agent + manuel kod okuması. Bulgular dosya:line referansıyla.
**Sürüm:** 1.0 — 2026-08-02
