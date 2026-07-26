import { createNavigation } from "next-intl/navigation";

import { routing } from "@yonetim/i18n/routing";

/**
 * Dile duyarlı gezinme yardımcıları.
 * `Link` ve `redirect` çevrilmiş adresleri (`/fiyatlandirma` ↔ `/en/pricing`)
 * otomatik üretir; bileşenler yalnızca kanonik anahtarı kullanır.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
