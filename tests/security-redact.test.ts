import { describe, expect, it } from "vitest";

/**
 * H-16 (SECURITY-REVIEW.md): Pino redact listesi PII/API anahtarı
 * yollarını kapsamalı. Redact edilmesi gereken alanlar:
 * - identifier / email / phone (giriş logları, KVKK kapsamında PII)
 * - apiKey / secret / secretKey / clientSecret (üçüncü taraf API anahtarları)
 *
 * Bu test, listeyi **kaynak koddan** çekip beklenen anahtarları içerdiğini
 * doğrular. Yeni bir PII alanı eklendiğinde bu listeye eklenmesi gerektiğini
 * hatırlatır.
 */
describe("Pino redact list (apps/api)", () => {
  it("PII ve secret alanlarını kapsar", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../apps/api/src/infra/logging/pino.config.ts",
      ),
      "utf8",
    );
    // Redact listesinde bulunması gereken yollar.
    const required = [
      "*.identifier",
      "*.email",
      "*.phone",
      "*.apiKey",
      "*.secret",
      "*.secretKey",
      "*.clientSecret",
      "*.tckn",
      "*.iban",
      "*.password",
      "*.token",
      "req.headers.cookie",
      "req.headers.authorization",
    ];
    for (const key of required) {
      expect(source, `${key} redact listesinde olmalı`).toContain(key);
    }
  });
});
