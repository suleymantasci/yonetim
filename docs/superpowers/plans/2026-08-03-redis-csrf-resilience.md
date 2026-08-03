# Redis ve CSRF Çalışma Zamanı Dayanıklılığı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redis kapalı yerel geliştirmeyi çalışır tutarken production rate-limit güvenliğini korumak, health/readiness sinyallerini düzeltmek ve son CSRF değişikliğinin gerçek web/API akışlarını kırmasını önlemek.

**Architecture:** API ortam politikası doğrulanmış env üzerinden tek yerde hesaplanacak. Redis ve BullMQ producer istemcileri bağlantı yokken hızlı reddedecek; global guard metadata ile yalnız health uçlarını rate-limit’ten çıkaracak. CSRF kararı ayrı, saf yardımcılarla yalnız session-cookie taşıyan state-changing isteklerde uygulanacak; app server istemcisi yapılandırılmış panel origin’ini iletecek.

**Tech Stack:** NestJS 11, Express, ioredis 5, BullMQ 5, Next.js 15 server actions, Zod, Vitest 3, TypeScript 5.7, pnpm workspace.

## Global Constraints

- Production ortamında Redis erişilemiyorsa rate-limit **fail-closed** kalacak; `503 rate_limiter_unavailable` ve `Retry-After: 60` korunacak.
- Development/test ortamında `RATE_LIMIT_FAIL_OPEN` açıkça `false` değilse Redis yokluğu isteği düşürmeyecek.
- `Host` header’ı CSRF güven sinyali olarak kullanılmayacak.
- Cookie-authenticated state-changing mutation’larda güvenilir Origin/Referer kontrolü korunacak.
- Session’sız public login/mobile/webhook istekleri ve Authorization/Bearer istekleri Origin zorunluluğu yüzünden engellenmeyecek.
- Liveness `/health` bağımlılıkları kontrol etmeyecek; readiness JSON şekli korunacak.
- Redis/BullMQ komutları bağlantı yokken offline queue’da bekletilmeyecek.
- İş alanı modüllerine ve veritabanı şemasına dokunulmayacak.
- Commit veya push işlemi açıkça istenmedikçe yapılmayacak; her görev sonunda çalışma ağacı ve test sonucu raporlanacak.

---

### Task 1: Ortam politikası ve rate-limit skip metadata’sı

**Files:**
- Modify: `apps/api/src/infra/config/env.ts:9-98` — `RATE_LIMIT_FAIL_OPEN` alanı ve typed helper.
- Modify: `apps/api/src/identity/decorators.ts:10-16` — rate-limit skip metadata’sı.
- Modify: `apps/api/src/identity/guards/rate-limit.guard.ts:1-106` — env politikası ve skip kontrolü.
- Modify: `apps/api/src/infra/health/health.controller.ts:1-42` — iki health method’una skip decorator’ı.
- Modify: `tests/api-env-security.test.ts:9-74` — env davranışı testleri.
- Create: `tests/api-rate-limit.test.ts` — guard unit testleri.

**Interfaces:**
- Produces `Env.RATE_LIMIT_FAIL_OPEN: boolean | undefined`.
- Produces `rateLimitFailOpen(e: Env): boolean` semantics: production → `false`; non-production → explicit `false` dışında `true`.
- Produces `RATE_LIMIT_SKIP_KEY` and `SkipRateLimit()` metadata.
- `RateLimitGuard.canActivate()` returns `true` immediately for handlers decorated with `SkipRateLimit()`.

- [ ] **Step 1: Write the failing env and metadata tests**

Add cases to `tests/api-env-security.test.ts` using the existing `baseValid` fixture:

```ts
it("RATE_LIMIT_FAIL_OPEN varsayılanı development'ta açıktır", async () => {
  const e = await loadApi({
    ...baseValid,
    NODE_ENV: "development",
    RATE_LIMIT_FAIL_OPEN: undefined as never,
  });
  expect(e.RATE_LIMIT_FAIL_OPEN).toBeUndefined();
});

it("RATE_LIMIT_FAIL_OPEN false ve 0 değerlerini kapatır", async () => {
  const falseEnv = await loadApi({ ...baseValid, NODE_ENV: "development", RATE_LIMIT_FAIL_OPEN: "false" });
  const zeroEnv = await loadApi({ ...baseValid, NODE_ENV: "development", RATE_LIMIT_FAIL_OPEN: "0" });
  expect(falseEnv.RATE_LIMIT_FAIL_OPEN).toBe(false);
  expect(zeroEnv.RATE_LIMIT_FAIL_OPEN).toBe(false);
});

it("RATE_LIMIT_FAIL_OPEN true ve 1 değerlerini açar", async () => {
  const trueEnv = await loadApi({ ...baseValid, NODE_ENV: "development", RATE_LIMIT_FAIL_OPEN: "true" });
  const oneEnv = await loadApi({ ...baseValid, NODE_ENV: "development", RATE_LIMIT_FAIL_OPEN: "1" });
  expect(trueEnv.RATE_LIMIT_FAIL_OPEN).toBe(true);
  expect(oneEnv.RATE_LIMIT_FAIL_OPEN).toBe(true);
});
```

Create `tests/api-rate-limit.test.ts` with dependency-free mocks for `Reflector`, `ClsService`, `RedisService`, and the HTTP execution context. Cover:

```ts
it("SkipRateLimit handler Redis'e dokunmadan geçer", async () => {
  reflector.getAllAndOverride.mockReturnValueOnce(true);
  await expect(guard.canActivate(exec)).resolves.toBe(true);
  expect(redis.incrWindow).not.toHaveBeenCalled();
});
```

Also add tests for a public route with `incrWindow()` returning `null` in development (true) and production (false, response header `Retry-After=60`, thrown `HttpException` status 503).

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/api-env-security.test.ts tests/api-rate-limit.test.ts
```

Expected: the new env field/decorator behavior fails because the schema, helper, decorator, and guard branch do not exist yet.

- [ ] **Step 3: Add the validated environment field**

In `envSchema`, add the field after `AUTH_OTP_ENABLED`:

```ts
  RATE_LIMIT_FAIL_OPEN: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : value === "true" || value === "1",
    ),
```

Add an exported helper after `env()`:

```ts
export function rateLimitFailOpen(e: Env = env()): boolean {
  if (e.isProduction) return false;
  return e.RATE_LIMIT_FAIL_OPEN !== false;
}
```

- [ ] **Step 4: Add skip metadata and wire the guard/health endpoints**

In `apps/api/src/identity/decorators.ts`, add:

```ts
export const RATE_LIMIT_SKIP_KEY = "yonetim:rate-limit-skip";
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_SKIP_KEY, true);
```

In `RateLimitGuard`, import `RATE_LIMIT_SKIP_KEY` and `rateLimitFailOpen`, then make the first branch of `canActivate()`:

```ts
if (
  this.reflector.getAllAndOverride<boolean>(RATE_LIMIT_SKIP_KEY, [
    exec.getHandler(),
    exec.getClass(),
  ])
) {
  return true;
}
```

Replace both raw `process.env.RATE_LIMIT_FAIL_OPEN === "true"` checks with `rateLimitFailOpen()`.

Decorate both `HealthController.live()` and `HealthController.ready()` with `@SkipRateLimit()` alongside `@Public()`.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
pnpm exec vitest run tests/api-env-security.test.ts tests/api-rate-limit.test.ts
pnpm --filter @yonetim/api typecheck
```

Expected: all focused tests pass and API typecheck exits 0.

---

### Task 2: RedisService fast-fail and controlled connection errors

**Files:**
- Modify: `apps/api/src/infra/redis/redis.service.ts:12-113` — connection options, listeners, client lifecycle.
- Create: `tests/api-redis.test.ts` — fast-fail and listener regression tests.

**Interfaces:**
- `RedisService` public methods retain existing signatures and fallback values.
- Internal Redis clients use `enableOfflineQueue: false`, `connectTimeout: 1000`, `maxRetriesPerRequest: 1`, and a bounded retry strategy.
- `RedisService` owns an error listener and clears an ended client so a later call can create a fresh connection.

- [ ] **Step 1: Write the failing Redis tests**

Create a test that sets a complete valid API environment and points `REDIS_URL` to an unused loopback port. Instantiate `RedisService`, call `raw()`, and assert an error listener exists. Call `incrWindow()` and assert it resolves to `null` within a short bound instead of waiting for the previous retry window:

```ts
it("erişilemeyen Redis komutu hızlıca null döndürür ve error listener taşır", async () => {
  const service = new RedisService();
  const client = service.raw();
  expect(client).not.toBeNull();
  expect(client!.listenerCount("error")).toBeGreaterThan(0);

  const started = performance.now();
  await expect(service.incrWindow("probe", 60)).resolves.toBeNull();
  expect(performance.now() - started).toBeLessThan(2_000);

  await service.onModuleDestroy();
});
```

Add a test that `onModuleDestroy()` remains safe after a failed connection.

- [ ] **Step 2: Run the Redis tests and verify the current implementation fails**

Run:

```bash
pnpm exec vitest run tests/api-redis.test.ts
```

Expected: current implementation has no `error` listener and the command exceeds the short timing bound.

- [ ] **Step 3: Add fast-fail options and listener lifecycle**

Update `conn()` so the client is created with:

```ts
const client = new Redis(url, {
  connectTimeout: 1_000,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt) => (attempt <= 1 ? 100 : null),
});
```

Attach listeners before assigning `this.client`:

```ts
client.on("error", (error) => {
  if (!this.connectionErrorLogged) {
    this.connectionErrorLogged = true;
    this.logger.warn({
      event: "redis.connection_failed",
      error: String(error),
    });
  }
});
client.on("ready", () => {
  this.connectionErrorLogged = false;
});
client.on("end", () => {
  if (this.client === client) this.client = null;
});
this.client = client;
return client;
```

Add `private connectionErrorLogged = false;`. Preserve the existing one-time warning for a missing `REDIS_URL`; do not log key contents.

- [ ] **Step 4: Run Redis tests, focused tests, and API typecheck**

Run:

```bash
pnpm exec vitest run tests/api-redis.test.ts tests/api-rate-limit.test.ts
pnpm --filter @yonetim/api typecheck
```

Expected: all focused tests pass; no unhandled ioredis event appears in test output.

---

### Task 3: BullMQ producer fast-fail configuration

**Files:**
- Modify: `apps/api/src/app.module.ts:73-87` — producer connection options.
- Create: `tests/api-bullmq.test.ts` — source/configuration regression test if a pure factory is extracted.

**Interfaces:**
- API queue producers remain injectable as `QUEUE_SCHEDULED` and `QUEUE_EVENTS`.
- Queue commands fail quickly when Redis is unavailable; queue registration and API bootstrap still succeed.
- Worker configuration remains unchanged and still requires Redis.

- [ ] **Step 1: Add a failing configuration assertion**

Extract a small named factory in `apps/api/src/infra/redis/redis-connection.ts`:

```ts
export function producerRedisConnection(url: string) {
  return {
    url,
    connectTimeout: 1_000,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt: number) => (attempt <= 1 ? 100 : null),
  };
}
```

Before implementation, add `tests/api-bullmq.test.ts` asserting the factory returns the exact fast-fail settings. The test should fail because the file/factory does not exist.

- [ ] **Step 2: Implement and wire the factory**

Create `apps/api/src/infra/redis/redis-connection.ts` with the factory above. In `app.module.ts`, replace the inline connection object with:

```ts
connection: producerRedisConnection(
  env().REDIS_URL ?? "redis://127.0.0.1:6379",
),
```

Import the factory from `./infra/redis/redis-connection`. Do not change worker `BullModule` settings; worker startup semantics are intentionally different.

- [ ] **Step 3: Run queue/config tests and API build**

Run:

```bash
pnpm exec vitest run tests/api-bullmq.test.ts
pnpm --filter @yonetim/api typecheck
pnpm --filter @yonetim/api build
```

Expected: tests, typecheck, and build pass.

---

### Task 4: Extract and correct cookie-authenticated CSRF decisions

**Files:**
- Create: `apps/api/src/infra/security/csrf.ts` — pure CSRF decision and safe-origin helpers.
- Modify: `apps/api/src/main.ts:76-125` — use helpers and remove inline Host fallback logic.
- Modify: `tests/api-csrf.test.ts` — middleware decision tests.

**Interfaces:**
- `buildSafeOrigins(config: { corsOrigins: string; isProduction: boolean; port: number }): Set<string>` returns normalized origins.
- `requiresCookieCsrf(request: { method: string; headers: IncomingHttpHeaders }): boolean` returns true only for mutating requests carrying `yonetim_session` and no `authorization` header.
- `isSafeCsrfRequest(request, safeOrigins): boolean` accepts exact `Origin` or a parsed `Referer` origin; it never trusts `Host`.

- [ ] **Step 1: Write failing pure helper tests**

Create tests covering:

```ts
it("session cookie + trusted Origin geçer", () => {
  expect(
    isSafeCsrfRequest(
      request({ method: "POST", origin: "http://localhost:3001", cookie: "yonetim_session=x" }),
      new Set(["http://localhost:3001"]),
    ),
  ).toBe(true);
});

it("session cookie + kötü Origin reddedilir", () => {
  expect(
    isSafeCsrfRequest(
      request({ method: "POST", origin: "https://evil.example", cookie: "yonetim_session=x" }),
      new Set(["http://localhost:3001"]),
    ),
  ).toBe(false);
});

it("session'sız public POST CSRF kapsamına girmez", () => {
  expect(requiresCookieCsrf(request({ method: "POST" }))).toBe(false);
});

it("Authorization POST cookie-CSRF kapsamına girmez", () => {
  expect(
    requiresCookieCsrf(
      request({ method: "POST", authorization: "Bearer token", cookie: "yonetim_session=x" }),
    ),
  ).toBe(false);
});

it("Referer prefix taklidi kabul edilmez", () => {
  expect(
    isSafeCsrfRequest(
      request({ method: "POST", referer: "https://panel.example.attacker.test/path", cookie: "yonetim_session=x" }),
      new Set(["https://panel.example"]),
    ),
  ).toBe(false);
});
```

Also test that development origins include `http://localhost:3000`, `http://localhost:3001`, `http://127.0.0.1:3000`, `http://127.0.0.1:3001`, and the configured API port, while production adds no implicit loopback application origins.

- [ ] **Step 2: Run CSRF tests and verify failure**

Run:

```bash
pnpm exec vitest run tests/api-csrf.test.ts
```

Expected: tests fail because the helper module does not exist and the current inline middleware would reject sessionless requests / accept Referer prefixes.

- [ ] **Step 3: Implement pure CSRF helpers**

Create `csrf.ts` using `parse` from `cookie` and `SESSION_COOKIE` from `@yonetim/auth/cookie`. Implement method checks for `GET`, `HEAD`, and `OPTIONS`; parse cookie names rather than searching arbitrary substrings; normalize configured origins with `new URL(value).origin`; ignore malformed origins.

For Referer, parse with `new URL(referer).origin` and compare the exact normalized origin. Do not compare with `startsWith`.

- [ ] **Step 4: Replace inline middleware in `main.ts`**

Build the set once after env load:

```ts
const safeOrigins = buildSafeOrigins({
  corsOrigins: e.CORS_ORIGINS,
  isProduction: e.isProduction,
  port: e.PORT,
});
```

Replace the inline decision block with:

```ts
if (!requiresCookieCsrf(req)) return next();
if (isSafeCsrfRequest(req, safeOrigins)) return next();
res.status(403).json({
  error: { code: "csrf_origin_check_failed", message: "Origin doğrulanamadı." },
});
```

Keep the middleware before route handling and keep `Host` entirely out of the decision.

- [ ] **Step 5: Run CSRF tests and API typecheck**

Run:

```bash
pnpm exec vitest run tests/api-csrf.test.ts
pnpm --filter @yonetim/api typecheck
```

Expected: all CSRF cases pass and typecheck exits 0.

---

### Task 5: Forward the app origin for server-to-API calls

**Files:**
- Modify: `apps/app/src/lib/api/server.ts:37-67` — origin forwarding.
- Modify: `tests/api-csrf.test.ts` or create `tests/app-api-origin.test.ts` — pure origin helper tests.

**Interfaces:**
- `resolveApiOrigin(incomingOrigin: string | null, configuredOrigin: string | undefined): string | undefined` returns incoming origin when present, otherwise configured origin, and returns `undefined` for blank values.
- `buildHeaders()` adds `origin` only when `resolveApiOrigin()` returns a value.

- [ ] **Step 1: Write the failing origin helper tests**

Add:

```ts
it("gelen origin'i server API çağrısına taşır", () => {
  expect(resolveApiOrigin("http://localhost:3001", "https://panel.example")).toBe(
    "http://localhost:3001",
  );
});

it("origin yoksa yapılandırılmış panel origin'ine düşer", () => {
  expect(resolveApiOrigin(null, "https://panel.example")).toBe("https://panel.example");
});

it("iki değer de yoksa başlık üretmez", () => {
  expect(resolveApiOrigin(null, undefined)).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused app test and verify failure**

Run:

```bash
pnpm exec vitest run tests/app-api-origin.test.ts
```

Expected: failure because the helper is not exported/implemented.

- [ ] **Step 3: Implement and wire the helper**

Add the pure exported helper near `buildHeaders()`:

```ts
export function resolveApiOrigin(
  incomingOrigin: string | null,
  configuredOrigin: string | undefined,
): string | undefined {
  const incoming = incomingOrigin?.trim();
  if (incoming) return incoming;
  const configured = configuredOrigin?.trim();
  return configured || undefined;
}
```

Inside `buildHeaders()`, after collecting `headerList`, add:

```ts
const origin = resolveApiOrigin(
  headerList.get("origin"),
  process.env.NEXT_PUBLIC_APP_URL,
);
if (origin) result.origin = origin;
```

Do not synthesize an origin for requests when no configured app origin exists.

- [ ] **Step 4: Run app typecheck and focused tests**

Run:

```bash
pnpm exec vitest run tests/app-api-origin.test.ts
pnpm --filter @yonetim/app typecheck
```

Expected: all tests pass and app typecheck exits 0.

---

### Task 6: Correct readiness status and document environment/compose defaults

**Files:**
- Modify: `apps/api/src/infra/health/health.controller.ts:34-42` — use both dependency checks.
- Modify: `.env.example:34-55` — document fail-open and CORS origins.
- Modify: `infra/docker/docker-compose.prod.yml:88-92` — production panel origin default.
- Modify: `tests/api-health.test.ts` — readiness behavior.

**Interfaces:**
- `HealthController.ready()` returns `{ status: "ok" | "degraded", checks: { database: boolean, redis: boolean } }`.
- `status` is `ok` iff both checks are true.

- [ ] **Step 1: Write failing readiness tests**

Extract the status calculation into a small exported pure helper if needed, then add:

```ts
it("yalnız DB hazırsa readiness degraded döner", () => {
  expect(readinessStatus(true, false)).toBe("degraded");
});

it("DB ve Redis hazırsa readiness ok döner", () => {
  expect(readinessStatus(true, true)).toBe("ok");
});

it("DB yoksa readiness degraded döner", () => {
  expect(readinessStatus(false, true)).toBe("degraded");
});
```

- [ ] **Step 2: Run readiness tests and verify failure**

Run:

```bash
pnpm exec vitest run tests/api-health.test.ts
```

Expected: the Redis-false case fails against the current `db ? "ok" : "degraded"` logic.

- [ ] **Step 3: Implement readiness calculation and configuration docs**

Use:

```ts
export function readinessStatus(database: boolean, redis: boolean): "ok" | "degraded" {
  return database && redis ? "ok" : "degraded";
}
```

Call it from `ready()`. In `.env.example`, document:

```dotenv
# Geliştirmede varsayılan fail-open; production'da kod politikası fail-closed.
# RATE_LIMIT_FAIL_OPEN="false"
CORS_ORIGINS="http://localhost:3000,http://localhost:3001"
```

In `docker-compose.prod.yml`, set the API environment default to the production panel origin:

```yaml
CORS_ORIGINS: ${CORS_ORIGINS:-https://panel.localhost}
```

Keep a deployment note that a non-default `APP_DOMAIN` must be paired with an explicit `CORS_ORIGINS` value.

- [ ] **Step 4: Run readiness tests and typecheck**

Run:

```bash
pnpm exec vitest run tests/api-health.test.ts
pnpm --filter @yonetim/api typecheck
```

Expected: all tests pass and API typecheck exits 0.

---

### Task 7: Add isolated runtime smoke coverage and run the full verification matrix

**Files:**
- Create: `tests/runtime-redis-csrf-smoke.mjs` — temporary-port process smoke harness, if the repository’s existing integration layout does not provide an equivalent.
- Modify: `package.json:8-27` — add a named smoke script only if the harness is created.
- No production business files beyond Tasks 1–6.

**Interfaces:**
- Smoke harness starts API with `PORT=3110`, valid local env, and an unreachable Redis port; it always terminates its child process in a `finally`/trap.
- Harness asserts HTTP status/body only and never prints cookies, secrets, or request payloads.

- [ ] **Step 1: Add the failing smoke assertions against the current runtime**

Use a child process command equivalent to:

```bash
NODE_ENV=development PORT=3110 REDIS_URL=redis://127.0.0.1:6399 \
  RATE_LIMIT_FAIL_OPEN=true node -r ts-node/register -r tsconfig-paths/register src/main.ts
```

Assert:

```text
GET /health                         => 200, {status:"ok"}
GET /health/ready                   => 200, checks.redis=false, status:"degraded"
POST /v1/auth/web/password no cookie=> status != 403 csrf_origin_check_failed
POST with cookie + trusted origin   => status != 403 csrf_origin_check_failed
POST with cookie + evil origin      => 403 csrf_origin_check_failed
```

Run the harness before the implementation if practical; record the current failures (health 503, readiness status, CSRF 403) in the task output.

- [ ] **Step 2: Run the smoke harness after Tasks 1–6**

Run the named script or direct command with a maximum timeout of 60 seconds. Expected:

- API starts despite unreachable Redis.
- No unhandled ioredis event is emitted.
- Health/readiness and CSRF assertions pass.
- Child API process is terminated even when an assertion fails.

- [ ] **Step 3: Run focused tests for all changed boundaries**

Run:

```bash
pnpm exec vitest run \
  tests/api-env-security.test.ts \
  tests/api-rate-limit.test.ts \
  tests/api-redis.test.ts \
  tests/api-bullmq.test.ts \
  tests/api-csrf.test.ts \
  tests/app-api-origin.test.ts \
  tests/api-health.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 4: Run repository verification**

Run:

```bash
pnpm test
pnpm --filter @yonetim/api typecheck
pnpm --filter @yonetim/app typecheck
pnpm --filter @yonetim/worker typecheck
pnpm --filter @yonetim/api build
pnpm --filter @yonetim/app build
pnpm --filter @yonetim/worker build
```

Expected: all commands exit 0. Existing Next lint warnings may remain warnings; they must not become errors.

- [ ] **Step 5: Verify the user-facing running processes**

With the existing local processes left intact unless the user restarts them, probe:

```bash
curl -sS -i --max-time 10 http://127.0.0.1:3100/health
curl -sS -i --max-time 10 http://127.0.0.1:3100/health/ready
curl -sS -i --max-time 15 http://127.0.0.1:3001/api/health
```

If the currently running API process predates the changes, report that it must be restarted; do not kill unrelated user processes automatically. After a user restart, repeat the probes and the authenticated panel smoke path.

- [ ] **Step 6: Final review without commit**

Run:

```bash
git diff --check
git status --short
```

Confirm no secrets or local `.env` contents were added to the diff. Report exact test/build results and any remaining dependency issue (for example, Docker daemon not running) without claiming a green runtime until the restarted process has been probed.

## Plan Self-Review

- **Spec coverage:** env policy → Task 1; Redis/Bull fast-fail → Tasks 2–3; health → Tasks 1 and 6; CSRF and app origin → Tasks 4–5; error/log behavior → Tasks 2–3; runtime and full verification → Task 7.
- **Placeholder scan:** every task names concrete files, functions, commands, expected outcomes, and code shapes; no unresolved implementation placeholder is required.
- **Type consistency:** `RATE_LIMIT_FAIL_OPEN` is `boolean | undefined`; `rateLimitFailOpen()` resolves it to `boolean`; `SkipRateLimit()` uses `RATE_LIMIT_SKIP_KEY`; `readinessStatus()` returns the exact status union consumed by `HealthController.ready()`; `resolveApiOrigin()` returns the exact type consumed by `buildHeaders()`.
- **Scope:** all changes remain within the approved runtime-resilience design; worker Redis semantics and business modules are intentionally untouched.
