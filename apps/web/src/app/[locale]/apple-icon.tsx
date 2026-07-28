import { ImageResponse } from "next/og";

import { siteConfig } from "@yonetim/config";

/**
 * iOS ana ekran ikonu. `icon.svg` çoğu tarayıcıya yetiyor ama Safari PNG
 * istiyor; elle PNG üretmek yerine işaret burada çiziliyor — geometri
 * `packages/ui/src/components/brand.tsx` ile aynı.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const palette = siteConfig.design.colors;

/** [yükseklik, vurgu mu] — 24'lük ızgaranın 180'e ölçeklenmiş hâli. */
const BARS: ReadonlyArray<readonly [number, boolean]> = [
  [41, false],
  [79, true],
  [56, false],
];

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 13,
          paddingBottom: 41,
          backgroundColor: palette.ink,
        }}
      >
        {BARS.map(([height, isAccent], index) => (
          <div
            key={index}
            style={{
              width: 26,
              height,
              borderRadius: 9,
              backgroundColor: isAccent ? palette.accent : palette.background,
            }}
          />
        ))}
      </div>
    ),
    size,
  );
}
