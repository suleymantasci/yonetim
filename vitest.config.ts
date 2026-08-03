import { existsSync, readFileSync } from "node:fs";

import { defineConfig } from "vitest/config";

/**
 * Entegrasyon testleri gerçek Postgres'e bağlanır; bağlantı dizeleri kök `.env`
 * dosyasındadır. Vitest `.env` yüklemez, bu yüzden `INTEGRATION=1` iken
 * bağımlılık eklemeden elle okunur (yalnızca tanımsız değişkenler doldurulur).
 */
function loadDotEnv() {
  const path = new URL("./.env", import.meta.url).pathname;
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key!] !== undefined) continue;
    process.env[key!] = rawValue!.trim().replace(/^["']|["']$/g, "");
  }
}

if (process.env.INTEGRATION === "1") loadDotEnv();

export default defineConfig({
  /*
   * JSX **otomatik** runtime: testlerin `import React` satırı yazması
   * gerekmesin. Uygulamalarda Next zaten bu ayarı kullanıyor; testin ondan
   * farklı derlenmesi, testte geçen bir bileşenin uygulamada patlaması gibi
   * bir ayrışmaya kapı açardı.
   */
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    /*
     * `.tsx` de dahil: erişilebilirlik smoke testi (`tests/a11y-smoke.test.tsx`)
     * gerçek bileşenleri render ediyor.
     *
     * Ortam yine `node`, `jsdom` değil: yalnız **bir** dosya DOM'a ihtiyaç
     * duyuyor ve o dosya kendi `JSDOM` örneğini kuruyor. Global ortamı jsdom
     * yapmak, DOM'la işi olmayan 20 test dosyasının her koşusuna bir jsdom
     * kurulumu bindirirdi.
     */
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "packages/**/*.test.ts",
    ],
    // Entegrasyon testleri gerçek Postgres gerektirir; ayrı komutla çalışır.
    exclude: process.env.INTEGRATION === "1" ? [] : ["tests/integration/**"],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "packages/db/src/schema/**",
        "packages/db/src/seed*.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@yonetim/config": new URL(
        "./packages/config/src/index.ts",
        import.meta.url,
      ).pathname,
      "@yonetim/core/crypto": new URL(
        "./packages/core/src/crypto.ts",
        import.meta.url,
      ).pathname,
      "@yonetim/core": new URL("./packages/core/src/index.ts", import.meta.url)
        .pathname,
      "@yonetim/db": new URL("./packages/db/src/index.ts", import.meta.url)
        .pathname,
      "@yonetim/dues": new URL("./packages/dues/src/index.ts", import.meta.url)
        .pathname,
      "@yonetim/pricing": new URL(
        "./packages/pricing/src/index.ts",
        import.meta.url,
      ).pathname,
      "@yonetim/campaigns": new URL(
        "./packages/campaigns/src/index.ts",
        import.meta.url,
      ).pathname,
      "@yonetim/kvkk": new URL("./packages/kvkk/src/index.ts", import.meta.url)
        .pathname,
      "@yonetim/whatsapp": new URL(
        "./packages/whatsapp/src/index.ts",
        import.meta.url,
      ).pathname,
      "@yonetim/notifications": new URL(
        "./packages/notifications/src/index.ts",
        import.meta.url,
      ).pathname,
      "@yonetim/bank": new URL("./packages/bank/src/index.ts", import.meta.url)
        .pathname,
      "@yonetim/seo": new URL("./packages/seo/src/index.ts", import.meta.url)
        .pathname,
      "@yonetim/jobs": new URL("./packages/jobs/src/index.ts", import.meta.url)
        .pathname,
      "@yonetim/auth/cookie": new URL(
        "./packages/auth/src/cookie.ts",
        import.meta.url,
      ).pathname,
      "@yonetim/auth": new URL("./packages/auth/src/index.ts", import.meta.url)
        .pathname,
      "@yonetim/sms": new URL("./packages/sms/src/index.ts", import.meta.url)
        .pathname,
      "@yonetim/storage": new URL(
        "./packages/storage/src/index.ts",
        import.meta.url,
      ).pathname,
      "@yonetim/emails": new URL(
        "./packages/emails/src/index.ts",
        import.meta.url,
      ).pathname,
      "@yonetim/payment": new URL(
        "./packages/payment/src/index.ts",
        import.meta.url,
      ).pathname,
      "@yonetim/i18n/routing": new URL(
        "./packages/i18n/src/routing.ts",
        import.meta.url,
      ).pathname,
      "@yonetim/i18n": new URL("./packages/i18n/src/index.ts", import.meta.url)
        .pathname,
      "@yonetim/ui": new URL("./packages/ui/src/index.ts", import.meta.url)
        .pathname,
      "@yonetim/contracts/shared": new URL(
        "./packages/contracts/src/_shared/index.ts",
        import.meta.url,
      ).pathname,
      "@yonetim/contracts": new URL(
        "./packages/contracts/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
