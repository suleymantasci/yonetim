import { Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

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
  emptyKindTotals,
  type ImportDebtLine,
  type ImportPerson,
  type ImportUnitRow,
  type PersonRole,
  type UnitImportIssue,
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
import { blocks, debts, memberships, migrationJobs, unitOccupancies, units, users } from "@yonetim/db";

import { AuditService } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import { assertUnitQuota } from "../property/unit/unit-quota";
import { refreshBlockCount } from "../property/unit/unit.repository";

type Tx = Parameters<Parameters<DbService["tx"]>[0]>[0];

interface ExistingUnit {
  id: string;
  /** Çöp kutusunda (silinmiş): aktarım onu geri getirir. Blok + numara tekil
   *  index'i silinmişleri de kapsıyor; yeni daire açmak çakışırdı. */
  trashed: boolean;
  blockId: string | null;
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
        ? { units: [], personMode: false, issues: [], skipped: 0, totals: { byKind: emptyKindTotals(), debtMinor: 0, blocks: [] } }
        : applyUnitMapping(table.rows, headerRow, mapping);

    const site = await this.db.tx((tx) => this.lookup(tx, filePhones(mapped)));
    const people = new PersonResolver(site);
    const statusOf = (u: ImportUnitRow) => {
      const hit = site.units.get(unitKey(u.blockName, u.number));
      if (!hit) return "new" as const;
      if (hit.hasBalance) return "has_balance" as const;
      return hit.trashed ? ("trashed" as const) : ("existing" as const);
    };
    const byKind = emptyKindTotals();
    let newUnits = 0;
    let withBalance = 0;
    // Aynı kişi birden çok dairede (iki dairesi olan malik) bir kez sayılır.
    const distinct = new Set<string>();
    const distinctNew = new Set<string>();
    let formerTenants = 0;
    const rows = mapped.units.map((u) => {
      const status = statusOf(u);
      if (status === "new") newUnits += 1;
      if (status === "has_balance") withBalance += 1;
      else for (const d of [...u.debts, ...u.people.flatMap((p) => p.debts)]) byKind[d.kind] += d.amountMinor;
      return {
        line: u.line,
        blockName: u.blockName ?? null,
        number: u.number,
        debts: u.debts,
        people: u.people.map((p) => {
          const match = people.resolve(p);
          const who = `${nameKey(p.name)}#${p.phone ?? ""}`;
          distinct.add(who);
          if (!match.userId) distinctNew.add(who);
          if (p.role === "tenant" && p.former) formerTenants += 1;
          return {
            line: p.line,
            role: p.role,
            former: p.former,
            name: p.name,
            hasPhone: Boolean(p.phone) && !match.phoneTaken,
            debts: p.debts,
            status: match.userId ? ("existing" as const) : ("new" as const),
          };
        }),
        status,
      };
    });
    const issues = [...mapped.issues, ...people.issues];

    const below = table.rows.slice(headerRow + 1);
    const width = Math.min(40, Math.max(header.length, ...below.slice(0, 30).map((r) => r.length), 0));
    // Örnekler satır hizalı: sütun başına "ilk dolu değer" almak, boş hücreli
    // satırda (telefonu olmayan kiracı) alttaki kişinin değerini yanına koyuyordu.
    const sampleRows = below.filter((r) => r.some((c) => display(c).trim() !== "")).slice(0, 3);
    const columns = Array.from({ length: width }, (_, index) => {
      const values = below.map((r) => display(r[index] ?? null).trim()).filter((v) => v !== "");
      const field: UnitImportField = mapping[index] ?? "ignore";
      return {
        index,
        header: display(header[index] ?? null).replace(/\s+/g, " ").trim().slice(0, 80),
        field,
        samples: sampleRows.map((r) => display(r[index] ?? null).trim().slice(0, 80)),
        unusedMoney: field === "ignore" && looksLikeMoney(values),
      };
    }).filter((c) => c.header !== "" || c.samples.some((v) => v !== "") || c.field !== "ignore");

    const errorCount = issues.filter((i) => i.severity === "error").length;
    return {
      format: table.format,
      headerRow,
      headerFound: dto.headerRow !== undefined || found >= 0,
      mappingSource: dto.mapping ? "request" : "guess",
      columns,
      problems,
      topRows: table.rows.slice(0, 25).map((r) => r.slice(0, width || 12).map((c) => display(c).replace(/\s+/g, " ").slice(0, 60))),
      personMode: mapped.personMode,
      rows: rows.slice(0, 300),
      issues: [...issues]
        .sort((a, b) => (a.severity === b.severity ? a.line - b.line : a.severity === "error" ? -1 : 1))
        .slice(0, 150)
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
        people: distinct.size,
        newPeople: distinctNew.size,
        formerTenants,
        blocks: mapped.totals.blocks.length,
        newBlocks: mapped.totals.blocks.filter((b) => !site.blocks.has(blockKey(b)) && !site.trashedBlocks.has(blockKey(b))).length,
        debtMinor: Object.values(byKind).reduce((a, b) => a + b, 0),
        byKind,
        errors: errorCount,
        warnings: issues.length - errorCount,
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

      const site = await this.lookup(tx, filePhones(result));
      const people = new PersonResolver(site);

      // Bloklar: büyük/küçük harf farkı aynı blok ("A Blok" = "A BLOK").
      const blockIds = new Map<string, string>(site.blocks);
      let createdBlocks = 0;
      for (const name of result.totals.blocks) {
        if (blockIds.has(blockKey(name))) continue;
        const trashed = site.trashedBlocks.get(blockKey(name));
        if (trashed) {
          // Silinmiş blok geri gelir (blok adı tekil index'i silinmişi de kapsıyor).
          await tx.update(blocks).set({ deletedAt: null }).where(eq(blocks.id, trashed));
          blockIds.set(blockKey(name), trashed);
          continue;
        }
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
      let peopleCreated = 0;
      let peopleLinked = 0;
      let restoredUnits = 0;
      const touchedBlocks = new Set<string | null>();

      const addDebt = async (unitId: string, debtorUserId: string | null, d: ImportDebtLine, line: number) => {
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
          metadata: { migrated: true, sourceRow: line, columns: d.columns, jobId: job!.id },
        });
        createdDebts += 1;
        debtMinor += d.amountMinor;
      };

      for (const u of result.units) {
        const hit = site.units.get(unitKey(u.blockName, u.number));
        let unitId: string;
        if (hit && !hit.trashed) {
          existingUnits += 1;
          unitId = hit.id;
        } else if (hit) {
          // Çöp kutusundaki daire geri gelir; geri yükleme de paket sınırına tabi.
          await assertUnitQuota(tx, ctx.tenantId, 1);
          await tx.update(units).set({ deletedAt: null }).where(eq(units.id, hit.id));
          touchedBlocks.add(hit.blockId);
          existingUnits += 1;
          restoredUnits += 1;
          unitId = hit.id;
        } else {
          // Paket sınırı her yeni daire için: aşan göç bütünüyle geri alınır.
          await assertUnitQuota(tx, ctx.tenantId, 1);
          const currentTenant = u.people.some((p) => p.role === "tenant" && !p.former);
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
              ownershipType: currentTenant ? "tenant" : "owner",
              metadata: { importedFrom: dto.fileName, jobId: job!.id },
            })
            .returning({ id: units.id, blockId: units.blockId });
          if (!unit) continue;
          unitId = unit.id;
          touchedBlocks.add(unit.blockId);
          createdUnits += 1;
        }

        // Kişiler: kayıt (ya da mevcut kişiye bağlama), üyelik, ilişki.
        const userOf = new Map<ImportPerson, string>();
        const currentOwners = u.people.filter((p) => p.role === "owner" && !p.former);
        for (const p of u.people) {
          const match = people.resolve(p);
          let userId = match.userId;
          if (!userId) {
            const { firstName, lastName } = splitFullName(p.name);
            const [created] = await tx
              .insert(users)
              .values({ firstName, lastName, phone: match.phoneTaken ? null : (p.phone ?? null) })
              .returning({ id: users.id });
            userId = created!.id;
            people.remember(p, userId, match.phoneTaken);
            peopleCreated += 1;
          } else if (!site.members.has(userId)) {
            peopleLinked += 1;
          }
          site.members.add(userId);
          userOf.set(p, userId);
          await tx
            .insert(memberships)
            .values({
              tenantId: ctx.tenantId,
              userId,
              role: p.role === "owner" ? "owner" : "tenant_resident",
              invitedBy: ctx.userId,
              invitedAt: today,
              acceptedAt: today,
            })
            .onConflictDoNothing();
          await this.linkOccupancy(tx, {
            tenantId: ctx.tenantId,
            unitId,
            userId,
            role: p.role,
            former: p.former,
            ownershipPct: p.role === "owner" && !p.former ? 100 / Math.max(1, currentOwners.length) : 100,
            today,
            keepTenants: u.people.filter((x) => x.role === "tenant" && !x.former).map((x) => userOf.get(x) ?? ""),
          });
        }

        if (hit?.hasBalance) {
          // Devri zaten aktarılmış daireye ikinci kez borç yazılmaz.
          withBalance += 1;
          continue;
        }
        for (const p of u.people) for (const d of p.debts) await addDebt(unitId, userOf.get(p) ?? null, d, p.line);
        // Daireye ait (kişiye bağlanmamış) borç: dosyadaki güncel malik, yoksa
        // sitedeki mevcut borçlu.
        const unitDebtor = (currentOwners[0] && userOf.get(currentOwners[0])) ?? hit?.debtorUserId ?? null;
        for (const d of u.debts) await addDebt(unitId, unitDebtor, d, u.line);
      }

      for (const blockId of touchedBlocks) await refreshBlockCount(tx, blockId);

      const skipped = result.issues.filter((i) => i.code === "empty_unit").length;
      await tx
        .update(migrationJobs)
        .set({
          status: "completed",
          importedRows: createdUnits + existingUnits - withBalance,
          skippedRows: skipped + withBalance,
          // Uyarılar da kaydediliyor: atlanan satırın / aktarılmayan alacağın
          // nedeni sonradan sorulduğunda cevap kütükte olmalı.
          errors: [...result.issues, ...people.issues],
          summary: {
            units: createdUnits,
            existingUnits,
            withBalance,
            debts: createdDebts,
            debtMinor,
            blocks: createdBlocks,
            peopleCreated,
            peopleLinked,
            restoredUnits,
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
        peopleCreated,
        peopleLinked,
        restoredUnits,
        withBalance,
        skipped,
      };
    });

    await this.audit.record({
      action: "migration_completed",
      resource: "migration_job",
      resourceId: counts.jobId,
      reason: `${dto.fileName}: ${counts.units} yeni birim, ${counts.existingUnits} mevcut, ${counts.peopleCreated} yeni kişi, ${counts.debts} devir borcu`,
    });
    return counts;
  }

  /**
   * Malik/kiracı ilişkisi. Aynı açık ilişki varsa dokunulmaz. Güncel kiracı
   * gelince dosyada güncel kiracı olarak geçmeyen eski açık kiracı kayıtları
   * bugünle kapanır. Eski kiracı/malik kapalı ilişki olarak yazılır (başlangıç
   * tarihi bilinmiyor; bugün) ve borcu kişide kalır (`keep`).
   */
  private async linkOccupancy(
    tx: Tx,
    p: { tenantId: string; unitId: string; userId: string; role: PersonRole; former: boolean; ownershipPct: number; today: Date; keepTenants: string[] },
  ) {
    const open = await tx
      .select({ id: unitOccupancies.id, userId: unitOccupancies.userId })
      .from(unitOccupancies)
      .where(and(eq(unitOccupancies.unitId, p.unitId), eq(unitOccupancies.relation, p.role), isNull(unitOccupancies.endDate)));
    if (open.some((o) => o.userId === p.userId)) return;
    if (p.former) {
      const any = await tx
        .select({ id: unitOccupancies.id })
        .from(unitOccupancies)
        .where(and(eq(unitOccupancies.unitId, p.unitId), eq(unitOccupancies.userId, p.userId), eq(unitOccupancies.relation, p.role)))
        .limit(1);
      if (any[0]) return;
    }
    if (p.role === "tenant" && !p.former) {
      const stale = open.filter((o) => !p.keepTenants.includes(o.userId)).map((o) => o.id);
      if (stale.length > 0) await tx.update(unitOccupancies).set({ endDate: p.today }).where(inArray(unitOccupancies.id, stale));
    }
    await tx.insert(unitOccupancies).values({
      tenantId: p.tenantId,
      unitId: p.unitId,
      userId: p.userId,
      relation: p.role,
      ownershipPct: p.ownershipPct.toFixed(3),
      startDate: p.today,
      endDate: p.former ? p.today : null,
      debtTransferPolicy: p.former ? "keep" : "owner",
    });
    if (!p.former) {
      await tx
        .update(units)
        .set(p.role === "owner" ? { currentOwnerId: p.userId } : { currentTenantId: p.userId, ownershipType: "tenant" })
        .where(eq(units.id, p.unitId));
    }
  }

  /** Sitenin mevcut daireleri, blokları ve kişileri. */
  private async lookup(tx: Tx, phones: string[]): Promise<SiteSnapshot> {
    const blockRows = await tx.select({ id: blocks.id, name: blocks.name, deletedAt: blocks.deletedAt }).from(blocks);
    const blockMap = new Map(blockRows.filter((b) => !b.deletedAt).map((b) => [blockKey(b.name), b.id]));
    const trashedBlocks = new Map(blockRows.filter((b) => b.deletedAt).map((b) => [blockKey(b.name), b.id]));
    const rows = (await tx.execute(sql`
      SELECT u.id, u.number, u.block_id, b.name AS block_name, u.deleted_at IS NOT NULL AS trashed,
             EXISTS (
               SELECT 1 FROM debts d
               WHERE d.unit_id = u.id AND d.deleted_at IS NULL AND d.status <> 'cancelled'
                 AND (d.metadata ? 'opening' OR d.metadata ? 'migrated')
             ) AS has_balance,
             (SELECT o.user_id FROM unit_occupancies o
               WHERE o.unit_id = u.id AND o.end_date IS NULL
               ORDER BY (o.relation = 'owner') DESC, o.start_date LIMIT 1) AS debtor
      FROM units u LEFT JOIN blocks b ON b.id = u.block_id
      ORDER BY u.deleted_at IS NULL
    `)) as unknown as Array<{
      id: string; number: string; block_id: string | null; block_name: string | null; trashed: boolean; has_balance: boolean; debtor: string | null;
    }>;
    // Silinmişler önce: aynı anahtarda canlı daire varsa o kazanır.
    const unitMap = new Map<string, ExistingUnit>();
    for (const r of rows) {
      unitMap.set(unitKey(r.block_name, r.number), {
        id: r.id, trashed: r.trashed, blockId: r.block_id, hasBalance: r.has_balance, debtorUserId: r.debtor,
      });
    }

    // Sitenin kişileri (ad eşleşmesi için) — üyelik RLS ile bu siteyle sınırlı.
    const memberRows = (await tx.execute(sql`
      SELECT DISTINCT u.id, u.first_name, u.last_name, u.phone
      FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE u.deleted_at IS NULL AND m.role IN ('owner', 'tenant_resident')
    `)) as unknown as Array<{ id: string; first_name: string | null; last_name: string | null; phone: string | null }>;
    return {
      units: unitMap,
      blocks: blockMap,
      trashedBlocks,
      members: new Set(memberRows.map((m) => m.id)),
      byName: new Map(memberRows.map((m) => [nameKey(`${m.first_name ?? ""} ${m.last_name ?? ""}`), m.id])),
      phoneOwner: await this.phoneOwners(tx, phones),
    };
  }

  /**
   * Telefon → kişi. Telefon platformda tekil ("tek cari"): başka sitede
   * kayıtlı kişi de bulunur, ad tutarsa ona bağlanılır. Yalnız **dosyadaki**
   * numaralar sorgulanır.
   */
  private async phoneOwners(tx: Tx, phones: string[]): Promise<Map<string, { id: string; name: string }>> {
    if (phones.length === 0) return new Map();
    const rows = await tx
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, phone: users.phone })
      .from(users)
      .where(and(inArray(users.phone, phones), isNull(users.deletedAt)));
    return new Map(rows.map((r) => [r.phone!, { id: r.id, name: nameKey(`${r.firstName ?? ""} ${r.lastName ?? ""}`) }]));
  }
}

interface SiteSnapshot {
  units: Map<string, ExistingUnit>;
  blocks: Map<string, string>;
  trashedBlocks: Map<string, string>;
  /** Sitede malik/sakin üyeliği olan kişiler. */
  members: Set<string>;
  byName: Map<string, string>;
  phoneOwner: Map<string, { id: string; name: string }>;
}

/**
 * Dosyadaki kişiyi sitedeki/platformdaki kişiye eşler.
 *
 *   1. Telefon kayıtlıysa ve **ad da tutuyorsa** o kişi. Ad tutmuyorsa numara
 *      başkasının (aile içinde ortak numara sık: baba–oğul aynı telefonu
 *      yazdırmış) — kişi yeni açılır, telefonsuz; uyarı verilir.
 *   2. Telefonla bulunamadıysa sitedeki aynı adlı malik/sakin.
 *   3. Dosyada daha önce geçen aynı kişi (iki dairesi olan malik).
 */
class PersonResolver {
  readonly issues: UnitImportIssue[] = [];
  private readonly seen = new Map<string, string | null>();
  private readonly takenInFile = new Map<string, string>();

  constructor(private readonly site: SiteSnapshot) {}

  resolve(p: ImportPerson): { userId: string | null; phoneTaken: boolean } {
    const name = nameKey(p.name);
    const fileKey = `${name}#${p.phone ?? ""}`;
    if (this.seen.has(fileKey)) return { userId: this.seen.get(fileKey) ?? null, phoneTaken: this.phoneTaken(p, name) };

    let userId: string | null = null;
    let phoneTaken = false;
    if (p.phone) {
      const owner = this.site.phoneOwner.get(p.phone);
      if (owner && owner.name === name) userId = owner.id;
      else if (owner || this.takenInFile.has(p.phone)) phoneTaken = true;
    }
    // Telefonla bulunamadıysa (ya da numara başkasınınsa) sitedeki aynı adlı kişi.
    if (!userId) userId = this.site.byName.get(name) ?? null;
    if (userId) phoneTaken = false;
    if (phoneTaken) {
      this.issues.push({ line: p.line, severity: "warning", code: "shared_phone", unit: p.name, value: p.phone });
    } else if (p.phone && !userId) {
      this.takenInFile.set(p.phone, name);
    }
    this.seen.set(fileKey, userId);
    return { userId, phoneTaken };
  }

  remember(p: ImportPerson, userId: string, phoneTaken: boolean) {
    this.seen.set(`${nameKey(p.name)}#${p.phone ?? ""}`, userId);
    if (p.phone && !phoneTaken) this.site.phoneOwner.set(p.phone, { id: userId, name: nameKey(p.name) });
  }

  private phoneTaken(p: ImportPerson, name: string): boolean {
    if (!p.phone) return false;
    const owner = this.site.phoneOwner.get(p.phone);
    const inFile = this.takenInFile.get(p.phone);
    return (owner !== undefined && owner.name !== name) || (inFile !== undefined && inFile !== name);
  }
}

function filePhones(mapped: MappedUnitImport): string[] {
  return [...new Set(mapped.units.flatMap((u) => u.people.map((p) => p.phone)).filter((x): x is string => Boolean(x)))];
}

function nameKey(name: string): string {
  return foldTurkish(name).replace(/[^a-z0-9]+/g, " ").trim();
}

/** "MEHMET ALİ AYAN" → ad "MEHMET ALİ", soyad "AYAN" (Türkçede soyad sondadır). */
function splitFullName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { firstName: full.trim().slice(0, 80), lastName: null };
  return { firstName: parts.slice(0, -1).join(" ").slice(0, 80), lastName: parts[parts.length - 1]!.slice(0, 80) };
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
