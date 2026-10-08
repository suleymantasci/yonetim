import { Injectable } from "@nestjs/common";
import { eq, isNull, sql } from "drizzle-orm";

import {
  applyUnitMapping,
  display,
  findUnitHeaderRow,
  guessUnitMapping,
  parseAmount,
  readTable,
  StatementFileError,
  unitKey,
  UNIT_IMPORT_FIELDS,
  validateUnitMapping,
  type ImportDebtKind,
  type ImportUnitRow,
  type MappedUnitImport,
  type Table,
  type UnitImportField,
  type UnitImportMapping,
} from "@yonetim/bank";
import type {
  MigrationCommit,
  MigrationCommitResult,
  MigrationPreview,
  MigrationPreviewRequest,
} from "@yonetim/contracts";
import { errors, foldTurkish } from "@yonetim/core";
import { blocks, debts, migrationJobs, units } from "@yonetim/db";

import { AuditService } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import { assertUnitQuota } from "../property/unit/unit-quota";

type Tx = Parameters<Parameters<DbService["tx"]>[0]>[0];

interface ExistingUnit {
  id: string;
  hasBalance: boolean;
  debtorUserId: string | null;
}

/**
 * Veri aktarımı (göç): başka programın Excel/CSV dışa aktarımından daire ve
 * devir borçları. Okuma/eşleştirme `@yonetim/bank/unit-import` içinde, tek
 * yerde; önizleme ve yazma aynı fonksiyondan geçer.
 *
 * Mevcut daireler ikizlenmez (blok + numara, "01" = "1"); varsa yalnız borcu
 * eklenir. Dairede zaten aktarılmış/açılış devri varsa borç **eklenmez** —
 * aynı dosya iki kez yüklendiğinde borç iki kat olmasın. Tamamı tek
 * transaction: yarım kalmış göç, hangi dairenin aktarıldığını belirsiz bırakırdı.
 */
@Injectable()
export class MigrationService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async preview(dto: MigrationPreviewRequest): Promise<MigrationPreview> {
    const table = readFile(dto.fileBase64);
    const found = findUnitHeaderRow(table.rows);
    const headerRow = dto.headerRow ?? (found >= 0 ? found : 0);
    const header = table.rows[headerRow] ?? [];
    const mapping = dto.mapping ? toMapping(dto.mapping) : guessUnitMapping(header);
    const problems = validateUnitMapping(mapping);
    const mapped: MappedUnitImport =
      problems.length > 0
        ? { units: [], issues: [], skipped: 0, totals: { byKind: { dues: 0, utility: 0, late_fee: 0, extra: 0 }, debtMinor: 0, blocks: [] } }
        : applyUnitMapping(table.rows, headerRow, mapping);

    const { existing, blockNames } = await this.db.tx((tx) => this.lookup(tx));
    const statusOf = (u: ImportUnitRow) => {
      const hit = existing.get(unitKey(u.blockName, u.number));
      return !hit ? ("new" as const) : hit.hasBalance ? ("has_balance" as const) : ("existing" as const);
    };
    const byKind: Record<ImportDebtKind, number> = { dues: 0, utility: 0, late_fee: 0, extra: 0 };
    let newUnits = 0;
    let withBalance = 0;
    for (const u of mapped.units) {
      const status = statusOf(u);
      if (status === "new") newUnits += 1;
      if (status === "has_balance") {
        withBalance += 1;
        continue;
      }
      for (const d of u.debts) byKind[d.kind] += d.amountMinor;
    }

    const below = table.rows.slice(headerRow + 1);
    const width = Math.min(40, Math.max(header.length, ...below.slice(0, 30).map((r) => r.length), 0));
    const columns = Array.from({ length: width }, (_, index) => {
      const values = below.map((r) => display(r[index] ?? null).trim()).filter((v) => v !== "");
      const field: UnitImportField = mapping[index] ?? "ignore";
      return {
        index,
        header: display(header[index] ?? null).replace(/\s+/g, " ").trim().slice(0, 80),
        field,
        samples: values.slice(0, 3).map((v) => v.slice(0, 80)),
        unusedMoney: field === "ignore" && looksLikeMoney(values),
      };
    }).filter((c) => c.header !== "" || c.samples.length > 0 || c.field !== "ignore");

    const errorCount = mapped.issues.filter((i) => i.severity === "error").length;
    return {
      format: table.format,
      headerRow,
      headerFound: dto.headerRow !== undefined || found >= 0,
      mappingSource: dto.mapping ? "request" : "guess",
      columns,
      problems,
      topRows: table.rows.slice(0, 25).map((r) => r.slice(0, width || 12).map((c) => display(c).replace(/\s+/g, " ").slice(0, 60))),
      rows: mapped.units.slice(0, 200).map((u) => ({
        line: u.line,
        blockName: u.blockName ?? null,
        number: u.number,
        ownerName: u.ownerName ?? null,
        tenantName: u.tenantName ?? null,
        debts: u.debts,
        status: statusOf(u),
      })),
      issues: [...mapped.issues]
        .sort((a, b) => (a.severity === b.severity ? a.line - b.line : a.severity === "error" ? -1 : 1))
        .slice(0, 100)
        .map((i) => ({
          line: i.line,
          severity: i.severity,
          code: i.code,
          unit: i.unit ?? null,
          column: i.column ?? null,
          expectedMinor: i.expectedMinor ?? null,
          actualMinor: i.actualMinor ?? null,
          value: i.value ?? null,
        })),
      totals: {
        units: mapped.units.length,
        newUnits,
        existingUnits: mapped.units.length - newUnits,
        withBalance,
        blocks: mapped.totals.blocks.length,
        newBlocks: mapped.totals.blocks.filter((b) => !blockNames.has(blockKey(b))).length,
        debtMinor: byKind.dues + byKind.utility + byKind.late_fee + byKind.extra,
        byKind,
        errors: errorCount,
        warnings: mapped.issues.length - errorCount,
        skipped: mapped.skipped,
      },
    };
  }

  async commit(dto: MigrationCommit): Promise<MigrationCommitResult> {
    const ctx = this.db.ctx();
    const table = readFile(dto.fileBase64);
    const mapping = toMapping(dto.mapping);
    const problems = validateUnitMapping(mapping);
    if (problems.length > 0) throw errors.validation(`migration_${problems[0]}`);
    const result = applyUnitMapping(table.rows, dto.headerRow, mapping);
    if (result.issues.some((i) => i.severity === "error")) throw errors.validation("migration_has_errors");
    if (result.units.length === 0) throw errors.validation("migration_no_rows");

    const counts = await this.db.tx(async (tx) => {
      const [job] = await tx
        .insert(migrationJobs)
        .values({
          tenantId: ctx.tenantId,
          source: "excel",
          fileName: dto.fileName,
          status: "running",
          totalRows: result.units.length + result.issues.filter((i) => i.code === "empty_unit").length,
          mapping: { headerRow: dto.headerRow, columns: dto.mapping },
          startedAt: new Date(),
        })
        .returning({ id: migrationJobs.id });

      const { existing, blockNames } = await this.lookup(tx);

      // Bloklar: büyük/küçük harf farkı aynı blok ("A Blok" = "A BLOK").
      const blockIds = new Map<string, string>(blockNames);
      let createdBlocks = 0;
      for (const name of result.totals.blocks) {
        if (blockIds.has(blockKey(name))) continue;
        const [created] = await tx
          .insert(blocks)
          .values({ tenantId: ctx.tenantId, name, floorCount: 1 })
          .returning({ id: blocks.id });
        if (created) {
          blockIds.set(blockKey(name), created.id);
          createdBlocks += 1;
        }
      }

      const today = new Date();
      let createdUnits = 0;
      let existingUnits = 0;
      let withBalance = 0;
      let createdDebts = 0;
      let debtMinor = 0;

      for (const u of result.units) {
        const hit = existing.get(unitKey(u.blockName, u.number));
        let unitId: string;
        let debtorUserId: string | null = null;
        if (hit) {
          existingUnits += 1;
          if (hit.hasBalance) {
            withBalance += 1;
            continue;
          }
          unitId = hit.id;
          debtorUserId = hit.debtorUserId;
        } else {
          // Paket sınırı her yeni daire için: aşan göç bütünüyle geri alınır.
          await assertUnitQuota(tx, ctx.tenantId, 1);
          const [unit] = await tx
            .insert(units)
            .values({
              tenantId: ctx.tenantId,
              blockId: u.blockName ? (blockIds.get(blockKey(u.blockName)) ?? null) : null,
              number: u.number,
              floor: u.floor ?? 0,
              type: "flat",
              areaM2: u.areaM2 !== undefined ? String(u.areaM2) : null,
              landShare: u.landShare !== undefined ? String(u.landShare) : null,
              ownershipType: u.tenantName ? "tenant" : "owner",
              metadata: {
                importedFrom: dto.fileName,
                ownerName: u.ownerName,
                ownerPhone: u.ownerPhone,
                tenantName: u.tenantName,
                tenantPhone: u.tenantPhone,
              },
            })
            .returning({ id: units.id });
          if (!unit) continue;
          unitId = unit.id;
          createdUnits += 1;
        }

        for (const d of u.debts) {
          await tx.insert(debts).values({
            tenantId: ctx.tenantId,
            unitId,
            debtorUserId,
            kind: d.kind,
            description: `${dto.carriedBalanceLabel}: ${d.columns.join(" + ")}`.slice(0, 200),
            amountKurus: d.amountMinor,
            // Devir borcu bugün itibarıyla vadesi gelmiş borçtur; muhasebe
            // `metadata.migrated` borcunu vade gününde açılış olarak yazar.
            dueDate: today,
            // Önceki programın gecikme bedeline yeniden gecikme işlemez.
            lateFeeExempt: d.kind === "late_fee",
            status: "pending",
            metadata: { migrated: true, sourceRow: u.line, columns: d.columns, jobId: job!.id },
          });
          createdDebts += 1;
          debtMinor += d.amountMinor;
        }
      }

      const skipped = result.issues.filter((i) => i.code === "empty_unit").length;
      await tx
        .update(migrationJobs)
        .set({
          status: "completed",
          importedRows: createdUnits + existingUnits - withBalance,
          skippedRows: skipped + withBalance,
          // Uyarılar da kaydediliyor: atlanan satırın / aktarılmayan alacağın
          // nedeni sonradan sorulduğunda cevap kütükte olmalı.
          errors: result.issues,
          summary: {
            units: createdUnits,
            existingUnits,
            withBalance,
            debts: createdDebts,
            debtMinor,
            blocks: createdBlocks,
            byKind: result.totals.byKind,
          },
          finishedAt: new Date(),
        })
        .where(eq(migrationJobs.id, job!.id));

      return {
        jobId: job!.id,
        units: createdUnits,
        existingUnits,
        blocks: createdBlocks,
        debts: createdDebts,
        debtMinor,
        withBalance,
        skipped,
      };
    });

    await this.audit.record({
      action: "migration_completed",
      resource: "migration_job",
      resourceId: counts.jobId,
      reason: `${dto.fileName}: ${counts.units} yeni birim, ${counts.existingUnits} mevcut, ${counts.debts} devir borcu`,
    });
    return counts;
  }

  /** Sitenin mevcut daireleri (blok + numara anahtarıyla) ve blokları. */
  private async lookup(tx: Tx): Promise<{ existing: Map<string, ExistingUnit>; blockNames: Map<string, string> }> {
    const blockRows = await tx.select({ id: blocks.id, name: blocks.name }).from(blocks).where(isNull(blocks.deletedAt));
    const blockNames = new Map(blockRows.map((b) => [blockKey(b.name), b.id]));
    const rows = (await tx.execute(sql`
      SELECT u.id, u.number, b.name AS block_name,
             EXISTS (
               SELECT 1 FROM debts d
               WHERE d.unit_id = u.id AND d.deleted_at IS NULL AND d.status <> 'cancelled'
                 AND (d.metadata ? 'opening' OR d.metadata ? 'migrated')
             ) AS has_balance,
             (SELECT o.user_id FROM unit_occupancies o
               WHERE o.unit_id = u.id AND o.end_date IS NULL
               ORDER BY (o.relation = 'owner') DESC, o.start_date LIMIT 1) AS debtor
      FROM units u LEFT JOIN blocks b ON b.id = u.block_id
      WHERE u.deleted_at IS NULL
    `)) as unknown as Array<{ id: string; number: string; block_name: string | null; has_balance: boolean; debtor: string | null }>;
    const existing = new Map<string, ExistingUnit>();
    for (const r of rows) {
      existing.set(unitKey(r.block_name, r.number), { id: r.id, hasBalance: r.has_balance, debtorUserId: r.debtor });
    }
    return { existing, blockNames };
  }
}

function blockKey(name: string): string {
  return foldTurkish(name).replace(/\s+/g, " ").trim();
}

function readFile(fileBase64: string): Table {
  try {
    return readTable(Buffer.from(fileBase64, "base64"));
  } catch (error) {
    if (error instanceof StatementFileError) throw errors.validation(`migration_file_${error.code}`);
    throw error;
  }
}

function toMapping(raw: Record<string, string>): UnitImportMapping {
  const mapping: UnitImportMapping = {};
  for (const [key, field] of Object.entries(raw)) {
    if (field !== "ignore" && (UNIT_IMPORT_FIELDS as readonly string[]).includes(field)) mapping[Number(key)] = field as UnitImportField;
  }
  return mapping;
}

/**
 * Sütundaki dolu değerlerin çoğu tutar gibi mi ("1.250,00", "750", 1250)?
 * Telefon (boşluklu) ve TC kimlik (11 hane) tutar sayılmaz.
 */
function looksLikeMoney(values: string[]): boolean {
  const sample = values.slice(0, 30);
  if (sample.length === 0) return false;
  const money = sample.filter((v) => /^-?(\d{1,3}([.,]\d{3})+|\d{1,7})([.,]\d{1,2})?$/.test(v));
  return money.length / sample.length >= 0.6 && money.some((v) => (parseAmount(v) ?? 0) !== 0);
}
