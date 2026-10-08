import type { MemberScope } from "@yonetim/contracts";

/**
 * Üye kapsamı süzgecinin URL karşılığı — `?uye=eski-kiraci`.
 *
 * Diğer süzgeçler gibi Türkçe kısa değer (`acik`, `gecikmis`); API'ye
 * sözleşmedeki adla (`former_tenant`) gider.
 */
export const MEMBER_SCOPE_PARAMS: Record<string, Exclude<MemberScope, "all">> = {
  aktif: "active",
  oturan: "occupant",
  malik: "owner",
  kiraci: "tenant",
  "eski-malik": "former_owner",
  "eski-kiraci": "former_tenant",
};

export function memberScopeFromParam(value: string | undefined): MemberScope {
  return (value && MEMBER_SCOPE_PARAMS[value]) || "all";
}

/** Süzgeç seçenekleri (`app.memberScope.<scope>` etiketleriyle). */
export function memberScopeOptions(t: (key: string) => string) {
  return [
    { value: "", label: t("all") },
    ...Object.entries(MEMBER_SCOPE_PARAMS).map(([value, scope]) => ({
      value,
      label: t(scope),
    })),
  ];
}
