import { z } from "zod";

/**
 * Üye kapsamı — listelerde ve raporlarda kişi filtresi.
 *
 * Yönetimcell raporlarının hepsinde aynı süzgeç var ve eski üye ayrımı kritik:
 * taşınan kiracının kalan borcu, aktif listelerde görünmediği için unutuluyor.
 *
 *  - `all`: herkes (eski üyeler dahil)
 *  - `active`: daireyle ilişkisi süren malik ve kiracılar
 *  - `occupant`: oturanlar — kiracı; kiracısız dairede malik
 *  - `owner` / `tenant`: aktif malik / aktif kiracı
 *  - `former_owner` / `former_tenant`: ilişkisi bitmiş (ve aynı dairede
 *    yeniden başlamamış) malik / kiracı
 *
 * Borç ve tahsilatta ilişki **borçlu ile borcun dairesi** arasında aranır:
 * aynı kişi bir dairede eski kiracı, ötekinde malik olabilir.
 */
export const MEMBER_SCOPES = [
  "all",
  "active",
  "occupant",
  "owner",
  "tenant",
  "former_owner",
  "former_tenant",
] as const;

export const memberScope = z.enum(MEMBER_SCOPES);
export type MemberScope = z.infer<typeof memberScope>;

/** Bir kişinin bir dairedeki ilişkileri, kapsam kararı için. */
export interface MemberRelation {
  relation: string;
  ended: boolean;
  /** Dairede aktif kiracı var mı (oturan = malik kararı için). */
  unitHasActiveTenant: boolean;
}

/**
 * Kişinin (o dairedeki) ilişkileri kapsama uyuyor mu — SQL karşılığı
 * `apps/api/src/finance/member-scope.ts`; ikisi aynı tanımı uygular.
 */
export function relationMatchesScope(
  rows: readonly MemberRelation[],
  scope: MemberScope,
): boolean {
  if (scope === "all") return true;
  const active = rows.filter((r) => !r.ended);
  switch (scope) {
    case "active":
      return active.length > 0;
    case "owner":
      return active.some((r) => r.relation === "owner");
    case "tenant":
      return active.some((r) => r.relation === "tenant");
    case "occupant":
      return active.some(
        (r) => r.relation === "tenant" || (r.relation === "owner" && !r.unitHasActiveTenant),
      );
    case "former_owner":
      return (
        rows.some((r) => r.ended && r.relation === "owner") &&
        !active.some((r) => r.relation === "owner")
      );
    case "former_tenant":
      return (
        rows.some((r) => r.ended && r.relation === "tenant") &&
        !active.some((r) => r.relation === "tenant")
      );
  }
}
