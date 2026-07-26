import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getMessages, LOCALES } from "@yonetim/i18n";

/**
 * Kullanılan çeviri anahtarları gerçekten var mı? — SPEC Bölüm 4.2.
 *
 * `tsc` anahtarları doğrulayamaz (hepsi `string`), bu yüzden kaynak taranır:
 * `getTranslations("ns")` / `useTranslations("ns")` ile açılan namespace'ler
 * ve o değişken üzerinden çağrılan **sabit** anahtarlar çıkarılır. Şablon
 * ifadeli (`t(\`x.${y}\`)`) çağrılar dinamiktir ve atlanır; onları
 * `i18n.test.ts` içindeki enum kapsama testleri korur.
 */
const ROOTS = ["apps/app/src", "apps/web/src"];

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

const files = ROOTS.flatMap((root) => walk(root));
const usages = new Map<string, string[]>();
for (const file of files) {
  for (const key of extractKeys(readFileSync(file, "utf8"))) {
    const existing = usages.get(key);
    if (existing) existing.push(file);
    else usages.set(key, [file]);
  }
}

describe("kullanılan çeviri anahtarları", () => {
  it("kaynak taraması anlamlı sayıda anahtar buluyor", () => {
    expect(usages.size).toBeGreaterThan(300);
  });

  for (const locale of LOCALES) {
    it(`'${locale}' dilinde tüm anahtarlar tanımlı`, () => {
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
});
