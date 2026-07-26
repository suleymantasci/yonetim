import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Semantik token disiplini — SPEC Bölüm 11.1.
 *
 * Renkler yalnızca `tokens.css` içinde tanımlanır; bileşenler `bg-surface`,
 * `text-fg`, `border-border` gibi **anlam** taşıyan sınıfları kullanır.
 * Böylece açık/koyu tema tek kaynaktan gelir ve `dark:` ikizlemesi gerekmez.
 */
const ROOTS = ["apps/app/src", "apps/web/src", "packages/ui/src"];
const TOKENS_FILE = "packages/ui/src/styles/tokens.css";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(tsx?|css)$/.test(path)) out.push(path);
  }
  return out;
}

const files = ROOTS.flatMap((root) => walk(root)).filter((f) => !f.endsWith("tokens.css"));

/** Tailwind'in `dark:` varyantı — tek `data-theme` kaynağı varken gereksizdir. */
it("hiçbir dosyada `dark:` varyantı kullanılmıyor", () => {
  const offenders = files.filter((file) => /\bdark:[a-z[]/.test(readFileSync(file, "utf8")));
  expect(offenders).toEqual([]);
});

it("bileşenler ham Tailwind renk paleti kullanmıyor", () => {
  // `bg-slate-800`, `text-red-500`, `border-gray-200` gibi kullanımlar.
  const palette =
    /\b(?:bg|text|border|ring|from|to|via|divide|outline|decoration|shadow|fill|stroke|placeholder|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
  const offenders = files.filter((file) => palette.test(readFileSync(file, "utf8")));
  expect(offenders).toEqual([]);
});

/**
 * Token disiplininden muaf dosyalar — her biri gerekçeli.
 *
 * `global-error.tsx`: kök hata sınırı, stil dosyası yüklenememişken de
 * render edilmek zorundadır (hatanın kaynağı layout veya CSS olabilir).
 * Token'lara güvenmek "beyaz sayfa üstüne beyaz yazı" riski taşırdı;
 * bu yüzden satır içi ve sabit renkler bilinçli tercih.
 */
const HEX_EXEMPT = ["apps/app/src/app/global-error.tsx"];

it("bileşenlerde sabit hex/rgb renk yok", () => {
  // E-posta şablonları hariç: e-posta istemcileri CSS değişkeni desteklemez.
  // Çapa bağlantıları (`href="#icerik"`) renk değildir; hex yalnızca 3/6/8 hane sayılır.
  const hex = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\brgba?\(/;
  const offenders = files
    .filter((file) => !file.includes("packages/emails"))
    .filter((file) => !HEX_EXEMPT.includes(file))
    .filter((file) => hex.test(readFileSync(file, "utf8")));
  expect(offenders).toEqual([]);
});

describe("token kaynağı", () => {
  const css = readFileSync(TOKENS_FILE, "utf8");

  it("açık ve koyu tema aynı token kümesini tanımlıyor", () => {
    const light = new Set(
      [...css.matchAll(/^\s*(--t-[\w-]+):/gm)].map((m) => m[1]!),
    );
    const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'));
    const dark = new Set([...darkBlock.matchAll(/^\s*(--t-[\w-]+):/gm)].map((m) => m[1]!));
    expect(dark.size).toBeGreaterThan(20);
    // Koyu temada tanımlı her token açık temada da vardır.
    expect([...dark].filter((token) => !light.has(token))).toEqual([]);
  });

  it("her semantik token `@theme inline` ile Tailwind'e açılıyor", () => {
    const themeBlock = css.slice(css.indexOf("@theme inline"));
    for (const name of ["canvas", "surface", "fg", "border", "primary", "danger", "success"]) {
      expect(themeBlock).toContain(`--color-${name}:`);
    }
  });
});
