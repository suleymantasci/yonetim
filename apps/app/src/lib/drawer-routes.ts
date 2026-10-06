/**
 * Çekmece olarak açılan (`@modal/(.)…`) panel adresleri.
 *
 * Liste, `app/panel/@modal` altındaki sayfalarla birebir aynı olmalı; yeni bir
 * çekmece rotası eklenince buraya da girmeli (`tests/drawer-routes.test.ts`
 * dosya sistemiyle karşılaştırıyor ve unutulursa kırılıyor).
 */
const MODULES = [
  "aidat", "anketler", "bakim", "birimler", "borclar", "giderler", "mesajlar",
  "personel", "rezervasyon", "sakinler", "sayaclar", "talepler", "toplantilar",
] as const;

/** `…/yeni`, `…/<id>/duzenle`, `rezervasyon/<id>/karar`, `talepler/<id>`, hesap/tesis alt rotaları. */
const DRAWER_PATH = new RegExp(
  "^/panel/(?:" +
    [
      `(?:${MODULES.join("|")})/yeni`,
      `(?:${MODULES.join("|")})/[^/]+/duzenle`,
      "rezervasyon/[^/]+/karar",
      "rezervasyon/tesis/yeni",
      "rezervasyon/tesis/[^/]+/duzenle",
      "banka/hesap/yeni",
      "banka/hesap/[^/]+/duzenle",
      "talepler/[^/]+",
    ].join("|") +
    ")/?$",
);

/** `href` bir çekmece rotasına mı çıkıyor (sorgu ve parça yok sayılır). */
export function isDrawerHref(href: unknown): boolean {
  if (typeof href !== "string") return false;
  const path = href.split(/[?#]/)[0] ?? "";
  return DRAWER_PATH.test(path);
}
