import type { ReactNode } from "react";

/**
 * next-intl zengin metin etiketleri için ortak işleyiciler — SPEC Bölüm 4.2.
 *
 * Mesaj dosyalarında vurgu `<strong>…</strong>` olarak yazılır; `t.rich()` bu
 * etiketi burada tanımlı React elementine çevirir. `dangerouslySetInnerHTML`
 * kullanılmaz, çeviri metni hiçbir zaman HTML olarak yorumlanmaz.
 */
export const richTags = {
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
  em: (chunks: ReactNode) => <em>{chunks}</em>,
} as const;
