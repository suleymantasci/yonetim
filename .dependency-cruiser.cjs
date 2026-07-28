/**
 * Mimari değişmezlerin makine tarafından zorlanması — MIMARI-PLAN §8.3 / §15.
 *
 * ESLint "kim neyi import edebilir" sorusunu **dosya bazında** cevaplıyor;
 * burası aynı soruyu **grafik** üzerinden cevaplıyor. Fark önemli: ESLint
 * doğrudan importu görür, dolaylı olanı görmez. `apps/app → @yonetim/jobs →
 * @yonetim/db` zinciri A5'te tam olarak böyle keşfedildi — her adımı tek tek
 * bakınca kurallara uygundu, zincirin tamamı değildi.
 *
 * Üç kapı (§15):
 *   1. `apps/app` veritabanını **hiçbir yoldan** göremez
 *   2. `@yonetim/db` yalnız `apps/api/src/infra/db/**` üzerinden kullanılır
 *   3. `getDb` / `getAdminDb` bare çağrısı yok  ← ESLint'te (sözdizimi işi)
 */
module.exports = {
  forbidden: [
    {
      name: "app-veritabanina-erisemez",
      severity: "error",
      comment:
        "MIMARI-PLAN §8.3 değişmez 3: apps/app yalnız sunum katmanı. Veri " +
        "`lib/api/server.ts` üzerinden apps/api'den gelir. Bu kural DOLAYLI " +
        "yolları da kapatıyor — bir ara paket üzerinden erişim de ihlaldir.",
      from: { path: "^apps/app/src" },
      to: { path: "^(packages/db|node_modules/drizzle-orm)" },
    },
    {
      name: "app-yan-etkili-paket-kullanmaz",
      severity: "error",
      comment:
        "Gönderim ve iş çalıştırma api/worker'ın işi. `apps/app` bu paketleri " +
        "import ederse, render katmanı WhatsApp mesajı gönderebilir hale gelir " +
        "ve ikinci bir yan etki kaynağı doğar (§8.3).",
      from: { path: "^apps/app/src" },
      to: {
        path: "^packages/(jobs|whatsapp|sms|emails|notifications|payment|bank)",
      },
    },
    {
      name: "db-yalniz-db-service-uzerinden",
      severity: "error",
      comment:
        "MIMARI-PLAN §8.3 değişmez 1: `getDb`/`getAdminDb` yalnız " +
        "`db.service.ts`'den çağrılır. Sağlık probu tek bilinçli istisna — " +
        "tenant bağlamı yok, RLS transaction'ı açmadan `SELECT 1` atıyor.",
      from: {
        path: "^apps/api/src",
        pathNot:
          "^apps/api/src/(infra/db/db\\.service\\.ts|infra/health/health\\.controller\\.ts|migrate\\.ts)",
      },
      to: { path: "^packages/db/src/client\\.ts" },
    },
    {
      name: "worker-http-ile-api-cagirmaz",
      severity: "error",
      comment:
        "MIMARI-PLAN §10: worker api'nin servislerini doğrudan import eder. " +
        "HTTP istemcisi eklemek, job'ın kendine kimlik uydurması ve aynı " +
        "kuralın iki kez doğrulanması demekti.",
      from: { path: "^apps/worker/src" },
      to: { path: "^apps/app/src" },
    },
    {
      name: "contracts-sadece-zod",
      severity: "error",
      comment:
        "`packages/contracts` iki tarafın ortak sözleşmesi; veritabanına ya da " +
        "Nest'e bağımlı olursa `apps/app` onları da çekmek zorunda kalır (§7).",
      from: { path: "^packages/contracts/src" },
      to: { path: "^(packages/db|node_modules/@nestjs|node_modules/drizzle-orm)" },
    },
    {
      name: "dongusel-bagimlilik-yok",
      severity: "error",
      comment:
        "Döngü modül sınırının bulanıklaştığının işareti. Bilinen tek döngü " +
        "(auth ↔ db) `dev-session` betiği `packages/auth`'a taşınarak kapandı; " +
        "kural artık `error` — yenisinin sessizce eklenmesini engelliyor.",
      from: {},
      to: { circular: true },
    },
    {
      name: "orphan-dosya-yok",
      severity: "warn",
      comment:
        "Kimsenin import etmediği dosya: ya ölü kod ya da bağlanması unutulmuş " +
        "bir modül. İkisi de bakım borcu.",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)(eslint|vitest|next|drizzle|tailwind|postcss)\\.config\\.",
          "^apps/[^/]+/src/(main|middleware|migrate)\\.ts$",
          // Next App Router dosyaları konvansiyonla yükleniyor, import edilmez.
          "^apps/(app|web)/src/app/",
          "^apps/[^/]+/src/instrumentation\\.ts$",
        ],
      },
      to: {},
    },
  ],

  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(node_modules|dist|\\.next|drizzle/meta)",
    },
    tsPreCompilationDeps: true,
    /**
     * Workspace paketleri kaynak TypeScript olarak yayınlanıyor; çözümleme
     * `tsconfig.base.json`'daki `paths` ile yapılıyor, yoksa `@yonetim/*`
     * importları `node_modules`'a düşer ve grafik kopar.
     */
    tsConfig: { fileName: "tsconfig.check.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["main", "types"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
