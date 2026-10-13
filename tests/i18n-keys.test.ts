import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LOCALES } from "@yonetim/i18n";
import { getMessages as getPanelMessages } from "@yonetim/panel-messages";

import { getMessages as getWebMessages } from "../apps/web/src/i18n/messages";

/**
 * Kullanılan çeviri anahtarları gerçekten var mı? — SPEC Bölüm 4.2.
 *
 * `tsc` anahtarları doğrulayamaz (hepsi `string`), bu yüzden kaynak taranır:
 * `getTranslations("ns")` / `useTranslations("ns")` ile açılan namespace'ler
 * ve o değişken üzerinden çağrılan **sabit** anahtarlar çıkarılır. Şablon
 * ifadeli (`t(\`x.${y}\`)`) çağrılar dinamiktir ve atlanır; onları
 * `i18n.test.ts` içindeki enum kapsama testleri korur.
 */
/** Panel ve landing ayrı mesaj kümeleri kullanıyor; her kök kendi kümesine bakılır. */
const ROOTS = [
  { root: "apps/app/src", getMessages: getPanelMessages as (locale: string) => unknown },
  { root: "apps/web/src", getMessages: getWebMessages as (locale: string) => unknown },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/** `const t = getTranslations("ns")` eşlemelerini ve `t("key")` çağrılarını toplar. */
function extractKeys(source: string): string[] {
  const namespaces = new Map<string, string>();
  const declRe =
    /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*"([^"]+)"\s*\)/g;
  for (const m of source.matchAll(declRe)) namespaces.set(m[1]!, m[2]!);

  const keys: string[] = [];
  for (const [variable, namespace] of namespaces) {
    const callRe = new RegExp(`\\b${variable}(?:\\.rich|\\.has)?\\(\\s*"([^"\`]+)"`, "g");
    for (const m of source.matchAll(callRe)) keys.push(`${namespace}.${m[1]!}`);
  }
  return keys;
}

function resolve(bundle: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
      bundle,
    );
}

function collect(root: string): Map<string, string[]> {
  const usages = new Map<string, string[]>();
  for (const file of walk(root)) {
    for (const key of extractKeys(readFileSync(file, "utf8"))) {
      const existing = usages.get(key);
      if (existing) existing.push(file);
      else usages.set(key, [file]);
    }
  }
  return usages;
}

const scanned = ROOTS.map((entry) => ({ ...entry, usages: collect(entry.root) }));

describe("kullanılan çeviri anahtarları", () => {
  it("kaynak taraması anlamlı sayıda anahtar buluyor", () => {
    const total = scanned.reduce((sum, entry) => sum + entry.usages.size, 0);
    expect(total).toBeGreaterThan(300);
  });

  for (const { root, getMessages, usages } of scanned) {
    for (const locale of LOCALES) {
      it(`${root}: '${locale}' dilinde tüm anahtarlar tanımlı`, () => {
        const bundle = getMessages(locale);
        const missing: string[] = [];
        for (const [key, where] of usages) {
          const value = resolve(bundle, key);
          // `.has()` ile korunan opsiyonel anahtarlar dışında hepsi metin olmalı.
          if (typeof value !== "string") missing.push(`${key} (${where[0]})`);
        }
        expect(missing).toEqual([]);
      });
    }
  }
});
