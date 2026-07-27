import { BadRequestException, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";

import type {
  BankOverviewResponse,
  MigrationCommit,
  MigrationCommitResult,
  MigrationListResponse,
} from "@yonetim/contracts";
import { mapImport } from "@yonetim/core";
import {
  bankAccounts,
  bankTransactions,
  blocks,
  debts,
  migrationJobs,
  reconciliationIssues,
  units,
} from "@yonetim/db";

import { AuditService } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";

/**
 * `integration` bağlamı — banka mutabakatı ve veri göçü (MIMARI-PLAN §6.3).
 *
 * IBAN yalnız **maskeli** dönüyor: eşleştirme zaten blind index üzerinden
 * sunucuda yapılıyor, panelin tam numaraya ihtiyacı yok (§9.1).
 */
@Injectable()
export class IntegrationService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async bankOverview(): Promise<BankOverviewResponse> {
    const { accounts, transactions, issues } = await this.db.tx(async (tx) => {
      const [accounts, transactions, issues] = await Promise.all([
        tx.select().from(bankAccounts).where(isNull(bankAccounts.deletedAt)),
        tx
          .select({
            id: bankTransactions.id,
            accountId: bankTransactions.accountId,
            direction: bankTransactions.direction,
            amountKurus: bankTransactions.amountKurus,
            counterparty: bankTransactions.counterparty,
            description: bankTransactions.description,
            transactionAt: bankTransactions.transactionAt,
            matchStatus: bankTransactions.matchStatus,
            matchConfidence: bankTransactions.matchConfidence,
            matchedUnitNumber: units.number,
          })
          .from(bankTransactions)
          .leftJoin(units, eq(units.id, bankTransactions.matchedUnitId))
          .orderBy(desc(bankTransactions.transactionAt))
          .limit(100),
        // Yalnız çözülmemiş sorunlar: çözülmüş bir mutabakat farkı ekranda
        // eylem beklemiyor, listeyi doldurup gerçek sorunları gizlerdi.
        tx
          .select()
          .from(reconciliationIssues)
          .where(isNull(reconciliationIssues.resolvedAt))
          .orderBy(desc(reconciliationIssues.createdAt))
          .limit(50),
      ]);
      return { accounts, transactions, issues };
    });

    const matched = transactions.filter((t) => t.matchStatus === "matched");

    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        bankName: a.bankName,
        // Şifreli IBAN sınırı geçmiyor; maskeli kopya zaten kayıtta duruyor.
        ibanMasked: a.ibanMasked,
        accountName: a.accountName,
        purpose: a.purpose,
        provider: a.provider,
        balanceMinor: a.balanceKurus,
        lastSyncedAt: a.lastSyncedAt,
        syncStatus: a.syncStatus,
        syncError: a.syncError,
        isActive: a.isActive,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        accountId: t.accountId,
        direction: t.direction,
        amountMinor: t.amountKurus,
        counterparty: t.counterparty,
        description: t.description,
        transactionAt: t.transactionAt,
        matchStatus: t.matchStatus,
        matchConfidence: t.matchConfidence,
        matchedUnitNumber: t.matchedUnitNumber,
      })),
      issues: issues.map((i) => ({
        id: i.id,
        kind: i.kind,
        severity: i.severity,
        // Şemada nullable; sözleşmede 0 — "beklenen tutar yok" ile "sıfır"
        // ayrımı mutabakat ekranında anlam taşımıyor.
        expectedMinor: i.expectedKurus ?? 0,
        actualMinor: i.actualKurus ?? 0,
        detail: typeof i.detail === "string" ? i.detail : null,
        resolvedAt: i.resolvedAt,
        retryCount: i.retryCount,
        createdAt: i.createdAt,
      })),
      totals: {
        balanceMinor: accounts.reduce((s, a) => s + a.balanceKurus, 0),
        unmatched: transactions.filter((t) => t.matchStatus !== "matched")
          .length,
        openIssues: issues.length,
        matchRatePct:
          transactions.length > 0
            ? Math.round((matched.length / transactions.length) * 100)
            : 0,
      },
    };
  }

  async migrations(): Promise<MigrationListResponse> {
    const rows = await this.db.tx(async (tx) =>
      tx
        .select()
        .from(migrationJobs)
        .orderBy(desc(migrationJobs.createdAt))
        .limit(20),
    );

    return {
      rows: rows.map((j) => ({
        id: j.id,
        source: j.source,
        fileName: j.fileName,
        status: j.status,
        totalRows: j.totalRows,
        importedRows: j.importedRows,
        skippedRows: j.skippedRows,
        // Hata listesi göçün kanıtı: atlanan satırın nedeni görünmezse
        // yönetici eksik veriyi fark edemez.
        errors: j.errors ?? null,
        summary: j.summary ?? null,
        startedAt: j.startedAt,
        finishedAt: j.finishedAt,
        createdAt: j.createdAt,
      })),
    };
  }

  /**
   * Göçü uygular — açılış bakiyeleri "devir" borcu olarak yazılır.
   *
   * Dosya burada **yeniden** ayrıştırılıyor (`mapImport` saf bir fonksiyon):
   * istemcinin gönderdiği hazır satırlara güvenmek, önizlemede görülenle
   * yazılanın ayrışmasına kapı açardı.
   *
   * Tamamı tek transaction: yarım kalmış bir göç, yöneticinin hangi dairenin
   * aktarıldığını bilemediği bir duruma yol açardı.
   */
  async commitMigration(dto: MigrationCommit): Promise<MigrationCommitResult> {
    const ctx = this.db.ctx();
    const result = mapImport(dto.content, dto.source);
    if (result.units.length === 0) {
      throw new BadRequestException("validation_failed:no_rows");
    }

    const counts = await this.db.tx(async (tx) => {
      const [job] = await tx
        .insert(migrationJobs)
        .values({
          tenantId: ctx.tenantId,
          source: dto.source,
          fileName: dto.fileName,
          status: "running",
          totalRows: result.summary.totalRows,
          mapping: result.detectedColumns,
          startedAt: new Date(),
        })
        .returning({ id: migrationJobs.id });

      const blockIds = new Map<string, string>();
      for (const name of result.summary.blocks) {
        const existing = await tx
          .select({ id: blocks.id })
          .from(blocks)
          .where(and(eq(blocks.name, name), isNull(blocks.deletedAt)))
          .limit(1);
        if (existing[0]) {
          blockIds.set(name, existing[0].id);
          continue;
        }
        const [created] = await tx
          .insert(blocks)
          .values({ tenantId: ctx.tenantId, name, floorCount: 1 })
          .returning({ id: blocks.id });
        if (created) blockIds.set(name, created.id);
      }

      let importedUnits = 0;
      let importedDebts = 0;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);

      for (const u of result.units) {
        const blockId = u.blockName
          ? (blockIds.get(u.blockName) ?? null)
          : null;

        // Aynı numaralı birim varsa atlanıyor: göç iki kez çalıştırıldığında
        // daireler ikizlenmemeli.
        const existing = await tx
          .select({ id: units.id })
          .from(units)
          .where(and(eq(units.number, u.number), isNull(units.deletedAt)))
          .limit(1);
        if (existing[0]) continue;

        const [unit] = await tx
          .insert(units)
          .values({
            tenantId: ctx.tenantId,
            blockId,
            number: u.number,
            floor: u.floor ?? 0,
            type: "flat",
            areaM2: u.areaM2 !== undefined ? String(u.areaM2) : null,
            landShare: u.landShare !== undefined ? String(u.landShare) : null,
            ownershipType: u.tenantName ? "tenant" : "owner",
            metadata: {
              importedFrom: dto.source,
              ownerName: u.ownerName,
              ownerPhone: u.ownerPhone,
              tenantName: u.tenantName,
              tenantPhone: u.tenantPhone,
            },
          })
          .returning({ id: units.id });

        if (!unit) continue;
        importedUnits += 1;

        if (u.openingBalanceKurus && u.openingBalanceKurus > 0) {
          await tx.insert(debts).values({
            tenantId: ctx.tenantId,
            unitId: unit.id,
            kind: "extra",
            description: dto.carriedBalanceLabel,
            amountKurus: u.openingBalanceKurus,
            dueDate,
            status: "pending",
            metadata: { migrated: true, sourceRow: u.rowIndex },
          });
          importedDebts += 1;
        }
      }

      const skipped = result.summary.totalRows - importedUnits;
      await tx
        .update(migrationJobs)
        .set({
          status: "completed",
          importedRows: importedUnits,
          skippedRows: skipped,
          // Uyarılar da kaydediliyor: atlanan satırın nedeni sonradan
          // sorulduğunda cevap kütükte olmalı.
          errors: result.issues,
          summary: {
            units: importedUnits,
            debts: importedDebts,
            blocks: blockIds.size,
            openingBalanceKurus: result.summary.totalOpeningBalanceKurus,
          },
          finishedAt: new Date(),
        })
        .where(eq(migrationJobs.id, job!.id));

      return {
        jobId: job!.id,
        units: importedUnits,
        blocks: blockIds.size,
        debts: importedDebts,
        skipped,
      };
    });

    await this.audit.record({
      action: "migration_completed",
      resource: "migration_job",
      resourceId: counts.jobId,
      reason: `${dto.source}: ${counts.units} birim, ${counts.debts} devir borcu`,
    });

    return counts;
  }
}
