/**
 * Erişilebilirlik tercihleri — GAP 4.7.1 / SPEC 11.5.
 *
 * Üç eksen: **yazı boyutu**, **yüksek karşıtlık**, **hareket azaltma**.
 * Tercih `<html>` niteliğine yazılır (CSS `tokens.css` içindeki blokları
 * devreye alır) ve çerezde saklanır — böylece sunucu ilk HTML'de aynı
 * niteliği basabilir ve sayfa boyut/kontrast atlaması yaşanmaz.
 *
 * Bu dosya `theme.ts` gibi saf/izomorfiktir: hem sunucu (çerez okuma) hem
 * istemci tarafından kullanılır. Etkileşimli menü `a11y-preferences.tsx`
 * içinde ve `"use client"` sınırının arkasındadır.
 */

export const A11Y_COOKIE = "yonetim_a11y";

export const FONT_SCALES = ["sm", "md", "lg", "xl"] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export interface A11yPreferences {
  fontScale: FontScale;
  highContrast: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_A11Y: A11yPreferences = {
  fontScale: "md",
  highContrast: false,
  reducedMotion: false,
};

/** Çerez biçimi: `md|hc0|rm0` — tek satır, ayrıştırması ucuz. */
export function serializeA11y(preferences: A11yPreferences): string {
  return [
    preferences.fontScale,
    preferences.highContrast ? "hc1" : "hc0",
    preferences.reducedMotion ? "rm1" : "rm0",
  ].join("|");
}

export function parseA11y(value: string | undefined | null): A11yPreferences {
  if (!value) return DEFAULT_A11Y;
  const [scale, contrast, motion] = value.split("|");
  return {
    fontScale: (FONT_SCALES as readonly string[]).includes(scale ?? "")
      ? (scale as FontScale)
      : "md",
    highContrast: contrast === "hc1",
    reducedMotion: motion === "rm1",
  };
}

/**
 * Sunucunun ilk HTML'de basacağı `<html>` nitelikleri.
 *
 * Betik zaten paint öncesi aynı nitelikleri yazıyor; bunu sunucuda da yapmak
 * iki şey kazandırıyor: JS kapalıyken tercihler yine geçerli oluyor, ve
 * `MotionProvider` hareket tercihini ilk render'da biliyor (istemcide
 * öğrenseydi ilk animasyon çoktan başlamış olurdu).
 */
export function serverA11yAttributes(
  cookieValue: string | undefined | null,
): Record<string, string> {
  const preferences = parseA11y(cookieValue);
  return {
    "data-font-scale": preferences.fontScale,
    ...(preferences.highContrast ? { "data-contrast": "high" } : {}),
    ...(preferences.reducedMotion ? { "data-motion": "reduced" } : {}),
  };
}

/** Paint öncesi çalışan betik — tema betiğinin kardeşi. */
export const a11yInitScript = `(function(){try{
var d=document.documentElement;
var m=document.cookie.match(/(?:^|;\\s*)${A11Y_COOKIE}=([^;]+)/);
if(!m)return;
var p=decodeURIComponent(m[1]).split("|");
if(p[0])d.setAttribute("data-font-scale",p[0]);
if(p[1]==="hc1")d.setAttribute("data-contrast","high");
if(p[2]==="rm1")d.setAttribute("data-motion","reduced");
}catch(e){}})();`;
