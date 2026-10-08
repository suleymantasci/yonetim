import { sql, type SQL } from "drizzle-orm";

import type { MemberScope } from "@yonetim/contracts";

/**
 * Üye kapsamı → SQL koşulu (`relationMatchesScope` ile aynı tanım).
 *
 * `debtor` ve `unit` sütun ifadeleri: borçta `d.debtor_user_id`/`d.unit_id`,
 * tahsilatta `COALESCE(p.debtor_user_id, p.payer_user_id)`/`p.unit_id`.
 * Borçlusu olmayan kayıt (`NULL`) yalnız `all` kapsamında görünür.
 */
export function memberScopeSql(scope: MemberScope | undefined, debtor: SQL, unit: SQL): SQL {
  if (!scope || scope === "all") return sql`TRUE`;
  const rel = (relation: string | null, ended: boolean) => sql`EXISTS (
    SELECT 1 FROM unit_occupancies mo
    WHERE mo.unit_id = ${unit} AND mo.user_id = ${debtor}
      ${relation ? sql`AND mo.relation = ${relation}::ownership_type` : sql``}
      AND mo.end_date IS ${ended ? sql`NOT NULL` : sql`NULL`}
  )`;
  switch (scope) {
    case "active":
      return rel(null, false);
    case "owner":
      return rel("owner", false);
    case "tenant":
      return rel("tenant", false);
    case "occupant":
      return sql`(${rel("tenant", false)} OR (${rel("owner", false)} AND NOT EXISTS (
        SELECT 1 FROM unit_occupancies mt
        WHERE mt.unit_id = ${unit} AND mt.relation = 'tenant' AND mt.end_date IS NULL
      )))`;
    case "former_owner":
      return sql`(${rel("owner", true)} AND NOT ${rel("owner", false)})`;
    case "former_tenant":
      return sql`(${rel("tenant", true)} AND NOT ${rel("tenant", false)})`;
  }
}
