import { BadRequestException, Injectable } from "@nestjs/common";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import type {
  BankOverviewResponse,
  CashboxRow,
  MigrationCommit,
  MigrationCommitResult,
  MigrationListResponse,
} from "@yonetim/contracts";
import { mapImport } from "@yonetim/core";
import {
  openingEntries,
  bankAccounts,
  bankTransactions,
  blocks,
  debts,
  expenses,
  migrationJobs,
  payments,
  reconciliationIssues,
  units,
} from "@yonetim/db";

import { AuditService } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import { assertUnitQuota } from "../property/unit/unit-quota";

/**
 * Kasa kovalarının sabit anahtarları — hesap kimliği (uuid metni) ile
 * çakışmayacak değerler.
 */
const CASH_BUCKET = "cash";
const UNASSIGNED_BUCKET = "unassigned";

/**
 * `SUM(bigint)` sürücüden **metin** olarak dönüyor; `mapWith(Number)`
 * olmadan JS tarafındaki toplama "100" + "50" = "10050" üretir.
 */
const sumKurus = (expr: SQL) =>
  sql<number>`COALESCE(SUM(${expr}), 0)`.mapWith(Number);

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
    /*
     * Kasa kovaları: hesap kimliği metne çevriliyor, nakit ve hesabı
     * belirtilmemiş kayıtlar sabit anahtarlara düşüyor. Tek `GROUP BY` ile
     * hem hesap başına hem nakit toplamı çıkıyor — hesap sayısı kadar sorgu
     * atmak yerine.
     *
     * KOVA ADLARI SORGUYA **DÜZ METİN** GİRİYOR (`${CASH_BUCKET}` değil):
     * `${}` ile verilseydi bağlı parametre olur, `GROUP BY` içinde tipi
     * belirsiz (`unknown`) kalıp Postgres'in sorguyu reddetmesine yol açardı.
     * Sabitler yalnız JS tarafındaki eşleştirme için duruyor.
     */
    const paymentBucket =
      sql<string>`COALESCE(${payments.bankAccountId}::text, CASE WHEN ${payments.method} = 'cash' THEN 'cash' ELSE 'unassigned' END)`.mapWith(
        String,
      );
    /*
     * Giderde `method` yok: hesap seçilmemişse nakit kasadan çıkmış sayılıyor.
     * Gider formu kaynağı açıkça sorduğu ve varsayılanı nakit olduğu için
     * boş hesap "bilinmiyor" değil, "kasadan" anlamına geliyor.
     */
    const expenseBucket =
      sql<string>`COALESCE(${expenses.bankAccountId}::text, 'cash')`.mapWith(
        String,
      );

    const { accounts, transactions, issues, incoming, outgoing, openings, unpaid } =
      await this.db.tx(async (tx) => {
        const [
          accounts,
          transactions,
          issues,
          incoming,
          outgoing,
          [unpaidRow],
        ] = await Promise.all([
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

          /*
           * Giren para: yalnız `completed` tahsilatlar, iade edilen kısım
           * düşülmüş. `initiated`/`failed` kayıtları saymak kasayı hiç
           * gerçekleşmemiş parayla şişirirdi.
           */
          tx
            .select({
              bucket: paymentBucket,
              totalKurus: sumKurus(
                sql`${payments.amountKurus} - ${payments.refundedKurus}`,
              ),
            })
            .from(payments)
            .where(eq(payments.status, "completed"))
            .groupBy(paymentBucket),

          /*
           * Çıkan para: **ödenmiş** giderler. Onay bekleyen ya da reddedilen
           * gider kasadan çıkmadı; bakiyeye yazmak yanlış olurdu.
           */
          tx
            .select({
              bucket: expenseBucket,
              totalKurus: sumKurus(sql`${expenses.amountKurus}`),
            })
            .from(expenses)
            .where(
              and(
                isNull(expenses.deletedAt),
                /*
                 * ÖLÇÜT `paid_at`, `status` DEĞİL.
                 *
                 * İki alan birbirinden bağımsız doldurulabiliyor: gider formu
                 * "Ödendi" kutusundan `paid_at`'i, durum seçiminden `status`'ü
                 * yazıyor. İkisini birlikte şart koşmak, "durumu ödendi ama
                 * kutusu işaretsiz" kayıtları hem çıkan hem de ödenmemiş
                 * havuzunun dışında bırakıyordu — para sessizce kayboluyordu.
                 * Paranın çıktığının tek güvenilir işareti `paid_at`.
                 */
                isNotNull(expenses.paidAt),
                ne(expenses.status, "rejected"),
              ),
            )
            .groupBy(expenseBucket),

          // Ödenmemiş yük: yukarıdakinin tümleyeni, taslak ve reddedilen hariç.
          tx
            .select({ totalKurus: sumKurus(sql`${expenses.amountKurus}`) })
            .from(expenses)
            .where(
              and(
                isNull(expenses.deletedAt),
                isNull(expenses.paidAt),
                inArray(expenses.status, [
                  "approved",
                  "pending_approval",
                  "paid",
                ]),
              ),
            ),
        ]);
        // Açılış fişindeki kasa/banka bakiyeleri (sisteme geçiş öncesi para).
        const openings = await tx
          .select({ account: openingEntries.account, bankAccountId: openingEntries.bankAccountId, amount: openingEntries.amountKurus })
          .from(openingEntries)
          .where(inArray(openingEntries.account, ["cash", "bank"]));
        return {
          accounts,
          transactions,
          issues,
          incoming,
          outgoing,
          openings,
          unpaid: unpaidRow?.totalKurus ?? 0,
        };
      });

    // Durumlar: unmatched | suggested (öneri, onay bekliyor) | auto | manual | ignored.
    // `matched` hiç yazılmayan bir değerdi; eşleşme oranı hep %0, bekleyen sayısı
    // da tüm hareketler çıkıyordu.
    const matched = transactions.filter((t) => t.matchStatus === "auto" || t.matchStatus === "manual");

    const incomingByBucket = new Map(
      incoming.map((row) => [row.bucket, row.totalKurus]),
    );
    const outgoingByBucket = new Map(
      outgoing.map((row) => [row.bucket, row.totalKurus]),
    );

    const openingOf = (bankAccountId: string | null) =>
      openings
        .filter((o) => (bankAccountId ? o.account === "bank" && o.bankAccountId === bankAccountId : o.account === "cash"))
        .reduce((s, o) => s + o.amount, 0);
    const cashboxRows: CashboxRow[] = accounts.map((a) => {
      const incomingMinor = incomingByBucket.get(a.id) ?? 0;
      const outgoingMinor = outgoingByBucket.get(a.id) ?? 0;
      const openingMinor = openingOf(a.id);
      return {
        source: "bank",
        accountId: a.id,
        bankName: a.bankName,
        accountName: a.accountName,
        ibanMasked: a.ibanMasked,
        isActive: a.isActive,
        openingMinor,
        incomingMinor,
        outgoingMinor,
        balanceMinor: openingMinor + incomingMinor - outgoingMinor,
        /*
         * Sağlayıcı bağlı değilse senkron bakiyesi sabit sıfır; onu ekranda
         * "bakiye" diye göstermek tam olarak şikâyet edilen yanılgı.
         */
        syncedBalanceMinor: a.provider ? a.balanceKurus : null,
      };
    });

    /*
     * Silinmiş hesaba bağlı kayıtlar: hesap listede yok ama para gerçekten
     * hareket etti. Kovası düşürülse toplamlar eksik kalırdı; hesabı
     * belirtilmemiş havuza katlanıyor.
     */
    const knownAccountIds = new Set(accounts.map((a) => a.id));
    const orphanTotal = (byBucket: Map<string, number>) => {
      let total = byBucket.get(UNASSIGNED_BUCKET) ?? 0;
      for (const [bucket, value] of byBucket) {
        if (
          bucket !== CASH_BUCKET &&
          bucket !== UNASSIGNED_BUCKET &&
          !knownAccountIds.has(bucket)
        )
          total += value;
      }
      return total;
    };

    const cashIn = incomingByBucket.get(CASH_BUCKET) ?? 0;
    const cashOut = outgoingByBucket.get(CASH_BUCKET) ?? 0;
    // Nakit satırı hareket olmasa da duruyor: kasa gerçek bir yer ve
    // "nakit tahsilat nereye yazıldı" sorusu ekranda cevaplanmalı.
    cashboxRows.push({
      source: "cash",
      accountId: null,
      bankName: null,
      accountName: null,
      ibanMasked: null,
      isActive: true,
      openingMinor: openingOf(null),
      incomingMinor: cashIn,
      outgoingMinor: cashOut,
      balanceMinor: openingOf(null) + cashIn - cashOut,
      syncedBalanceMinor: null,
    });

    const unassignedIn = orphanTotal(incomingByBucket);
    const unassignedOut = orphanTotal(outgoingByBucket);
    // Bu satır yalnız gerçekten kayıt varsa çıkıyor: sürekli duran boş bir
    // "atanmamış" satırı, düzeltilecek bir şey varmış izlenimi verirdi.
    if (unassignedIn !== 0 || unassignedOut !== 0)
      cashboxRows.push({
        source: "unassigned",
        accountId: null,
        bankName: null,
        accountName: null,
        ibanMasked: null,
        isActive: true,
        openingMinor: 0,
        incomingMinor: unassignedIn,
        outgoingMinor: unassignedOut,
        balanceMinor: unassignedIn - unassignedOut,
        syncedBalanceMinor: null,
      });

    const cashboxTotals = cashboxRows.reduce(
      (acc, row) => ({
        openingMinor: acc.openingMinor + row.openingMinor,
        incomingMinor: acc.incomingMinor + row.incomingMinor,
        outgoingMinor: acc.outgoingMinor + row.outgoingMinor,
      }),
      { openingMinor: 0, incomingMinor: 0, outgoingMinor: 0 },
    );

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
      cashbox: {
        rows: cashboxRows,
        totals: {
          ...cashboxTotals,
          balanceMinor:
            cashboxTotals.openingMinor + cashboxTotals.incomingMinor - cashboxTotals.outgoingMinor,
          unpaidExpenseMinor: unpaid,
        },
      },
      totals: {
        balanceMinor: accounts.reduce((s, a) => s + a.balanceKurus, 0),
        unmatched: transactions.filter(
          (t) => t.matchStatus === "unmatched" || t.matchStatus === "suggested",
        ).length,
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

        // Paket sınırı her yeni daire için: aşan göç bütünüyle geri alınır.
        await assertUnitQuota(tx, ctx.tenantId, 1);
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
