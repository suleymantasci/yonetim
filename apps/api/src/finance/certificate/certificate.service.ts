import { Injectable, NotFoundException } from "@nestjs/common";
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
            sql`${debts.status} <> 'paid'`,
          ),
        );

      const outstanding = Math.max(0, Number(balance?.outstanding ?? 0));
      const [seq] = await tx.select({ value: count() }).from(debtCertificates);
      // Önek sonucu taşıyor: BYB = borcu yoktur, BDB = borç durumu belgesi.
      const serialNo = `${outstanding === 0 ? "BYB" : "BDB"}-${asOfDate.getFullYear()}-${String(
        (seq?.value ?? 0) + 1,
      ).padStart(6, "0")}`;
      const verificationCode = readableCode(8);

      await tx.insert(debtCertificates).values({
        tenantId: ctx.tenantId,
        unitId: unit.id,
        requestedBy: ctx.userId,
        result: outstanding === 0 ? "clear" : "outstanding",
        outstandingKurus: outstanding,
        asOfDate,
        serialNo,
        verificationCode,
        kepRecipient: dto.kepRecipient ?? null,
      });

      return {
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
      resourceId: result.serialNo,
      reason: `${result.unitLabel} · ${result.result}`,
    });

    return result;
  }
}
