import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import type {
  DebtCertificateIssue,
  DebtCertificateIssueResult,
  DebtCertificateListResponse,
} from "@yonetim/contracts";
import { readableCode } from "@yonetim/core/crypto";
import { debtCertificates, debts, units } from "@yonetim/db";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";

/**
 * Borcu yoktur belgesi — GAP 4.1.9, SPEC 3.6.
 *
 * Belge verildiği **an**ın fotoğrafıdır: `asOfDate` ve o andaki bakiye
 * kaydediliyor. Sonradan borç doğsa bile belgenin ne söylediği tartışmalı
 * olmuyor — tapu devrinde ibraz edilen bir belge için bu şart.
 *
 * Seri numarası aynı transaction içinde sayaçtan türüyor: iki eşzamanlı
 * talebin aynı numarayı alması belgenin tekilliğini bozardı.
 */
@Injectable()
export class CertificateService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async list(): Promise<DebtCertificateListResponse> {
    const rows = await this.db.tx(async (tx) =>
      tx
        .select({
          id: debtCertificates.id,
          unitId: debtCertificates.unitId,
          unitNumber: units.number,
          result: debtCertificates.result,
          outstandingKurus: debtCertificates.outstandingKurus,
          asOfDate: debtCertificates.asOfDate,
          serialNo: debtCertificates.serialNo,
          pdfUrl: debtCertificates.pdfUrl,
          kepRecipient: debtCertificates.kepRecipient,
          kepSentAt: debtCertificates.kepSentAt,
          verificationCode: debtCertificates.verificationCode,
          createdAt: debtCertificates.createdAt,
          voidedAt: debtCertificates.voidedAt,
          voidReason: debtCertificates.voidReason,
        })
        .from(debtCertificates)
        .leftJoin(units, eq(units.id, debtCertificates.unitId))
        .orderBy(desc(debtCertificates.createdAt))
        .limit(50),
    );

    const mapped = rows.map((r) => ({
      id: r.id,
      unitId: r.unitId,
      unitNumber: r.unitNumber,
      result: r.result,
      outstandingMinor: r.outstandingKurus,
      asOfDate: r.asOfDate,
      serialNo: r.serialNo,
      pdfUrl: r.pdfUrl,
      kepRecipient: r.kepRecipient,
      kepSentAt: r.kepSentAt,
      verificationCode: r.verificationCode,
      createdAt: r.createdAt,
      voidedAt: r.voidedAt,
      voidReason: r.voidReason,
    }));

    return {
      rows: mapped,
      totals: {
        clean: mapped.filter((r) => r.result === "clear").length,
        withDebt: mapped.filter((r) => r.result !== "clear").length,
        kepSent: mapped.filter((r) => r.kepSentAt).length,
      },
    };
  }

  /**
   * Belgeyi iptal et — silinmez. Doğrulama sayfası iptal tarihini ve
   * gerekçesini gösterir; elden ele dolaşan yanlış belge böylece etkisizleşir.
   */
  async voidCertificate(id: string, reason: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [row] = await tx
        .select({ id: debtCertificates.id, voidedAt: debtCertificates.voidedAt })
        .from(debtCertificates)
        .where(eq(debtCertificates.id, id))
        .limit(1)
        .for("update");
      if (!row) throw new NotFoundException("not_found");
      if (row.voidedAt) throw new ConflictException("conflict:certificate_already_void");
      await tx
        .update(debtCertificates)
        .set({
          voidedAt: new Date(),
          voidReason: reason,
          voidedBy: this.db.ctx().userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(debtCertificates.id, id));
    });
    await this.audit.record({
      action: "certificate_voided",
      resource: "debt_certificate",
      resourceId: id,
      diff: { reason: { from: null, to: reason } },
    });
    return { id };
  }

  async issue(dto: DebtCertificateIssue): Promise<DebtCertificateIssueResult> {
    const ctx = this.db.ctx();
    const asOfDate = new Date();

    const result = await this.db.tx(async (tx) => {
      const unitRows = await tx
        .select({ id: units.id, number: units.number })
        .from(units)
        .where(and(eq(units.number, dto.unitNumber), isNull(units.deletedAt)))
        .limit(1);
      const unit = unitRows[0];
      if (!unit) throw new NotFoundException("not_found:unit");

      const [balance] = await tx
        .select({
          outstanding: sql<number>`COALESCE(SUM(${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus}), 0)`,
        })
        .from(debts)
        .where(
          and(
            eq(debts.unitId, unit.id),
            isNull(debts.deletedAt),
            sql`${debts.status} NOT IN ('paid','written_off')`,
          ),
        );

      const outstanding = Math.max(0, Number(balance?.outstanding ?? 0));
      const [seq] = await tx.select({ value: count() }).from(debtCertificates);
      // Önek sonucu taşıyor: BYB = borcu yoktur, BDB = borç durumu belgesi.
      const serialNo = `${outstanding === 0 ? "BYB" : "BDB"}-${asOfDate.getFullYear()}-${String(
        (seq?.value ?? 0) + 1,
      ).padStart(6, "0")}`;
      const verificationCode = readableCode(8);

      const [created] = await tx.insert(debtCertificates).values({
        tenantId: ctx.tenantId,
        unitId: unit.id,
        requestedBy: ctx.userId,
        result: outstanding === 0 ? "clear" : "outstanding",
        outstandingKurus: outstanding,
        asOfDate,
        serialNo,
        verificationCode,
        kepRecipient: dto.kepRecipient ?? null,
      }).returning({ id: debtCertificates.id });

      return {
        id: created!.id,
        serialNo,
        verificationCode,
        result: (outstanding === 0 ? "clear" : "outstanding") as
          "clear" | "outstanding",
        outstandingMinor: outstanding,
        unitLabel: unit.number,
        asOfDate,
      };
    });

    await this.audit.record({
      action: "debt_certificate_issued",
      resource: "debt_certificate",
      // `resource_id` uuid kolonu: seri numarası yazılınca insert patlıyor ve
      // belge üretimi 500 dönüyordu. Seri numarası gerekçede.
      resourceId: result.id,
      reason: `${result.serialNo} · ${result.unitLabel} · ${result.result}`,
    });

    // Belgeyi talep eden kişiye doğrulama kodu gidiyor: belgeyi ibraz edecek
    // olan o ve kodu elle yazması gerekiyor.
    this.events.emit("certificate.issued", {
      event: "certificate.issued",
      // uuid: worker bunu `notifications.resource_id`'ye yazıyor.
      resourceId: result.id,
      subjectUserId: ctx.userId,
      params: { serialNo: result.serialNo, code: result.verificationCode },
    });

    return result;
  }
}
