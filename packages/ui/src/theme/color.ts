/**
 * Renk yardımcıları — token doğrulaması ve sunucuda üretilen görseller için.
 *
 * NEDEN VAR: `tokens.css` türetilmiş renkleri `color-mix(in oklab, ...)` ile
 * tanımlıyor. Tarayıcı bunu çalışma anında çözüyor, ama iki yerde tarayıcı yok:
 *
 *   1. `tests/design-tokens.test.ts` — palet değişiminin kontrastı kırmadığını
 *      kanıtlamak için türetilmiş değerin sayısal karşılığı gerekiyor.
 *   2. `next/og` ile üretilen OpenGraph/ikon görselleri — Satori CSS değişkeni
 *      çözmez, somut renk ister.
 *
 * Bu yüzden aynı karışım burada yeniden uygulanıyor. Referans: CSS Color 5
 * `color-mix()` ve Björn Ottosson'un Oklab dönüşümü.
 *
 * Kanal değerleri 0–1 aralığındadır (0–255 değil): dönüşümlerin tamamı bu
 * aralıkta tanımlı ve ara adımlarda yuvarlama kaybı olmuyor.
 */

export interface Srgb {
  r: number;
  g: number;
  b: number;
}

type Oklab = [number, number, number];

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#rgb` veya `#rrggbb` → 0–1 sRGB. Diğer biçimler desteklenmez (kullanılmıyor). */
export function parseHex(input: string): Srgb {
  const match = HEX_PATTERN.exec(input.trim());
  if (!match) throw new Error(`Desteklenmeyen renk biçimi: ${input}`);
  const digits = match[1]!;
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((d) => d + d)
          .join("")
      : digits;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

export function toHex(color: Srgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/** sRGB gama → doğrusal ışık. WCAG ve Oklab'ın ikisi de doğrusal uzayda çalışır. */
function toLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

function srgbToOklab(color: Srgb): Oklab {
  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToSrgb([L, a, bb]: Oklab): Srgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;

  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

/**
 * `color-mix(in oklab, first <weight>%, second)` karşılığı.
 * `weight`, **birinci** rengin oranıdır (0–1).
 */
export function mixOklab(first: Srgb, second: Srgb, weight: number): Srgb {
  const a = srgbToOklab(first);
  const b = srgbToOklab(second);
  const w = Math.min(1, Math.max(0, weight));
  return oklabToSrgb([
    a[0] * w + b[0] * (1 - w),
    a[1] * w + b[1] * (1 - w),
    a[2] * w + b[2] * (1 - w),
  ]);
}

/** WCAG 2.1 bağıl parlaklık. */
export function relativeLuminance(color: Srgb): number {
  return (
    0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b)
  );
}

/** WCAG 2.1 kontrast oranı — 1 (aynı) ile 21 (siyah/beyaz) arası. */
export function contrastRatio(first: Srgb, second: Srgb): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const [light, dark] = a >= b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}
