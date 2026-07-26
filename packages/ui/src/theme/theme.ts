/**
 * Tema yönetimi — SPEC Bölüm 11.3 ("Dark mode: sistem tercihi + manuel toggle").
 *
 * Üç seçenek: `light` | `dark` | `system`.
 * Kullanıcı seçimi çerezde tutulur; sunucu bunu okuyup `<html data-theme>`
 * niteliğini ilk HTML'de basar, böylece tema atlaması (FOUC) yaşanmaz.
 * `system` seçildiyse nihai değer paint öncesi betikle çözülür.
 */
export const THEME_COOKIE = "yonetim_theme";
export const THEME_STORAGE_KEY = "yonetim.theme";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** CSS'e yazılan nihai değer — `system` burada yer almaz. */
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function parseThemePreference(value: string | undefined | null): ThemePreference {
  return isThemePreference(value) ? value : "system";
}

/**
 * Sunucuda `data-theme` için kullanılacak değer.
 *
 * `system` tercihinde sunucu kullanıcının işletim sistemi tercihini bilemez.
 * Bu durumda nitelik hiç basılmaz; ilk boyamayı `prefers-color-scheme` emniyet
 * ağı karşılar, hemen ardından `themeInitScript` kesin değeri yazar.
 */
export function serverThemeAttribute(preference: ThemePreference): ResolvedTheme | undefined {
  return preference === "system" ? undefined : preference;
}

/**
 * `<head>` içinde, stil dosyalarından sonra ve gövdeden önce çalışan betik.
 * Tek işi: nihai temayı belirleyip `data-theme` niteliğini yazmak.
 *
 * Not: `document.documentElement` üzerinde çalışır, DOM'a dokunmaz; bu yüzden
 * hydration uyuşmazlığı yaratmaz (nitelik React tarafından yönetilmez).
 */
export const themeInitScript = `(function(){try{
var d=document.documentElement;
var pref=d.getAttribute("data-theme-preference");
if(!pref){var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]+)/);pref=m?decodeURIComponent(m[1]):"system";}
var theme=pref;
if(pref==="system"){theme=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}
d.setAttribute("data-theme",theme);
d.style.colorScheme=theme;
}catch(e){}})();`;

/** Çerez başlığı — server action / route handler içinde kullanılır. */
export const THEME_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 365,
  httpOnly: false, // İstemci tarafı toggle'ın anında yazabilmesi için.
};
