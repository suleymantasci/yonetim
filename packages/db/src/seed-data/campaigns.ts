import { CAMPAIGN_TEMPLATES, draftFromTemplate } from "@yonetim/campaigns";

/** Şablonlardan üretilen başlangıç kampanyaları (Bölüm 16.5). */
export const CAMPAIGN_TEMPLATE_SEED = CAMPAIGN_TEMPLATES.map((t) =>
  draftFromTemplate(t, {
    // Lansmanda "Yeni Site Hoş Geldin" ve "Yıllık Peşin" aktif başlar.
    status: ["yeni_site_hosgeldin", "yillik_pesin_indirim"].includes(t.key) ? "active" : "draft",
  }),
);
