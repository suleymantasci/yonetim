import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { AuditListQuery } from "@yonetim/contracts";
import { auditLogs, users } from "@yonetim/db";

import { DbService } from "../../infra/db/db.service";

/**
 * Denetim kütüğü okuma — MIMARI-PLAN §8.5.
 *
 * Yazma tarafı `AuditService`'te; burada **yalnız** okuma var. Kütük
 * append-only olduğu için bu dosyada `update`/`delete` bulunmaması bir eksik
 * değil, tasarımın kendisi.
 *
 * Okuma tenant kapsamında (`tx`): `audit_logs` satırlarının `tenant_id`
 * kolonu var, dolayısıyla RLS baypasına gerek yok. Yalnız aktör **adı**
 * `users` tablosundan geliyor (RLS dışı) ve o, dönen sayfadaki kimliklerle
 * sınırlı dar bir baypasla çözülüyor.
 */
@Injectable()
export class AuditRepository {
  constructor(private readonly db: DbService) {}

  async list(q: AuditListQuery) {
    const conditions: SQL[] = [];
    // M-37: `audit_logs.tenant_id` nullable; RLS dynamic loop'a girmediği
    // için tenant filtresi açıkça sorguya eklenir. Aksi halde login olmuş
    // kullanıcı başka tenant'ın audit satırlarını görebilir.
    const ctx = this.db.ctx();
    if (ctx?.tenantId) conditions.push(eq(auditLogs.tenantId, ctx.tenantId));
    if (q.action) conditions.push(eq(auditLogs.action, q.action));
    if (q.resource) conditions.push(eq(auditLogs.resource, q.resource));
    if (q.from) conditions.push(gte(auditLogs.createdAt, q.from));
    if (q.to) conditions.push(lte(auditLogs.createdAt, q.to));
    if (q.search) {
      const needle = `%${q.search}%`;
      const match = or(
        sql`${auditLogs.action} ILIKE ${needle}`,
        sql`${auditLogs.resource} ILIKE ${needle}`,
        sql`${auditLogs.reason} ILIKE ${needle}`,
      );
      if (match) conditions.push(match);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const { rows, total, actions, resources } = await this.db.tx(async (tx) => {
      const order =
        q.dir === "asc" ? asc(auditLogs.createdAt) : desc(auditLogs.createdAt);

      const [rows, totalRows, actionRows, resourceRows] = await Promise.all([
        tx
          .select({
            id: auditLogs.id,
            action: auditLogs.action,
            resource: auditLogs.resource,
            resourceId: auditLogs.resourceId,
            reason: auditLogs.reason,
            ip: auditLogs.ip,
            diff: auditLogs.diff,
            userId: auditLogs.userId,
            impersonatedBy: auditLogs.impersonatedBy,
            createdAt: auditLogs.createdAt,
          })
          .from(auditLogs)
          .where(where)
          .orderBy(order)
          .limit(q.perPage)
          .offset((q.page - 1) * q.perPage),

        tx
          .select({ value: countDistinct(auditLogs.id) })
          .from(auditLogs)
          .where(where),

        // Facet'ler filtresiz: kullanıcı bir eylemi seçtikten sonra diğer
        // seçenekler listeden kaybolmamalı, yoksa filtreyi değiştiremez.
        tx
          .select({
            value: auditLogs.action,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(auditLogs)
          .groupBy(auditLogs.action)
          .orderBy(auditLogs.action),

        tx
          .select({
            value: auditLogs.resource,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(auditLogs)
          .groupBy(auditLogs.resource)
          .orderBy(auditLogs.resource),
      ]);

      return {
        rows,
        total: Number(totalRows[0]?.value ?? 0),
        actions: actionRows,
        resources: resourceRows,
      };
    });

    const actorIds = [
      ...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id)),
    ];
    const actors =
      actorIds.length > 0
        ? await this.db.bypass("audit:actor-names", async (tx) =>
            tx
              .select({
                id: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
              })
              .from(users)
              .where(inArray(users.id, actorIds)),
          )
        : [];
    const nameById = new Map(
      actors.map((a) => [
        a.id,
        [a.firstName, a.lastName].filter(Boolean).join(" ") || null,
      ]),
    );

    return {
      rows: rows.map((row) => ({
        ...row,
        actorName: row.userId ? (nameById.get(row.userId) ?? null) : null,
      })),
      total,
      actions,
      resources,
    };
  }

  async detail(id: string) {
    const row = await this.db.tx(async (tx) => {
      const found = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.id, id))
        .limit(1);
      return found[0] ?? null;
    });
    if (!row) return null;

    const actorName = row.userId
      ? await this.db.bypass("audit:actor-name", async (tx) => {
          const found = await tx
            .select({ firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(eq(users.id, row.userId!))
            .limit(1);
          const person = found[0];
          return person
            ? [person.firstName, person.lastName].filter(Boolean).join(" ") ||
                null
            : null;
        })
      : null;

    return { row, actorName };
  }
}
