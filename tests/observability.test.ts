import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * TRACK D — gözlemlenebilirlik kapıları (GAP 4.8.1–4.8.2, MIMARI-PLAN §15).
 *
 * Buradaki testler kodun **davranışını** değil, kurulumun kapalı kalmasını
 * koruyor. Gözlemlenebilirlik araçları bir kez kurulup unutuluyor ve unutulan
 * yerde yavaşça bozuluyorlar: bir `sendDefaultPii: true` eklenmesi, üretimde
 * aylarca fark edilmeden sakinlerin TCKN'sini üçüncü taraf bir servise
 * taşıyabilir.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Sentry — KVKK ölçülülüğü (md.4)", () => {
  const files = [
    "apps/api/src/infra/observability/sentry.ts",
    "apps/app/sentry.server.config.ts",
    "apps/app/sentry.edge.config.ts",
  ];

  it("hiçbir kurulum varsayılan kişisel veri toplamıyor", () => {
    for (const file of files) {
      const source = read(file);
      expect(source, file).toContain("sendDefaultPii: false");
      expect(source, file).not.toContain("sendDefaultPii: true");
    }
  });

  it("çerez ve yetkilendirme başlığı her kurulumda budanıyor", () => {
    for (const file of files) {
      const source = read(file);
      expect(source, file).toMatch(/delete .*\.cookies/);
      expect(source, file).toContain("authorization");
    }
  });

  it("DSN yoksa SDK hiç kurulmuyor", () => {
    // Yapılandırılmamış bir SDK'yı yine de başlatmak, geliştirmede her hatayı
    // ağa çıkarmaya çalışan bir kuyruk bırakır ve testleri yavaşlatır.
    expect(read("apps/api/src/infra/observability/sentry.ts")).toContain(
      "if (!params.dsn) return false;",
    );
    expect(read("apps/app/src/instrumentation.ts")).toContain(
      "if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;",
    );
  });
});

describe("mimari kapıları yapılandırılmış", () => {
  const config = read(".dependency-cruiser.cjs");

  it("apps/app veritabanı kuralı `error` seviyesinde", () => {
    // `warn` olsaydı CI kırmızıya dönmez ve kural bir tavsiyeye indirgenirdi.
    const rule = config.slice(config.indexOf("app-veritabanina-erisemez"));
    expect(rule.slice(0, 200)).toContain('severity: "error"');
  });

  it("`@/*` takma adı çözümleniyor", () => {
    // Bu olmadan grafik yalnız paket importlarından oluşuyor ve uygulama içi
    // kenarlar hiç görünmüyor — kapılar sessizce yarım çalışır.
    const tsconfig = read("tsconfig.check.json");
    expect(tsconfig).toContain('"@/*"');
    expect(tsconfig).toContain('"@api/*"');
  });

  it("CI mimari kontrolünü koşuyor", () => {
    expect(read("infra/ci/ci.yml")).toContain("pnpm arch");
  });
});

describe("Web Vitals — kimlik sızdırmıyor", () => {
  it("yol şablona indirgeniyor, gerçek kimlik gönderilmiyor", () => {
    const source = read("apps/app/src/components/web-vitals.tsx");
    // Bir daire kimliği metrik etiketine düşerse, performans verisi kimin
    // hangi daireye baktığını sızdıran bir kayda dönüşür (KVKK md.4).
    expect(source).toContain("templatePath");
    expect(source).toContain("[id]");
  });

  it("toplama ucu şemada olmayan alanı kabul etmiyor", () => {
    const source = read("apps/app/src/app/api/vitals/route.ts");
    expect(source).toContain("METRICS.has");
    expect(source).toContain("Number.isFinite");
  });
});
