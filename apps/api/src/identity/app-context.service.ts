import { Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { AppContextResponse } from "@yonetim/contracts";
import { memberships, tenants, users } from "@yonetim/db";

import { DbService } from "../infra/db/db.service";

/**
 * Panelin kabuk bağlamı — `GET /v1/auth/context`.
 *
 * `authMe` çözülmüş kimliği verir; burası ekranın **gösterdiği** alanları
 * ekliyor: site adı, durumu ve kullanıcının erişebildiği diğer siteler.
 *
 * Site listesi tenant sınırını aşıyor (tanımı gereği: "başka hangi sitelere
 * girebilirim"), bu yüzden RLS baypası gerekiyor. Kapsam dar tutuluyor —
 * yalnız `id/slug/name`, yalnız bu kullanıcının üyeliklerinden çıkan
 * kimliklerle sınırlı; başka bir sitenin verisi hiçbir koşulda dönmüyor.
 */
@Injectable()
export class AppContextService {
  constructor(private readonly db: DbService) {}

  async resolve(): Promise<AppContextResponse> {
    const ctx = this.db.ctx();
    if (!ctx.userId) throw new NotFoundException("user_context_required");
    const userId = ctx.userId;

    const { rows, person } = await this.db.bypass("ctx:shell", async (tx) => {
      const membershipRows = await tx
        .select({ tenantId: memberships.tenantId })
        .from(memberships)
        .where(
          and(eq(memberships.userId, userId), isNull(memberships.deletedAt)),
        );

      // Aktif site üyelik listesinde olmayabilir: platform yöneticisi
      // impersonation ile bakarken üyeliği yok ama site adı yine gerekiyor.
      const ids = [
        ...new Set([...membershipRows.map((r) => r.tenantId), ctx.tenantId]),
      ];

      const tenantRows = await tx
        .select({
          id: tenants.id,
          slug: tenants.slug,
          name: tenants.name,
          status: tenants.status,
        })
        .from(tenants)
        .where(and(inArray(tenants.id, ids), isNull(tenants.deletedAt)));

      // `users` global tablo (tenant sütunu yok); erişim kendi kimliğiyle
      // sınırlı — kullanıcı yalnız kendi adını okuyor.
      const personRows = await tx
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return { rows: tenantRows, person: personRows[0] ?? null };
    });

    const active = rows.find((row) => row.id === ctx.tenantId);
    if (!active) throw new NotFoundException("tenant_not_found");

    return {
      userId,
      userName:
        [person?.firstName, person?.lastName].filter(Boolean).join(" ") ||
        person?.email ||
        "",
      tenantId: active.id,
      tenantSlug: active.slug,
      tenantName: active.name,
      tenantStatus: active.status,
      roles: ctx.roles,
      locale: ctx.locale,
      impersonatedBy: ctx.impersonatedBy ?? null,
      memberships: rows
        .filter((row) => row.id !== ctx.tenantId)
        .map((row) => ({ id: row.id, slug: row.slug, name: row.name })),
    };
  }
}
