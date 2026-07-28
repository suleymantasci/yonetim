import { ImageResponse } from "next/og";

import { siteConfig } from "@yonetim/config";
import { mixOklab, parseHex, toHex } from "@yonetim/ui";

/**
 * OpenGraph görsel şablonu — tek yerde.
 *
 * NEDEN SUNUCUDA ÜRETİLİYOR: paylaşım görselini elle hazırlamak, her yeni blog
 * yazısı için bir tasarım adımı demekti; pratikte de kimse yapmıyordu ve
 * `og-default.png` referansı yıllarca 404 döndü. Burada görsel içerikten
 * türetiliyor, dolayısıyla eksik kalamıyor.
 *
 * RENKLER `siteConfig`ten gelir ve türevleri `mixOklab` ile hesaplanır:
 * Satori (next/og) CSS değişkeni çözmez, somut renk ister — ama dosyaya sabit
 * renk yazmak da `tests/design-tokens.test.ts` kapısını kırardı.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const palette = siteConfig.design.colors;

const ink = parseHex(palette.ink);
const white = parseHex(palette.background);

/** Zemin üstünde ince ayrım çizgisi — düz beyaz fazla sert kalıyor. */
const hairline = toHex(mixOklab(white, ink, 0.22));
const softText = toHex(mixOklab(white, ink, 0.72));
const glow = toHex(mixOklab(parseHex(palette.primary), ink, 0.55));

/** Logo çubukları: [yükseklik px, vurgu mu]. `BrandMark` ile aynı oran. */
const BARS: ReadonlyArray<readonly [number, boolean]> = [
  [26, false],
  [50, true],
  [36, false],
];

export interface OgImageInput {
  /**
   * Üst satırdaki rozet — kategori adı. Marka adı buraya yazılmaz: işaret ve
   * kelime işareti zaten sol üstte duruyor, tekrarı bilgi taşımaz.
   */
  eyebrow?: string;
  title: string;
  description?: string;
}

/**
 * Satori taşan metni kırpmaz, düzeni bozar — bu yüzden kaynakta sınırlanır.
 * Kesme kelime sınırında yapılır; "icra ta…" gibi bir kırpma, okuyana
 * karakter sayısından başka bir şey anlatmıyor.
 */
function clamp(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function renderOgImage(input: OgImageInput) {
  const eyebrow = input.eyebrow ? clamp(input.eyebrow, 42) : undefined;
  const title = clamp(input.title, 88);
  const description = input.description ? clamp(input.description, 150) : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: palette.ink,
          backgroundImage: `radial-gradient(900px 500px at 85% -10%, ${glow} 0%, ${palette.ink} 62%)`,
          color: palette.background,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 56 }}>
            {BARS.map(([height, isAccent], index) => (
              <div
                key={index}
                style={{
                  width: 18,
                  height,
                  borderRadius: 6,
                  backgroundColor: isAccent ? palette.accent : palette.background,
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
            {siteConfig.brand.name}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {eyebrow ? (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "8px 18px",
                borderRadius: 999,
                border: `1px solid ${hairline}`,
                fontSize: 22,
                color: palette.accent,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1.5 }}>
            {title}
          </div>
          {description ? (
            <div style={{ fontSize: 28, lineHeight: 1.4, color: softText }}>{description}</div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            paddingTop: 28,
            borderTop: `1px solid ${hairline}`,
            fontSize: 24,
            color: softText,
          }}
        >
          {siteConfig.domains.base}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
