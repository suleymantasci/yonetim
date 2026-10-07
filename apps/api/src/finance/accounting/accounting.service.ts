import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import {
  BA_BS_THRESHOLD_MINOR,
  type BaBsResponse,
  type MizanResponse,
} from "@yonetim/contracts";

import { DbService } from "../../infra/db/db.service";

/**
 * Sentetik mizan ve BA/BS — bkz. `accounting.contract.ts`.
 *
 * Hesap eşlemesi (Tek Düzen Hesap Planı):
 *  - Borç tahakkuku: 120 Alıcılar (B) / 600 Aidat · 649 Gecikme · 602 Diğer (A)
 *  - Tahsilat:       100 Kasa | 102 Bankalar (B) / 120 (A)
 *  - Gider:          770.xx Genel yönetim gideri (B) / 320 Satıcılar (A)
 *  - Gider ödemesi:  320 (B) / 100 | 102 (A)
 *  - Silinen alacak: 659 Diğer olağan gider (B) / 120 (A)
 * Mahsup/kredi bakiyesiyle kapatılan tahsilatlar (`offset`, `credit_balance`)
 * nakit hareketi değil, dışarıda bırakılıyor. Tutarlar KDV dahil: site
 * yönetimi KDV mükellefi değil, KDV gider maliyetinin parçası.
 */
@Injectable()
export class AccountingService {
  constructor(private readonly db: DbService) {}

  async mizan(from: string, to: string): Promise<MizanResponse> {
    const start = `${from}T00:00:00+03:00`;
    const end = `${to}T23:59:59.999+03:00`;
    return this.db.tx(async (tx) => {
      const debtRows = (await tx.execute(sql`
        SELECT kind::text AS kind, coalesce(sum(amount_kurus), 0)::bigint AS total
        FROM debts
        WHERE deleted_at IS NULL AND status <> 'cancelled'
          AND created_at BETWEEN ${start}::timestamptz AND ${end}::timestamptz
        GROUP BY 1
      `)) as unknown as Array<{ kind: string; total: string }>;

      const writtenOff = (await tx.execute(sql`
        SELECT coalesce(sum(amount_kurus - paid_kurus), 0)::bigint AS total
        FROM debts
        WHERE deleted_at IS NULL AND status = 'written_off'
          AND updated_at BETWEEN ${start}::timestamptz AND ${end}::timestamptz
      `)) as unknown as Array<{ total: string }>;

      const paymentRows = (await tx.execute(sql`
        SELECT CASE WHEN method = 'cash' THEN 'cash' ELSE 'bank' END AS account,
               coalesce(sum(amount_kurus), 0)::bigint AS total
        FROM payments
        WHERE status = 'completed' AND method NOT IN ('offset', 'credit_balance')
          AND coalesce(paid_at, created_at) BETWEEN ${start}::timestamptz AND ${end}::timestamptz
        GROUP BY 1
      `)) as unknown as Array<{ account: string; total: string }>;

      const expenseRows = (await tx.execute(sql`
        SELECT coalesce(c.name, 'Kategorisiz') AS category, coalesce(sum(e.amount_kurus), 0)::bigint AS total
        FROM expenses e
        LEFT JOIN expense_categories c ON c.id = e.category_id
        WHERE e.deleted_at IS NULL AND e.status IN ('approved', 'paid')
          AND e.expense_date BETWEEN ${start}::timestamptz AND ${end}::timestamptz
        GROUP BY 1
        ORDER BY 1
      `)) as unknown as Array<{ category: string; total: string }>;

      const expensePaid = (await tx.execute(sql`
        SELECT CASE WHEN bank_account_id IS NULL THEN 'cash' ELSE 'bank' END AS account,
               coalesce(sum(amount_kurus), 0)::bigint AS total
        FROM expenses
        WHERE deleted_at IS NULL AND status IN ('approved', 'paid') AND paid_at IS NOT NULL
          AND paid_at BETWEEN ${start}::timestamptz AND ${end}::timestamptz
        GROUP BY 1
      `)) as unknown as Array<{ account: string; total: string }>;

      const n = (v: string | number | undefined) => Number(v ?? 0);
      const accrued = (kinds: string[]) =>
        debtRows.filter((r) => kinds.includes(r.kind)).reduce((s, r) => s + n(r.total), 0);
      const dues = accrued(["dues"]);
      const lateFee = accrued(["late_fee"]);
      const accruedTotal = debtRows.reduce((s, r) => s + n(r.total), 0);
      const other = accruedTotal - dues - lateFee;
      const off = n(writtenOff[0]?.total);
      const cashIn = n(paymentRows.find((r) => r.account === "cash")?.total);
      const bankIn = n(paymentRows.find((r) => r.account === "bank")?.total);
      const cashOut = n(expensePaid.find((r) => r.account === "cash")?.total);
      const bankOut = n(expensePaid.find((r) => r.account === "bank")?.total);
      const expenseTotal = expenseRows.reduce((s, r) => s + n(r.total), 0);

      type Row = MizanResponse["rows"][number];
      const row = (code: string, name: string, debit: number, credit: number, sub = false): Row => ({
        code,
        name,
        sub,
        debitMinor: debit,
        creditMinor: credit,
        balanceMinor: debit - credit,
      });

      const rows: Row[] = [
        row("100", "Kasa", cashIn, cashOut),
        row("102", "Bankalar", bankIn, bankOut),
        row("120", "Alıcılar (kat malikleri / sakinler)", accruedTotal, cashIn + bankIn + off),
        row("320", "Satıcılar (tedarikçiler / ödenecek giderler)", cashOut + bankOut, expenseTotal),
        row("600", "Aidat gelirleri", 0, dues),
        row("602", "Diğer gelirler", 0, other),
        row("649", "Gecikme tazminatı gelirleri", 0, lateFee),
        row("659", "Silinen alacaklar", off, 0),
        row("770", "Genel yönetim giderleri", expenseTotal, 0),
        ...expenseRows.map((r, i) =>
          row(`770.${String(i + 1).padStart(2, "0")}`, r.category, n(r.total), 0, true),
        ),
      ].filter((r) => r.debitMinor !== 0 || r.creditMinor !== 0);

      const main = rows.filter((r) => !r.sub);
      return {
        from,
        to,
        rows,
        totals: {
          debitMinor: main.reduce((s, r) => s + r.debitMinor, 0),
          creditMinor: main.reduce((s, r) => s + r.creditMinor, 0),
        },
      };
    });
  }

  /**
   * BA/BS — aylık, karşı taraf başına KDV hariç toplam eşiği geçenler.
   *
   * BA: tedarikçiye göre (kart yoksa yazılan ada göre) onaylı giderler.
   * BS: daireye yazılan tahakkuklar, borçlu kişi başına. Site yönetimleri
   * çoğunlukla BS vermekle yükümlü değil; liste mali müşavirin kararı için.
   */
  async baBs(period: string): Promise<BaBsResponse> {
    const threshold = BA_BS_THRESHOLD_MINOR;
    return this.db.tx(async (tx) => {
      const ba = (await tx.execute(sql`
        SELECT e.vendor_id AS id,
               coalesce(v.name, nullif(trim(e.vendor_name), ''), 'Tedarikçi adı yok') AS name,
               v.tax_number AS tax_number,
               count(*)::int AS documents,
               coalesce(sum(e.amount_kurus - e.vat_kurus), 0)::bigint AS net
        FROM expenses e
        LEFT JOIN vendors v ON v.id = e.vendor_id
        WHERE e.deleted_at IS NULL AND e.status IN ('approved', 'paid') AND e.period = ${period}
        GROUP BY 1, 2, 3
        HAVING coalesce(sum(e.amount_kurus - e.vat_kurus), 0) >= ${threshold}
        ORDER BY 5 DESC
      `)) as unknown as Array<{ id: string | null; name: string; tax_number: string | null; documents: number; net: string }>;

      const bs = (await tx.execute(sql`
        SELECT d.debtor_user_id AS id,
               coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Borçlu belirtilmemiş') AS name,
               count(*)::int AS documents,
               coalesce(sum(d.amount_kurus), 0)::bigint AS net
        FROM debts d
        LEFT JOIN users u ON u.id = d.debtor_user_id
        WHERE d.deleted_at IS NULL AND d.status <> 'cancelled'
          AND to_char(d.created_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM') = ${period}
        GROUP BY 1, 2
        HAVING coalesce(sum(d.amount_kurus), 0) >= ${threshold}
        ORDER BY 4 DESC
      `)) as unknown as Array<{ id: string | null; name: string; documents: number; net: string }>;

      return {
        period,
        thresholdMinor: threshold,
        ba: ba.map((r) => ({
          counterpartyId: r.id,
          name: r.name,
          taxNumber: r.tax_number,
          documentCount: Number(r.documents),
          netMinor: Number(r.net),
        })),
        bs: bs.map((r) => ({
          counterpartyId: r.id,
          name: r.name,
          taxNumber: null,
          documentCount: Number(r.documents),
          netMinor: Number(r.net),
        })),
        missingTaxNumbers: ba.filter((r) => !r.tax_number).length,
      };
    });
  }
}
