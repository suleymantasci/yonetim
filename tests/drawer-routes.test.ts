import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isDrawerHref } from "../apps/app/src/lib/drawer-routes";

const MODAL = join(__dirname, "../apps/app/src/app/panel/@modal");
const UUID = "43c15037-90d4-4e7d-aae8-3b2d0a99f00f";

function pages(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pages(full, `${prefix}/${name}`));
    else if (name === "page.tsx") out.push(prefix);
  }
  return out;
}

describe("çekmece rotaları", () => {
  // `@modal` altındaki her kesen rota için örnek adres üretip eşleştirici ile karşılaştırır:
  // yeni bir çekmece rotası eklenip `lib/drawer-routes.ts` unutulursa bu test kırılır.
  const intercepted = pages(MODAL).filter((p) => p.startsWith("/(.)"));

  it("@modal altında çekmece rotaları bulunuyor", () => {
    expect(intercepted.length).toBeGreaterThan(20);
  });

  it.each(intercepted)("%s eşleşiyor", (route) => {
    const href = `/panel${route.replace("/(.)", "/").replace(/\[[^\]]+\]/g, UUID)}`;
    expect(isDrawerHref(href), href).toBe(true);
  });

  it("sorgu ve parça yok sayılır", () => {
    expect(isDrawerHref("/panel/borclar/yeni?sakin=" + UUID)).toBe(true);
    expect(isDrawerHref("/panel/giderler/yeni#x")).toBe(true);
  });

  it("çekmece olmayan adresler eşleşmiyor (sayfa geçişi başa kaydırmaya devam eder)", () => {
    for (const href of [
      "/panel",
      "/panel/giderler",
      `/panel/sakinler/${UUID}`,
      "/panel/sakinler/acil-durum",
      `/panel/borclar/${UUID}`,
      "/panel/portfoy/yeni",
      "/panel/kvkk",
      "/giris",
    ]) {
      expect(isDrawerHref(href), href).toBe(false);
    }
    expect(isDrawerHref(undefined)).toBe(false);
  });
});
