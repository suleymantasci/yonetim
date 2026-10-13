import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE, LOCALES, LOCALE_META, formatDateFor, formatMoney, formatPercent,
  formatPeriodFor, isLocale, isRtl, negotiateLocale, parseLocale,
} from "@yonetim/i18n";
import { getMessages as getPanelMessages } from "@yonetim/panel-messages";
import { CAMPAIGN_TEMPLATES } from "@yonetim/campaigns";
import { DUES_FORMULAS, QUORUM_RULES } from "@yonetim/dues";
import { INTENTS, REQUEST_CATEGORIES } from "@yonetim/whatsapp";
import { KVKK_REQUEST_TYPES } from "@yonetim/kvkk";
import { ROLES } from "@yonetim/core";

import { getMessages as getWebMessages } from "../apps/web/src/i18n/messages";

type Bundle = (locale: string) => unknown;

/** Panel ve landing ayrı mesaj kümeleri; parite testleri ikisinde de koşar. */
const BUNDLES: [string, Bundle][] = [
  ["panel", getPanelMessages],
  ["landing", getWebMessages],
];

/** Nesneyi `a.b.c` biçiminde düz anahtar listesine çevirir. */
function flatten(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k),
  );
}

function keysOf(locale: string, getMessages: Bundle = getPanelMessages): string[] {
  return flatten(getMessages(locale)).sort();
}

/** Bir anahtarın değerini döner (yoksa undefined). */
function valueAt(locale: string, key: string, getMessages: Bundle = getPanelMessages): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
      getMessages(locale),
    );
}

describe("dil yapılandırması", () => {
  it("Türkçe ve İngilizce desteklenir, varsayılan Türkçedir", () => {
    expect(LOCALES).toEqual(["tr", "en"]);
    expect(DEFAULT_LOCALE).toBe("tr");
  });

  it("her dilin biçimlendirme meta verisi tanımlıdır", () => {
    for (const locale of LOCALES) {
      const meta = LOCALE_META[locale];
      expect(meta.nativeName.length).toBeGreaterThan(0);
      expect(meta.htmlLang.length).toBeGreaterThan(0);
      expect(meta.currency).toBe("TRY");
      expect(meta.direction).toBe("ltr");
    }
  });

  it("bilinmeyen dil varsayılana düşer", () => {
    expect(parseLocale("de")).toBe("tr");
    expect(parseLocale(undefined)).toBe("tr");
    expect(isLocale("fr")).toBe(false);
    expect(isRtl("tr")).toBe(false);
  });

  it("Accept-Language başlığından dil seçer", () => {
    expect(negotiateLocale("en-GB,en;q=0.9,tr;q=0.8")).toBe("en");
    expect(negotiateLocale("tr-TR,tr;q=0.9")).toBe("tr");
    expect(negotiateLocale("de-DE,de;q=0.9")).toBe("tr");
    expect(negotiateLocale(null)).toBe("tr");
    // Kalite sırası önemsenmelidir: düşük q'lu en, yüksek q'lu desteklenmeyen dilden sonra gelir.
    expect(negotiateLocale("fr-FR;q=1.0,en;q=0.5")).toBe("en");
  });
});

describe.each(BUNDLES)("mesaj dosyası paritesi (%s)", (_name, bundle) => {
  it("tüm dillerde birebir aynı anahtar kümesi bulunur", () => {
    const reference = keysOf(DEFAULT_LOCALE, bundle);

    for (const locale of LOCALES) {
      if (locale === DEFAULT_LOCALE) continue;
      const current = keysOf(locale, bundle);

      const missing = reference.filter((k) => !current.includes(k));
      const extra = current.filter((k) => !reference.includes(k));

      expect(missing, `'${locale}' dilinde eksik anahtarlar`).toEqual([]);
      expect(extra, `'${locale}' dilinde fazladan anahtarlar`).toEqual([]);
    }
  });

  it("hiçbir çeviri boş bırakılmamıştır", () => {
    for (const locale of LOCALES) {
      for (const key of keysOf(locale, bundle)) {
        const value = valueAt(locale, key, bundle);
        expect(typeof value, `${locale}:${key}`).toBe("string");
        expect(String(value).trim().length, `${locale}:${key} boş`).toBeGreaterThan(0);
      }
    }
  });

  it("yer tutucular diller arasında tutarlıdır", () => {
    // `{amount}` gibi değişkenler her dilde aynı olmalı; aksi halde çalışma
    // zamanında eksik değer hatası oluşur.
    const placeholder = /\{(\w+)(?:,[^}]*)?\}/g;

    for (const key of keysOf(DEFAULT_LOCALE, bundle)) {
      const names = (locale: string) => {
        const value = String(valueAt(locale, key, bundle) ?? "");
        return [...value.matchAll(placeholder)].map((m) => m[1]).sort();
      };

      for (const locale of LOCALES) {
        if (locale === DEFAULT_LOCALE) continue;
        expect(names(locale), `${key} yer tutucuları`).toEqual(names(DEFAULT_LOCALE));
      }
    }
  });

  it("İngilizce çeviriler Türkçeden farklıdır (kopyala-yapıştır kontrolü)", () => {
    // Marka adı, kısaltmalar ve teknik alan adları aynı kalabilir; bunlar hariç
    // tutulur. Kalanların büyük bölümü gerçekten çevrilmiş olmalı.
    const identical: string[] = [];
    const compared: string[] = [];

    for (const key of keysOf(DEFAULT_LOCALE, bundle)) {
      const tr = String(valueAt("tr", key, bundle) ?? "");
      const en = String(valueAt("en", key, bundle) ?? "");
      if (tr.length < 8) continue;
      compared.push(key);
      if (tr === en) identical.push(key);
    }

    const identicalRatio = identical.length / Math.max(1, compared.length);
    expect(identicalRatio, `aynı kalan anahtarlar: ${identical.slice(0, 8).join(", ")}`)
      .toBeLessThan(0.1);
  });
});

describe("enum etiketleri her dilde tam", () => {
  const cases: [string, readonly string[]][] = [
    ["role", ROLES],
    ["duesFormula", DUES_FORMULAS],
    ["duesFormulaDescription", DUES_FORMULAS],
    ["quorumRule", Object.keys(QUORUM_RULES)],
    ["quorumExample", Object.keys(QUORUM_RULES)],
    ["intent", INTENTS],
    ["requestCategory", REQUEST_CATEGORIES],
    ["kvkkRequestType", KVKK_REQUEST_TYPES],
  ];

  for (const [namespace, values] of cases) {
    for (const locale of LOCALES) {
      it(`${locale}: enum.${namespace} tüm değerleri kapsar`, () => {
        for (const value of values) {
          const label = valueAt(locale, `enum.${namespace}.${value}`);
          expect(typeof label, `enum.${namespace}.${value}`).toBe("string");
          expect(String(label).length).toBeGreaterThan(0);
        }
      });
    }
  }
});

describe("kampanya şablonları her dilde tam", () => {
  for (const locale of LOCALES) {
    it(`${locale}: her şablonun adı, açıklaması, başlığı ve maddeleri var`, () => {
      for (const template of CAMPAIGN_TEMPLATES) {
        const base = `marketing.campaigns.template.${template.key}`;
        for (const field of ["name", "description", "headline"]) {
          const value = valueAt(locale, `${base}.${field}`, getWebMessages);
          expect(typeof value, `${base}.${field}`).toBe("string");
        }
        const bullets = valueAt(locale, `${base}.bullets`, getWebMessages);
        expect(typeof bullets, `${base}.bullets`).toBe("string");
        expect(String(bullets).split("|").length).toBeGreaterThanOrEqual(2);
      }
    });

    it(`${locale}: kullanılan tüm rozetler çevrilmiş`, () => {
      const badges = [...new Set(CAMPAIGN_TEMPLATES.map((t) => t.badge).filter(Boolean))];
      for (const badge of badges) {
        expect(typeof valueAt(locale, `marketing.campaigns.badge.${badge}`, getWebMessages), badge).toBe("string");
      }
    });
  }
});

describe("dile duyarlı biçimlendirme", () => {
  it("para birimi her dilde ₺ ile gösterilir", () => {
    for (const locale of LOCALES) {
      const formatted = formatMoney(125_050, locale);
      expect(formatted).toMatch(/[₺]|TRY/);
      expect(formatted).toContain("250");
    }
  });

  it("binlik ayırıcı dile göre değişir", () => {
    expect(formatMoney(125_050, "tr")).toContain("1.250,50");
    expect(formatMoney(125_050, "en")).toContain("1,250.50");
  });

  it("yüzde biçimlendirmesi çalışır", () => {
    expect(formatPercent(0.85, "tr")).toContain("85");
    expect(formatPercent(0.85, "en")).toContain("85");
  });

  it("tarih düzeni dile göre değişmez formatta ama yereldir", () => {
    const date = new Date("2026-03-10T12:00:00Z");
    expect(formatDateFor(date, "tr")).toBe("10.03.2026");
    expect(formatDateFor(date, "en")).toBe("10/03/2026");
  });

  it("dönem adı dile göre çevrilir", () => {
    expect(formatPeriodFor("2026-03", "tr")).toContain("Mart");
    expect(formatPeriodFor("2026-03", "en")).toContain("March");
  });

  it("geçersiz dönem anahtarı olduğu gibi döner", () => {
    expect(formatPeriodFor("bozuk", "tr")).toBe("bozuk");
  });
});
