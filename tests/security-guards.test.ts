import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Güvenlik ve Performans Muhafız Testleri (Security & Performance Guardrails)
 *
 * Bu testler; projedeki kritik güvenlik kısıtlarını (hardcoded secrets,
 * log redaction, production swagger izolasyonu, body limitleri, CSRF)
 * makine seviyesinde denetler. Yeni eklenen veya değiştirilen kodların
 * güvenlik zafiyeti yaratmasını engeller.
 */

const SCAN_DIRS = ["apps/api/src", "apps/app/src", "apps/web/src", "packages"];

function getSourceFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (entry === "node_modules" || entry === ".next" || entry === "dist" || entry === "build") {
        continue;
      }
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...getSourceFiles(fullPath));
      } else if (/\.(ts|tsx|js|mjs)$/.test(entry) && !entry.includes(".test.") && !entry.includes(".spec.")) {
        files.push(fullPath);
      }
    }
  } catch {
    // Dizin yoksa geç
  }
  return files;
}

const sourceFiles = SCAN_DIRS.flatMap((dir) => getSourceFiles(dir));

describe("Güvenlik Muhafızları (Security Guardrails)", () => {
  describe("1. Hardcoded Secret ve Token Taraması", () => {
    it("kaynak kodlarında hardcoded OpenAI, Google veya Stripe canlı anahtarı bulunmuyor", () => {
      // Bilinen canlı gizli anahtar desenleri
      const sensitivePatterns = [
        /\bsk-[a-zA-Z0-9]{32,}\b/, // OpenAI secret
        /\bsk_live_[0-9a-zA-Z]{24,}\b/, // Stripe live secret
        /\bAIza[0-9A-Za-z-_]{35}\b/, // Google API key
      ];

      const offenders: { file: string; match: string }[] = [];

      for (const file of sourceFiles) {
        const content = readFileSync(file, "utf8");
        for (const pattern of sensitivePatterns) {
          const match = content.match(pattern);
          if (match) {
            offenders.push({ file, match: match[0].slice(0, 8) + "..." });
          }
        }
      }

      expect(offenders).toEqual([]);
    });

    it("kaynak kodlarında hardcoded canlı JWT token bulunmuyor", () => {
      // Tipik JWT deseni: eyJhbGciOi...
      const jwtPattern = /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/;
      const offenders: string[] = [];

      for (const file of sourceFiles) {
        // Test ve mock dosyaları hariç
        if (file.includes("mock") || file.includes("fixture") || file.includes("test")) continue;
        const content = readFileSync(file, "utf8");
        if (jwtPattern.test(content)) {
          offenders.push(file);
        }
      }

      expect(offenders).toEqual([]);
    });
  });

  describe("2. API Production Sıkılaştırma & Saldırı Yüzeyi Koruması", () => {
    it("Swagger API dokümantasyonu üretimde kapalıdır (C-1)", () => {
      const mainFile = readFileSync("apps/api/src/main.ts", "utf8");
      // SwaggerModule.setup çağrısı !e.isProduction bloğu içinde olmalıdır
      expect(mainFile).toMatch(/if\s*\(!e\.isProduction\)\s*\{[\s\S]*?SwaggerModule\.setup/);
    });

    it("API istek gövdesi boyut sınırı ile korunmaktadır (M-31)", () => {
      const mainFile = readFileSync("apps/api/src/main.ts", "utf8");
      // JSON body limit tanımlanmış olmalıdır (DoS önlemi)
      expect(mainFile).toMatch(/json\(\s*\{[\s\S]*?limit:\s*["']\d+(?:kb|mb)["']/i);
    });

    it("Origin ve Referer tabanlı CSRF savunması mevcuttur (M-4)", () => {
      const mainFile = readFileSync("apps/api/src/main.ts", "utf8");
      expect(mainFile).toContain("requiresCookieCsrf");
      expect(mainFile).toContain("isSafeCsrfRequest");
    });

    it("Rate-limit guard'ı Redis hatasında fail-closed korumasına sahiptir (C-3)", () => {
      const guardFile = readFileSync("apps/api/src/identity/guards/rate-limit.guard.ts", "utf8");
      expect(guardFile).toContain("fail-closed");
    });
  });

  describe("3. KVKK ve PII Log Redaksiyon Bütünlüğü", () => {
    it("Pino log konfigürasyonu tüm kritik PII ve anahtarları maskelemektedir", () => {
      const pinoConfig = readFileSync("apps/api/src/infra/logging/pino.config.ts", "utf8");
      const requiredRedactKeys = [
        "*.password",
        "*.token",
        "*.tckn",
        "*.iban",
        "*.phone",
        "*.email",
        "*.apiKey",
        "*.secret",
      ];

      for (const key of requiredRedactKeys) {
        expect(pinoConfig).toContain(key);
      }
    });
  });

  describe("4. Çok Kiracılı (Multi-Tenant) SQL Injection Önleme", () => {
    it("Drizzle ORM dosyalarında güvensiz raw SQL string birleştirmesi yapılmıyor", () => {
      // Tehlikeli kullanım: sql`... ${değişken}` içinde doğrudan metin interpolasyonu yerine
      // ORM veya parametreli yapı kullanımı.
      // Basitçe raw string query concatenation (örn: sql.raw("... " + input)) kontrolü
      const rawConcatPattern = /sql\.raw\([^)]*\+/;
      const offenders: string[] = [];

      for (const file of sourceFiles) {
        const content = readFileSync(file, "utf8");
        if (rawConcatPattern.test(content)) {
          offenders.push(file);
        }
      }

      expect(offenders).toEqual([]);
    });
  });
});
