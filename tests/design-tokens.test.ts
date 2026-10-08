import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { siteConfig } from "@yonetim/config";
import {
  contrastRatio,
  mixOklab,
  parseHex,
  type Srgb,
} from "../packages/ui/src/theme/color";
import { MOTION_DURATION, MOTION_EASE } from "../packages/ui/src/motion/tokens";

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
 *
 * `lib/pdf/report-pdf.ts`: pdfkit ile çizilen rapor PDF'i. CSS yok, tema yok;
 * kâğıt her zaman beyaz, renkler sabit.
 */
const HEX_EXEMPT = [
  "apps/app/src/app/global-error.tsx",
  "apps/app/src/lib/pdf/report-pdf.ts",
];

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
    for (const name of ["canvas", "surface", "fg", "border", "primary", "ink", "danger", "success"]) {
      expect(themeBlock).toContain(`--color-${name}:`);
    }
  });
});

/**
 * =============================================================================
 * KONTRAST KAPISI — WCAG 2.1 AA
 * =============================================================================
 *
 * NEDEN: Marka rengi `packages/config/src/site.ts` içinde tek satırda
 * değişebiliyor ve türetilmiş tonların hepsi `color-mix(in oklab, ...)` ile
 * ondan geliyor. Bu, palet tazelemeyi kolaylaştırıyor — ama aynı kolaylık,
 * bir rengi değiştirip yüzlerce türevin okunabilirliğini fark etmeden kırmayı
 * da mümkün kılıyor.
 *
 * Burada `tokens.css` bir tarayıcı gibi çözümleniyor (`var()` + `color-mix`),
 * sonra zemin/metin çiftleri **hem açık hem koyu temada** ölçülüyor.
 * Test, çiftleri gerçek kullanımlarından alır: örneğin `danger` + `primary-fg`
 * çifti buradadır çünkü `button.tsx` tehlike butonunu böyle kuruyor.
 */
describe("kontrast (WCAG 2.1 AA)", () => {
  const css = readFileSync(TOKENS_FILE, "utf8");

  /** Seçicinin gövdesini süslü parantez sayarak çıkarır. */
  function blockOf(selector: string): string {
    const start = css.indexOf(selector);
    if (start < 0) throw new Error(`Seçici bulunamadı: ${selector}`);
    const open = css.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) return css.slice(open + 1, i);
      }
    }
    throw new Error(`Kapanmayan blok: ${selector}`);
  }

  function declarationsOf(block: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out.set(match[1]!, match[2]!.trim());
    }
    return out;
  }

  // Marka değerleri çalışma anında layout tarafından enjekte edilir; testin
  // ölçmesi gereken de tokens.css'teki yedek değil, o gerçek değerdir.
  const brand = new Map<string, string>([
    ["--brand-primary", siteConfig.design.colors.primary],
    ["--brand-ink", siteConfig.design.colors.ink],
    ["--brand-secondary", siteConfig.design.colors.secondary],
    ["--brand-accent", siteConfig.design.colors.accent],
  ]);

  const light = new Map([...declarationsOf(blockOf(":root {")), ...brand]);
  const dark = new Map([...light, ...declarationsOf(blockOf(':root[data-theme="dark"]'))]);

  /** Üst düzey virgüllere böler; `var(--x)` içindeki parantezleri atlar. */
  function splitArguments(input: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const char of input) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
      } else current += char;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  function resolve(value: string, scope: Map<string, string>, seen = new Set<string>()): Srgb {
    const input = value.trim();

    if (input.startsWith("#")) return parseHex(input);

    const variable = /^var\((--[\w-]+)\)$/.exec(input);
    if (variable) {
      const name = variable[1]!;
      if (seen.has(name)) throw new Error(`Döngüsel token: ${name}`);
      const next = scope.get(name);
      if (!next) throw new Error(`Tanımsız token: ${name}`);
      return resolve(next, scope, new Set([...seen, name]));
    }

    if (input.startsWith("color-mix(")) {
      const args = splitArguments(input.slice("color-mix(".length, -1));
      const [space, first, second] = args;
      if (space?.trim() !== "in oklab") {
        throw new Error(`Yalnız oklab karışımı destekleniyor: ${input}`);
      }
      const percent = /\s(\d+(?:\.\d+)?)%$/.exec(first ?? "");
      if (!percent) throw new Error(`Karışım oranı okunamadı: ${first}`);
      return mixOklab(
        resolve(first!.slice(0, percent.index), scope, seen),
        resolve(second!, scope, seen),
        Number(percent[1]) / 100,
      );
    }

    throw new Error(`Çözümlenemeyen renk: ${input}`);
  }

  function ratio(scope: Map<string, string>, background: string, foreground: string): number {
    const bg = scope.get(`--t-${background}`);
    const fg = scope.get(`--t-${foreground}`);
    if (!bg || !fg) throw new Error(`Eksik token: ${background} / ${foreground}`);
    return contrastRatio(resolve(bg, scope), resolve(fg, scope));
  }

  /** [zemin, metin, nerede kullanılıyor] */
  const TEXT_PAIRS: ReadonlyArray<readonly [string, string, string]> = [
    ["surface", "fg", "gövde metni"],
    ["surface", "fg-muted", "ikincil metin"],
    ["surface", "fg-subtle", "üçüncül metin"],
    ["canvas", "fg", "sayfa zemini"],
    ["surface-sunken", "fg-muted", "çökük yüzey"],
    ["primary", "primary-fg", "birincil buton"],
    ["primary-soft", "primary-soft-fg", "yumuşak marka rozeti"],
    ["ink", "ink-fg", "kimlik bandı"],
    ["ink", "ink-muted-fg", "kimlik bandı ikincil metni"],
    ["ink-soft", "ink-soft-fg", "yumuşak kimlik yüzeyi"],
    ["secondary", "secondary-fg", "ikincil buton"],
    ["accent", "accent-fg", "vurgu butonu"],
    ["accent-soft", "accent-soft-fg", "vurgu rozeti"],
    ["danger", "primary-fg", "tehlike butonu (button.tsx)"],
    ["success-soft", "success-fg", "başarı rozeti"],
    ["warning-soft", "warning-fg", "uyarı rozeti"],
    ["danger-soft", "danger-fg", "tehlike rozeti"],
    ["info-soft", "info-fg", "bilgi rozeti"],
  ];

  /** Metin olmayan arayüz öğeleri — WCAG 1.4.11, eşik 3:1. */
  const UI_PAIRS: ReadonlyArray<readonly [string, string, string]> = [
    ["surface", "border-strong", "belirgin kenarlık"],
    ["canvas", "ring", "odak halkası"],
    ["surface", "ring", "odak halkası (yüzey üstü)"],
  ];

  for (const [themeName, scope] of [
    ["açık", light],
    ["koyu", dark],
  ] as const) {
    it(`${themeName} tema — metin çiftleri ≥ 4.5:1`, () => {
      const failures = TEXT_PAIRS.map(([bg, fg, usage]) => ({
        cift: `${bg} / ${fg}`,
        kullanim: usage,
        oran: Number(ratio(scope, bg, fg).toFixed(2)),
      })).filter((row) => row.oran < 4.5);
      expect(failures).toEqual([]);
    });

    it(`${themeName} tema — arayüz öğeleri ≥ 3:1`, () => {
      const failures = UI_PAIRS.map(([bg, fg, usage]) => ({
        cift: `${bg} / ${fg}`,
        kullanim: usage,
        oran: Number(ratio(scope, bg, fg).toFixed(2)),
      })).filter((row) => row.oran < 3);
      expect(failures).toEqual([]);
    });
  }
});

/**
 * CSS ve JS animasyonları aynı ritmi paylaşmalı. Süreler iki yerde yazılı
 * olmak zorunda (CSS değişkenini her karede okumak ölçümü bozar), bu yüzden
 * eşitlikleri burada denetleniyor — birini değiştirip diğerini unutmak
 * sayfada "kimi geçişler 220ms, kimi 300ms" gibi fark edilmesi zor bir
 * tutarsızlık üretirdi.
 */
describe("hareket token'ları", () => {
  const css = readFileSync(TOKENS_FILE, "utf8");

  it("süreler `tokens.css` ile birebir aynı", () => {
    const mismatches = Object.entries(MOTION_DURATION)
      .map(([name, seconds]) => {
        const match = new RegExp(`--motion-${name}:\\s*(\\d+)ms`).exec(css);
        return { token: `--motion-${name}`, css: match ? Number(match[1]) / 1000 : null, js: seconds };
      })
      .filter((row) => row.css !== row.js);
    expect(mismatches).toEqual([]);
  });

  it("yumuşatma eğrileri `tokens.css` ile birebir aynı", () => {
    const NAMES: Record<keyof typeof MOTION_EASE, string> = {
      out: "out",
      inOut: "in-out",
      spring: "spring",
    };
    const mismatches = Object.entries(MOTION_EASE)
      .map(([key, points]) => {
        const cssName = `--motion-ease-${NAMES[key as keyof typeof MOTION_EASE]}`;
        const match = new RegExp(`${cssName}:\\s*cubic-bezier\\(([^)]+)\\)`).exec(css);
        return {
          token: cssName,
          css: match ? match[1]!.split(",").map((n) => Number(n.trim())) : null,
          js: [...points],
        };
      })
      .filter((row) => JSON.stringify(row.css) !== JSON.stringify(row.js));
    expect(mismatches).toEqual([]);
  });
});

/**
 * Tailwind, `@yonetim/ui` içindeki sınıfları ancak `@source` ile görüyor.
 *
 * NEDEN AYRI BİR KAPI: Bu eksiğin belirtisi yok. Uygulama kodunda da geçen
 * sınıflar (`bg-surface`, `rounded-lg`) üretilmeye devam ettiği için arayüz
 * "çalışıyor" görünüyor; yalnız pakete özgü olanlar sessizce kayboluyor.
 * Ölçülen somut sonuç: `motion-safe:animate-[overlay-zoom_150ms_ease-out]`
 * ve kardeşleri hiç üretilmemiş, yani modal/drawer/sheet/toast animasyonları
 * yazıldıkları günden beri çalışmıyordu.
 */
describe("Tailwind kaynak taraması", () => {
  const ENTRIES = ["apps/web/src/app/globals.css", "apps/app/src/app/globals.css"];

  it("her uygulama paylaşılan bileşen kaynağını tarıyor", () => {
    const missing = ENTRIES.filter(
      (entry) => !/@source\s+"[^"]*packages\/ui\/src"/.test(readFileSync(entry, "utf8")),
    );
    expect(missing).toEqual([]);
  });

  it("`@source` yolu gerçekten `packages/ui/src`'e çıkıyor", () => {
    for (const entry of ENTRIES) {
      const match = /@source\s+"([^"]+)"/.exec(readFileSync(entry, "utf8"));
      expect(match, entry).toBeTruthy();
      const resolved = join(dirname(entry), match![1]!);
      expect(statSync(resolved).isDirectory(), `${entry} → ${resolved}`).toBe(true);
    }
  });
});
