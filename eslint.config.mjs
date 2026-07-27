import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * ESLint yapılandırması — MIMARI-PLAN §14 A0 / §15.
 *
 * Bu dosya projede **ilk** ESLint yapılandırmasıdır (öncesinde `pnpm lint`
 * interaktif kurulum istiyordu). Track D'ye bırakılamazdı: §15'teki üç kalite
 * kapısının üçü de buna bağlı ve göç boyunca çalışması gerekiyor —
 *
 *   1. `apps/app` veritabanını göremez  (§8.3 değişmez 3)
 *   2. `@yonetim/db` yalnız `apps/api/src/infra/db/**` üzerinden (§8.3 değişmez 1)
 *   3. `getDb` / `getAdminDb` bare çağrısı yok               (§8.3 değişmez 1)
 *
 * Kurallar tavsiye değil **kapı**: A5'te `apps/app` bağımlılığı kaldırıldığında
 * ikili durum (iki paralel veri yolu) imkânsız hale gelsin diye buradan
 * başlıyorlar.
 */

/** `apps/app` içinden yasak importlar — veri erişimi UI'a geri sızmasın. */
const APP_FORBIDDEN_IMPORTS = {
  paths: [
    {
      name: "@yonetim/db",
      message:
        "apps/app veritabanına doğrudan erişemez (MIMARI-PLAN §8.3). " +
        "Veriyi `lib/api/server.ts` üzerinden apps/api'den çekin.",
    },
    {
      name: "drizzle-orm",
      message:
        "apps/app SQL yazmaz (MIMARI-PLAN §8.3). Sorgu apps/api'deki " +
        "repository katmanına aittir.",
    },
  ],
  patterns: [
    {
      group: ["drizzle-orm/*", "@yonetim/db/*"],
      message:
        "apps/app veritabanı katmanını import edemez (MIMARI-PLAN §8.3).",
    },
  ],
};

/**
 * Göç sırası — MIMARI-PLAN §14 Track A.
 *
 * Kapı 1 baştan **tüm** `apps/app`'e uygulansaydı A0 kırmızı başlardı; göç
 * bitene kadar (A5) hiçbir kapı çalışmazdı. Bunun yerine kapı, henüz göç
 * etmemiş dosyaları geçici olarak muaf tutuyor ve bu liste **her fazda
 * kısalıyor**. Böylece göç eden her klasör geri dönüşe karşı anında kilitleniyor;
 * §16'daki "55 dosyalık göç yarıda kalır" riski liste boşalınca kapanıyor.
 *
 * A5 sonunda bu dizi boşalır ve `apps/app/package.json`'dan `@yonetim/db` +
 * `drizzle-orm` kaldırılır — ondan sonra kural zaten fiziksel olarak zorunlu.
 */
const PENDING_DB_MIGRATION = [
  "apps/app/src/lib/audit.ts",
  "apps/app/src/lib/api.ts",
  "apps/app/src/lib/context.ts",
  "apps/app/src/lib/notify.ts",
  "apps/app/src/lib/shell-data.ts",
  "apps/app/src/lib/form.ts",
  "apps/app/src/app/api/**",
  // A1–A4'te göç edenler listeden çıkarıldı; kalanlar A5'te düşecek.
  "apps/app/src/app/panel/layout.tsx",
  "apps/app/src/app/yonetim/**",
  "apps/app/src/app/sakin/**",
  "apps/app/src/app/giris/**",
  "apps/app/src/app/odeme/**",
  "apps/app/src/app/belge/**",
  "apps/app/src/middleware.ts",
  "apps/app/src/components/shell/actions.ts",
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "packages/db/drizzle/**",
      "**/*.d.ts",
      "**/*.d.mts",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Kullanılmayan değişkenler: `_` öneki bilinçli görmezden gelmedir.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      // `any` göçün ortasında geçici olarak kaçınılmaz; uyarı kalsın, kapı olmasın.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
      /**
       * Kod tabanı boyunca "önce varsayılan, sonra daralt" deyimi kullanılıyor
       * (`let database = "unknown"; try { … } catch { … }`). Başlangıç değeri
       * teknik olarak ölü ama okuyucuya durumun tamamını gösteriyor; rule bunu
       * hata sayıyor. Uyarı olarak bırakıldı: gerçek ölü atamayı yine görürüz,
       * ama göç sırasında ilgisiz dosyaları yeniden yazmaya zorlamaz.
       */
      "no-useless-assignment": "warn",
    },
  },

  /* ---------------------------------------------------------------- *
   * KAPI 1 — apps/app veritabanını göremez (§8.3 değişmez 3)
   * ---------------------------------------------------------------- */
  {
    files: ["apps/app/**/*.{ts,tsx}"],
    ignores: PENDING_DB_MIGRATION,
    rules: {
      "no-restricted-imports": ["error", APP_FORBIDDEN_IMPORTS],
    },
  },

  /* ---------------------------------------------------------------- *
   * React / erişilebilirlik — §12.1'deki a11y çalışması korunsun diye
   * kurallar makine tarafından denetleniyor, sadece belgede yazmıyor.
   * ---------------------------------------------------------------- */
  {
    files: ["apps/**/*.tsx", "packages/ui/**/*.tsx"],
    plugins: { "jsx-a11y": jsxA11y, "react-hooks": reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Etiket ilişkisini `id`/`htmlFor` ile kuruyoruz; kural sarmalamayı da
      // şart koştuğu için yanlış pozitif üretiyor.
      "jsx-a11y/label-has-associated-control": "off",
    },
  },

  /* ---------------------------------------------------------------- *
   * KAPI 2 — apps/api içinde DB'ye tek kapı (§8.3 değişmez 1–2)
   *
   * `@yonetim/db` yalnız `infra/db/**` ve `identity/**` (oturum çözümlemesi
   * şema tablolarını okur) içinden import edilebilir. Repository'ler `tx`
   * içinde şema nesnelerine ihtiyaç duyduğu için tablo importu serbest;
   * yasak olan `getDb`/`getAdminDb` **fonksiyonlarıdır**.
   * ---------------------------------------------------------------- */
  {
    files: ["apps/api/**/*.ts"],
    ignores: [
      "apps/api/src/infra/db/**",
      "apps/api/src/infra/health/health.controller.ts",
      "apps/api/src/migrate.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@yonetim/db",
              importNames: [
                "getDb",
                "getAdminDb",
                "getClient",
                "getAdminClient",
              ],
              message:
                "Bare bağlantı yasak (MIMARI-PLAN §8.3 değişmez 1–2). " +
                "Her sorgu bir transaction içinde olmalı: DbService.tx() / .platform() / .bypass().",
            },
          ],
        },
      ],
    },
  },

  /* ---------------------------------------------------------------- *
   * KAPI 3 — `withTenant` / `withBypassRls` doğrudan çağrılmaz
   * ---------------------------------------------------------------- */
  {
    files: ["apps/api/**/*.ts"],
    ignores: ["apps/api/src/infra/db/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name=/^(withTenant|withBypassRls|withPlatform)$/]",
          message:
            "RLS bağlamı elle kurulmaz (MIMARI-PLAN §8.2). DbService kullanın: " +
            "tx() · txWithReason() · platform() · bypass().",
        },
      ],
    },
  },

  /* ---------------------------------------------------------------- *
   * Test ve betikler
   * ---------------------------------------------------------------- */
  {
    files: [
      "tests/**/*.ts",
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/vitest.config.ts",
    ],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-restricted-imports": "off",
      "no-restricted-syntax": "off",
    },
  },
  {
    files: [
      "**/*.mjs",
      "**/*.cjs",
      "**/*.config.{js,mjs,ts}",
      "packages/db/src/{seed,migrate}.ts",
    ],
    rules: { "no-console": "off" },
  },
);
