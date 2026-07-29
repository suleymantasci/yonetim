import { Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, isNull } from "drizzle-orm";

import type {
  AccessRequestDecision,
  AccessRequestListResponse,
} from "@yonetim/contracts";
import { errors, maskPhone } from "@yonetim/core";
import { accessRequests, memberships, unitOccupancies, units, users } from "@yonetim/db";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";

/**
 * Sakin erişim talepleri — yöneticinin onay kuyruğu.
 *
 * ÜYELİĞİ YÖNETİCİ AÇIYOR, BAŞVURAN DEĞİL. `/kayit-talebi` yalnız bir beyan
 * kaydı bırakıyor; daire numarası ve kimlik doğrulaması yöneticinin işi.
 * Otomatik onay, "3. daire" yazan herkesi o dairenin sakini yapardı — o kişi
 * de sitenin duyurularını, karar defterini ve toplantı tutanaklarını okurdu.
 *
 * ONAYDA DAİRE **YÖNETİCİDEN** GELİYOR: başvurunun `unit_label` alanı serbest
 * metin ve beyan. Eşleşme önerisi listede gösteriliyor ama bağlayıcı değil.
 */
@Injectable()
export class AccessRequestService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AccessRequestListResponse> {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(accessRequests)
        .orderBy(desc(accessRequests.createdAt))
        .limit(200);

      const unitRows = await tx
        .select({ id: units.id, number: units.number })
        .from(units)
        .where(isNull(units.deletedAt));
      const byNumber = new Map(unitRows.map((u) => [normalize(u.number), u]));

      return {
        pendingCount: rows.filter((r) => r.status === "pending").length,
        rows: rows.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          // Kuyruk ekranında maskeli: onaydan önce numaraya ihtiyaç yok,
          // liste ise sitedeki her yöneticinin gördüğü bir yüzey.
          phoneMasked: maskPhone(r.phone),
          email: r.email,
          blockLabel: r.blockLabel,
          unitLabel: r.unitLabel,
          claimedRelation: r.claimedRelation,
          note: r.note,
          status: r.status,
          createdAt: r.createdAt,
          matchedUnit: byNumber.get(normalize(r.unitLabel)) ?? null,
        })),
      };
    });
  }

  async approve(id: string, dto: AccessRequestDecision): Promise<{ ok: true }> {
    if (!dto.unitId) throw errors.validation("unit_required");
    const ctx = this.db.ctx();

    await this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(accessRequests)
        .where(and(eq(accessRequests.id, id), eq(accessRequests.status, "pending")))
        .limit(1);
      const request = rows[0];
      if (!request) throw new NotFoundException("not_found");

      // Kişi platformda tekil ("tek cari"): aynı numara başka bir sitede
      // kayıtlıysa yeni kullanıcı açılmıyor, mevcut kayda üyelik ekleniyor.
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phone, request.phone))
        .limit(1);

      const [firstName, ...rest] = request.fullName.trim().split(/\s+/);
      const userId =
        request.userId ??
        existing[0]?.id ??
        (
          await tx
            .insert(users)
            .values({
              phone: request.phone,
              email: request.email,
              firstName: firstName ?? request.fullName,
              lastName: rest.join(" ") || null,
            })
            .returning({ id: users.id })
        )[0]!.id;

      const relation = dto.relation ?? request.claimedRelation;

      const already = await tx
        .select({ n: count() })
        .from(memberships)
        .where(
          and(eq(memberships.userId, userId), eq(memberships.tenantId, ctx.tenantId)),
        );
      if (Number(already[0]?.n ?? 0) === 0) {
        await tx.insert(memberships).values({
          tenantId: ctx.tenantId,
          userId,
          role: relation === "owner" ? "owner" : "tenant_resident",
        });
      }

      await tx.insert(unitOccupancies).values({
        tenantId: ctx.tenantId,
        unitId: dto.unitId!,
        userId,
        relation: relation === "owner" ? "owner" : "tenant",
        startDate: new Date(),
      });

      await tx
        .update(accessRequests)
        .set({
          status: "approved",
          userId,
          unitId: dto.unitId,
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
        })
        .where(eq(accessRequests.id, id));
    });

    await this.audit.record({
      action: "access_request.approved",
      resource: "access_request",
      resourceId: id,
    });

    return { ok: true };
  }

  async reject(id: string, dto: AccessRequestDecision): Promise<{ ok: true }> {
    const ctx = this.db.ctx();

    await this.db.tx(async (tx) => {
      const updated = await tx
        .update(accessRequests)
        .set({
          status: "rejected",
          rejectionReason: dto.rejectionReason ?? null,
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
        })
        .where(and(eq(accessRequests.id, id), eq(accessRequests.status, "pending")))
        .returning({ id: accessRequests.id });
      if (!updated[0]) throw new NotFoundException("not_found");
    });

    await this.audit.record({
      action: "access_request.rejected",
      resource: "access_request",
      resourceId: id,
      reason: dto.rejectionReason,
    });

    return { ok: true };
  }
}

/** "A/12", "a-12", " 12 " → "12" — beyan yazımı sitelere göre değişiyor. */
function normalize(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}
