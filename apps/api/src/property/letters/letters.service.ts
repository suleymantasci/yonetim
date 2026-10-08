import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import {
  relationMatchesScope,
  type MemberRelation,
  type MemberScope,
  type RecipientResponse,
} from "@yonetim/contracts";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";

type Row = Record<string, unknown>;

/**
 * Yazışma alıcıları — adres etiketi, genel kurul çağrısı, vekaletname.
 *
 * Kapsam kişi bazında uygulanır (`relationMatchesScope`): "malikler" seçilince
 * kiracılı dairenin yalnız maliği, "eski kiracılar" seçilince yalnız taşınmış
 * kiracı. Hiç kişisi kalmayan daire listelenmez (yalnız `all` kapsamında, boş
 * daire de etiket alabilsin diye kalır).
 *
 * TELEFON: yalnız istenirse ve KVKK gereği erişim denetim kaydına yazılır
 * (kaç kişinin numarası, hangi amaçla).
 */
@Injectable()
export class LettersService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async recipients(q: {
    member?: MemberScope;
    blockId?: string;
    phones: boolean;
  }): Promise<RecipientResponse> {
    const scope = q.member ?? "all";
    const rows = await this.db.tx(async (tx) =>
      (await tx.execute(sql`
        SELECT u.id AS unit_id, u.number, b.name AS block_name, u.land_share,
               o.user_id, o.relation::text AS relation, (o.end_date IS NOT NULL) AS ended,
               nullif(trim(concat_ws(' ', us.first_name, us.last_name)), '') AS name,
               us.phone,
               EXISTS (SELECT 1 FROM unit_occupancies t
                       WHERE t.unit_id = u.id AND t.relation = 'tenant' AND t.end_date IS NULL) AS has_tenant
        FROM units u
        LEFT JOIN blocks b ON b.id = u.block_id
        LEFT JOIN unit_occupancies o ON o.unit_id = u.id
        LEFT JOIN users us ON us.id = o.user_id
        WHERE u.deleted_at IS NULL ${q.blockId ? sql`AND u.block_id = ${q.blockId}` : sql``}
        ORDER BY b.sort_order NULLS LAST, b.name NULLS FIRST,
                 NULLIF(substring(u.number from '[0-9]+'), '')::numeric NULLS LAST, u.number,
                 (o.relation = 'owner') DESC, o.start_date
      `)) as unknown as Row[],
    );

    // Kişi × daire ilişkileri (aynı kişinin aynı dairede eski + yeni kaydı).
    const relations = new Map<string, MemberRelation[]>();
    for (const r of rows) {
      if (!r.user_id) continue;
      const key = `${String(r.unit_id)}:${String(r.user_id)}`;
      const list = relations.get(key) ?? [];
      list.push({ relation: String(r.relation), ended: r.ended === true, unitHasActiveTenant: r.has_tenant === true });
      relations.set(key, list);
    }

    const units = new Map<string, RecipientResponse["rows"][number]>();
    let phoneCount = 0;
    for (const r of rows) {
      const unitId = String(r.unit_id);
      let unit = units.get(unitId);
      if (!unit) {
        const block = r.block_name ? String(r.block_name) : null;
        unit = {
          unitId,
          unitLabel: block ? `${block} / ${String(r.number)}` : String(r.number),
          blockName: block,
          people: [],
          landShare: r.land_share === null || r.land_share === undefined ? null : String(r.land_share),
        };
        units.set(unitId, unit);
      }
      if (!r.user_id) continue;
      const userId = String(r.user_id);
      if (unit.people.some((p) => p.userId === userId)) continue;
      const rels = relations.get(`${unitId}:${userId}`) ?? [];
      if (!relationMatchesScope(rels, scope)) continue;
      const active = rels.find((x) => !x.ended);
      const shown = active ?? rels[0]!;
      const phone = q.phones && r.phone ? String(r.phone) : null;
      if (phone) phoneCount += 1;
      unit.people.push({
        userId,
        name: r.name ? String(r.name) : "—",
        relation: shown.relation,
        former: !active,
        phone,
      });
    }

    if (q.phones) {
      await this.audit.record({
        action: "recipient_phones_exported",
        resource: "resident",
        diff: { phoneCount: { from: null, to: phoneCount }, scope: { from: null, to: scope } },
      });
    }

    return {
      rows: [...units.values()].filter((u) => scope === "all" || u.people.length > 0),
    };
  }
}
