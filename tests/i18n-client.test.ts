import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CLIENT_NAMESPACES as APP_NAMESPACES } from "../apps/app/src/i18n/client-namespaces";
import { CLIENT_NAMESPACES as WEB_NAMESPACES } from "../apps/web/src/i18n/client-namespaces";

/**
 * İstemci tarafı mesaj kapsamı — SPEC Bölüm 4.2.
 *
 * `NextIntlClientProvider`'a yalnızca gerekli namespace'ler gönderilir. Bir
 * `"use client"` bileşeni sağlayıcıda olmayan bir namespace kullanırsa next-intl
 * sessizce **anahtarın kendisini** basar (ekranda `app.login.identifierLabel`
 * gibi). Bu test o durumu derleme öncesinde yakalar.
 */
const APPS = [
  { name: "apps/app", root: "apps/app/src", provided: APP_NAMESPACES as readonly string[] },
  { name: "apps/web", root: "apps/web/src", provided: WEB_NAMESPACES as readonly string[] },
  // Paylaşılan bileşenler her iki uygulamada da render edilir; ikisinin
  // kesişimiyle sınırlı kalmalıdır.
  {
    name: "packages/ui",
    root: "packages/ui/src",
    provided: (APP_NAMESPACES as readonly string[]).filter((ns) =>
      (WEB_NAMESPACES as readonly string[]).includes(ns),
    ),
  },
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

/** `useTranslations("app.login")` → `app` (kök namespace). */
function clientNamespaces(root: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");
    if (!/^\s*["']use client["']/m.test(source)) continue;
    for (const m of source.matchAll(/useTranslations\(\s*["']([^"']+)["']/g)) {
      const namespace = m[1]!.split(".")[0]!;
      const files = found.get(namespace);
      if (files) files.push(file);
      else found.set(namespace, [file]);
    }
  }
  return found;
}

describe("istemci mesaj kapsamı", () => {
  for (const app of APPS) {
    it(`${app.name}: her istemci bileşeninin namespace'i sağlayıcıda var`, () => {
      const missing: string[] = [];
      for (const [namespace, files] of clientNamespaces(app.root)) {
        if (!app.provided.includes(namespace)) missing.push(`${namespace} (${files[0]})`);
      }
      expect(missing).toEqual([]);
    });
  }

  it("gereksiz namespace gönderilmiyor (tarayıcı yükü)", () => {
    for (const app of APPS.slice(0, 2)) {
      const used = new Set(clientNamespaces(app.root).keys());
      // Paylaşılan `packages/ui` bileşenleri de aynı sağlayıcıyı kullanır.
      for (const ns of clientNamespaces("packages/ui/src").keys()) used.add(ns);
      const unused = app.provided.filter((ns) => !used.has(ns));
      expect(unused, `${app.name} kullanılmayan namespace`).toEqual([]);
    }
  });
});
