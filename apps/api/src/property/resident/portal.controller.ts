import { Controller, ForbiddenException, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { PortalOverview } from "@yonetim/contracts";
import {
  announcements,
  debtChanges,
  debts,
  payments,
  tenants,
  unitOccupancies,
  units,
} from "@yonetim/db";

import { DbService } from "../../infra/db/db.service";

/**
 * Sakin self-servis portalı — `/v1/panel/portal/me` (SPEC Faz 2 / Bölüm 6.1).
 *
 * `@RequirePermission` YOK ve bilinçli: sakinin `debt:read` izni yok, olması
 * da gerekmiyor. Kapsamı izin değil **sorgu** kısıtlıyor — dönen her satır
 * oturumdaki kullanıcının kendi dairesinden. İzin adı eklemek, sakine
 * "borçları okuyabilir" demek olurdu ki bu paneldeki tüm borçları kapsar.
 *
 * Aktif daire oturumdan bulunuyor; istemci `unitId` gönderemiyor. Gönderebilse
 * sakin komşusunun kimliğini yazıp onun borcunu görürdü.
 */
@ApiTags("panel/portal")
@Controller("v1/panel/portal")
export class PortalController {
  constructor(private readonly db: DbService) {}

  @Get("me")
  @ApiOperation({
    summary: "Sakin portalı — borç, ödeme, düzeltme ve duyurular tek yanıtta",
  })
  async me(): Promise<PortalOverview> {
    const ctx = this.db.ctx();
    if (!ctx.userId) throw new ForbiddenException("user_context_required");
    const userId = ctx.userId;

    return this.db.tx(async (tx) => {
      const tenantRows = await tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1);
      const tenantName = tenantRows[0]?.name ?? "";

      const occ = await tx
        .select({
          unitId: unitOccupancies.unitId,
          number: units.number,
          relation: unitOccupancies.relation,
        })
        .from(unitOccupancies)
        .innerJoin(units, eq(units.id, unitOccupancies.unitId))
        .where(
          and(
            eq(unitOccupancies.userId, userId),
            isNull(unitOccupancies.endDate),
          ),
        )
        .limit(1);

      const unit = occ[0];
      if (!unit) {
        // Daire yok = hata değil, durum: yeni taşınmış sakin kaydı henüz
        // eşleştirilmemiş olabilir. Ekran bunu anlatan bir boş durum gösteriyor.
        return {
          unit: null,
          tenantName,
          totals: {
            outstandingMinor: 0,
            overdueMinor: 0,
            lastPaymentMinor: null,
          },
          debts: [],
          changes: [],
          announcements: [],
        };
      }

      const debtRows = await tx
        .select()
        .from(debts)
        .where(and(eq(debts.unitId, unit.unitId), isNull(debts.deletedAt)))
        .orderBy(desc(debts.dueDate))
        .limit(24);

      const paymentRows = await tx
        .select({ amountKurus: payments.amountKurus })
        .from(payments)
        .where(
          and(
            eq(payments.unitId, unit.unitId),
            eq(payments.status, "completed"),
          ),
        )
        .orderBy(desc(payments.paidAt))
        .limit(1);

      const changes = await tx
        .select()
        .from(debtChanges)
        .where(
          and(
            eq(debtChanges.unitId, unit.unitId),
            // Yalnız sakine açık düzeltmeler: iç not niteliğindeki değişiklikler
            // portalda görünmüyor (GAP 4.1.6).
            eq(debtChanges.visibleToResident, true),
          ),
        )
        .orderBy(desc(debtChanges.createdAt))
        .limit(20);

      const announcementRows = await tx
        .select({
          id: announcements.id,
          title: announcements.title,
          body: announcements.body,
          publishedAt: announcements.publishedAt,
        })
        .from(announcements)
        .where(
          and(
            isNull(announcements.deletedAt),
            sql`${announcements.publishedAt} IS NOT NULL`,
          ),
        )
        .orderBy(desc(announcements.publishedAt))
        .limit(5);

      // "Vadesi geçti mi" kararı sunucu saatiyle: tarayıcının saati yanlışsa
      // sakin borcunu gecikmemiş sanardı.
      const now = new Date();
      const open = debtRows.filter((d) => d.status !== "paid");
      const outstanding = open.reduce(
        (a, d) => a + (d.amountKurus + d.lateFeeKurus - d.paidKurus),
        0,
      );
      const overdue = open
        .filter((d) => d.dueDate < now)
        .reduce((a, d) => a + (d.amountKurus + d.lateFeeKurus - d.paidKurus), 0);

      return {
        unit: {
          id: unit.unitId,
          number: unit.number,
          relation: unit.relation,
        },
        tenantName,
        totals: {
          outstandingMinor: outstanding,
          overdueMinor: overdue,
          lastPaymentMinor: paymentRows[0]?.amountKurus ?? null,
        },
        debts: debtRows.map((d) => ({
          id: d.id,
          description: d.description,
          dueDate: d.dueDate,
          amountMinor: d.amountKurus,
          lateFeeMinor: d.lateFeeKurus,
          paidMinor: d.paidKurus,
          status: d.status,
          overdue: d.status !== "paid" && d.dueDate < now,
        })),
        changes: changes.map((c) => ({
          id: c.id,
          changeType: c.changeType,
          oldAmountMinor: Number(c.oldAmountKurus ?? 0),
          newAmountMinor: Number(c.newAmountKurus ?? 0),
          reason: c.reason,
          createdAt: c.createdAt,
        })),
        announcements: announcementRows,
      };
    });
  }
}
