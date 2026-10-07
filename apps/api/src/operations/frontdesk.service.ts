import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";

import type {
  FrontdeskResponse,
  ParcelCreate,
  ParcelDeliver,
  VisitorCreate,
} from "@yonetim/contracts";
import { blocks, notifications, parcels, unitOccupancies, units, visitors } from "@yonetim/db";

import { AuditService } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import type { Database } from "../property/unit/types";

const DAY_MS = 86_400_000;

/**
 * Kargo ve ziyaretçi defteri — kapıcı/güvenliğin günlük ekranı.
 *
 * Kargo kaydı açılınca daireye bağlı sakinlere uygulama içi bildirim düşer
 * ("kargonuz geldi"); teslimde kim teslim aldı yazılır. Ziyaretçi kişisel
 * veri: ekran son 30 günü gösteriyor, daha eskisi KVKK saklama işinin konusu.
 */
@Injectable()
export class FrontdeskService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async overview(): Promise<FrontdeskResponse> {
    return this.db.tx(async (tx) => {
      const since = new Date(Date.now() - 30 * DAY_MS);
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [parcelRows, visitorRows, labels] = await Promise.all([
        tx
          .select()
          .from(parcels)
          .where(or(isNull(parcels.deliveredAt), gte(parcels.receivedAt, since)))
          .orderBy(desc(parcels.receivedAt))
          .limit(200),
        tx
          .select()
          .from(visitors)
          .where(or(isNull(visitors.leftAt), gte(visitors.arrivedAt, since)))
          .orderBy(desc(visitors.arrivedAt))
          .limit(200),
        unitLabels(tx),
      ]);

      return {
        parcels: parcelRows.map((p) => ({
          id: p.id,
          unitId: p.unitId,
          unitLabel: p.unitId ? (labels.get(p.unitId) ?? null) : null,
          recipientName: p.recipientName,
          carrier: p.carrier,
          trackingNo: p.trackingNo,
          note: p.note,
          receivedAt: p.receivedAt,
          deliveredAt: p.deliveredAt,
          deliveredTo: p.deliveredTo,
        })),
        visitors: visitorRows.map((v) => ({
          id: v.id,
          unitId: v.unitId,
          unitLabel: v.unitId ? (labels.get(v.unitId) ?? null) : null,
          visitorName: v.visitorName,
          phone: v.phone,
          plate: v.plate,
          purpose: v.purpose,
          note: v.note,
          arrivedAt: v.arrivedAt,
          leftAt: v.leftAt,
        })),
        totals: {
          waitingParcels: parcelRows.filter((p) => !p.deliveredAt).length,
          visitorsInside: visitorRows.filter((v) => !v.leftAt).length,
          visitorsToday: visitorRows.filter((v) => v.arrivedAt >= startOfDay).length,
        },
      };
    });
  }

  async receiveParcel(dto: ParcelCreate): Promise<{ id: string; notified: number }> {
    const ctx = this.db.ctx();
    const result = await this.db.tx(async (tx) => {
      if (dto.unitId) await assertUnit(tx, dto.unitId);
      const [created] = await tx
        .insert(parcels)
        .values({
          tenantId: ctx.tenantId,
          unitId: dto.unitId ?? null,
          recipientName: dto.recipientName,
          carrier: dto.carrier ?? null,
          trackingNo: dto.trackingNo ?? null,
          note: dto.note ?? null,
          receivedBy: ctx.userId ?? null,
        })
        .returning({ id: parcels.id });

      // Dairedeki aktif sakinlere uygulama içi bildirim.
      let notified = 0;
      if (dto.unitId) {
        const residents = await tx
          .select({ userId: unitOccupancies.userId })
          .from(unitOccupancies)
          .where(and(eq(unitOccupancies.unitId, dto.unitId), isNull(unitOccupancies.endDate)));
        const unique = [...new Set(residents.map((r) => r.userId))];
        if (unique.length > 0) {
          await tx.insert(notifications).values(
            unique.map((userId) => ({
              tenantId: ctx.tenantId,
              userId,
              channel: "in_app" as const,
              template: "parcel.received",
              params: { carrier: dto.carrier ?? null, recipient: dto.recipientName },
              recipient: userId,
              subject: "Kargonuz geldi",
              body: [
                dto.carrier ? `${dto.carrier} kargosu` : "Adınıza bir paket",
                `(${dto.recipientName}) güvenlik/kapıcıda sizi bekliyor.`,
              ].join(" "),
              status: "sent" as const,
              sentAt: new Date(),
              resourceType: "parcel",
              resourceId: created!.id,
            })),
          );
          notified = unique.length;
        }
      }
      return { id: created!.id, notified };
    });
    await this.audit.record({ action: "parcel_received", resource: "parcel", resourceId: result.id });
    return result;
  }

  async deliverParcel(id: string, dto: ParcelDeliver): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [row] = await tx.select({ deliveredAt: parcels.deliveredAt }).from(parcels).where(eq(parcels.id, id)).limit(1).for("update");
      if (!row) throw new NotFoundException("not_found");
      if (row.deliveredAt) throw new ConflictException("conflict:parcel_already_delivered");
      await tx
        .update(parcels)
        .set({
          deliveredAt: new Date(),
          deliveredTo: dto.deliveredTo,
          deliveredBy: this.db.ctx().userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(parcels.id, id));
    });
    await this.audit.record({ action: "parcel_delivered", resource: "parcel", resourceId: id });
    return { id };
  }

  async registerVisitor(dto: VisitorCreate): Promise<{ id: string }> {
    const ctx = this.db.ctx();
    const id = await this.db.tx(async (tx) => {
      if (dto.unitId) await assertUnit(tx, dto.unitId);
      const [created] = await tx
        .insert(visitors)
        .values({
          tenantId: ctx.tenantId,
          unitId: dto.unitId ?? null,
          visitorName: dto.visitorName,
          phone: dto.phone ?? null,
          plate: dto.plate ?? null,
          purpose: dto.purpose ?? null,
          note: dto.note ?? null,
          createdBy: ctx.userId ?? null,
        })
        .returning({ id: visitors.id });
      return created!.id;
    });
    await this.audit.record({ action: "visitor_registered", resource: "visitor", resourceId: id });
    return { id };
  }

  async checkoutVisitor(id: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [row] = await tx.select({ leftAt: visitors.leftAt }).from(visitors).where(eq(visitors.id, id)).limit(1).for("update");
      if (!row) throw new NotFoundException("not_found");
      if (row.leftAt) throw new ConflictException("conflict:visitor_already_left");
      await tx.update(visitors).set({ leftAt: new Date(), updatedAt: new Date() }).where(eq(visitors.id, id));
    });
    await this.audit.record({ action: "visitor_checked_out", resource: "visitor", resourceId: id });
    return { id };
  }
}

async function assertUnit(tx: Database, unitId: string) {
  const [unit] = await tx
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.id, unitId), isNull(units.deletedAt)))
    .limit(1);
  if (!unit) throw new NotFoundException("not_found:unit");
}

async function unitLabels(tx: Database): Promise<Map<string, string>> {
  const rows = await tx
    .select({ id: units.id, number: units.number, blockName: blocks.name })
    .from(units)
    .leftJoin(blocks, eq(blocks.id, units.blockId));
  return new Map(rows.map((r) => [r.id, r.blockName ? `${r.blockName} / ${r.number}` : r.number] as const));
}
