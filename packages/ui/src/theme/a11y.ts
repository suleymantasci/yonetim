/**
 * Erişilebilirlik ve görünüm tercihleri — GAP 4.7.1 / SPEC 11.5.
 *
 * Dört eksen: **yazı boyutu**, **yüksek karşıtlık**, **hareket azaltma**,
 * **satır yoğunluğu**. Tercih `<html>` niteliğine yazılır (CSS `tokens.css`
 * içindeki blokları devreye alır) ve çerezde saklanır — böylece sunucu ilk
 * HTML'de aynı niteliği basabilir ve sayfa boyut/kontrast atlaması yaşanmaz.
 *
 * YOĞUNLUK NEDEN BURADA, `localStorage`'DA DEĞİL (UI planı §2.1'den sapma):
 * yoğunluk **sunucunun ilk HTML'inde** doğru olmak zorunda. `localStorage`
 * ancak hidrasyondan sonra okunabilir; 50 satırlık bir tablo ilk boyamada
 * geniş, bir kare sonra dar çizilirdi — bu tam olarak CLS'in tanımı. Diğer üç
 * tercih zaten aynı nedenle çerezde; dördüncüsü için ayrı bir mekanizma
 * kurmak, aynı sorunu ikinci kez çözmek olurdu. (Kolon görünürlüğü hâlâ
 * `localStorage`: o ilk boyamayı kaydırmıyor, yalnız sütun gizliyor.)
 *
 * Bu dosya `theme.ts` gibi saf/izomorfiktir: hem sunucu (çerez okuma) hem
 * istemci tarafından kullanılır. Etkileşimli menü `a11y-preferences.tsx`
 * içinde ve `"use client"` sınırının arkasındadır.
 */

export const A11Y_COOKIE = "yonetim_a11y";

export const FONT_SCALES = ["sm", "md", "lg", "xl"] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

export interface A11yPreferences {
  fontScale: FontScale;
  highContrast: boolean;
  reducedMotion: boolean;
  density: Density;
}

export const DEFAULT_A11Y: A11yPreferences = {
  fontScale: "md",
  highContrast: false,
  reducedMotion: false,
  density: "comfortable",
};

/**
 * Çerez biçimi: `md|hc0|rm0|dn0` — tek satır, ayrıştırması ucuz.
 *
 * Dördüncü alan sonradan eklendi; **eski çerezler kırılmaz**, eksik alan
 * varsayılana düşer (`parseA11y`). Alan sırası değiştirilmemelidir.
 */
export function serializeA11y(preferences: A11yPreferences): string {
  return [
    preferences.fontScale,
    preferences.highContrast ? "hc1" : "hc0",
    preferences.reducedMotion ? "rm1" : "rm0",
    preferences.density === "compact" ? "dn1" : "dn0",
  ].join("|");
}

export function parseA11y(value: string | undefined | null): A11yPreferences {
  if (!value) return DEFAULT_A11Y;
  const [scale, contrast, motion, density] = value.split("|");
  return {
    fontScale: (FONT_SCALES as readonly string[]).includes(scale ?? "")
      ? (scale as FontScale)
      : "md",
    highContrast: contrast === "hc1",
    reducedMotion: motion === "rm1",
    density: density === "dn1" ? "compact" : "comfortable",
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
    ...(preferences.density === "compact" ? { "data-density": "compact" } : {}),
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
if(p[3]==="dn1")d.setAttribute("data-density","compact");
}catch(e){}})();`;
