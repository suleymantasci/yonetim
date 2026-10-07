import { hasPermission } from "@yonetim/auth/guard";
import { portalSummary, residentOptionList, unitOptionList } from "@yonetim/contracts";

import { apiGet } from "@/lib/api/server";
import type { AppContext } from "@/lib/context";

/**
 * Rezervasyon formunun "kim adına / hangi daire" seçenekleri.
 *
 * Yönetim sitedeki herkesi seçebilir. Sakin (onay yetkisi yok) yalnız kendi
 * adına ve kendi dairesi için açar: sakin listesi zaten `resident:read`
 * istediği için sakine bu sayfa önceden hiç açılmıyordu. API de aynı kuralı
 * uyguluyor (başkası adına açma 403).
 */
export async function reservationPeople(ctx: AppContext): Promise<{
  residents: { id: string; name: string }[];
  units: { id: string; number: string; blockName: string | null }[];
}> {
  if (hasPermission(ctx.roles, "reservation:approve")) {
    const [residents, units] = await Promise.all([
      apiGet("/v1/panel/residents/options", residentOptionList),
      apiGet("/v1/panel/units/options", unitOptionList),
    ]);
    return {
      residents: residents.rows.map((r) => ({
        id: r.id,
        name:
          [r.firstName, r.lastName].filter(Boolean).join(" ").trim() ||
          (r.phoneMasked ?? "—"),
      })),
      units: units.map((u) => ({ id: u.id, number: u.number, blockName: u.blockName })),
    };
  }

  const me = await apiGet("/v1/panel/portal/me", portalSummary).catch(() => null);
  return {
    residents: [{ id: ctx.userId, name: ctx.userName }],
    units: me?.unit ? [{ id: me.unit.id, number: me.unit.number, blockName: null }] : [],
  };
}
