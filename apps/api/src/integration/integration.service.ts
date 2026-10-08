import { Injectable } from "@nestjs/common";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import type {
  BankOverviewResponse,
  CashboxRow,
  MigrationListResponse,
} from "@yonetim/contracts";
import {
  openingEntries,
  bankAccounts,
  bankTransactions,
  expenses,
  migrationJobs,
  payments,
  reconciliationIssues,
  units,
} from "@yonetim/db";

import { DbService } from "../infra/db/db.service";

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
  constructor(private readonly db: DbService) {}

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
}

