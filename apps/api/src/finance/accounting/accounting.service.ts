import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import {
  BA_BS_THRESHOLD_MINOR,
  type BaBsResponse,
  type JournalResponse,
  type MizanResponse,
} from "@yonetim/contracts";

import { DbService } from "../../infra/db/db.service";
import { loadJournal, parentOf } from "./journal";

/**
 * Muhasebe raporları — mizan, yevmiye, BA/BS.
 *
 * Mizan ve yevmiye `journal.ts`'teki **tek** fiş üreticisinden türüyor (hesap
 * eşlemesi orada). BA/BS doğrudan giderlerden ve tahakkuklardan; personel
 * ödemeleri BA'ya girmiyor (mal/hizmet alımı değil).
 */
@Injectable()
export class AccountingService {
  constructor(private readonly db: DbService) {}

  /**
   * Mizan: devir (dönem başından önceki her şey) + dönem hareketleri +
   * bakiye. Yevmiyeyle aynı fiş listesinden türüyor; alt hesaplar (102.xx,
   * 770.xx) üst hesapta toplanıyor.
   */
  async mizan(from: string, to: string): Promise<MizanResponse> {
    const start = istanbulStart(from);
    const end = istanbulEnd(to);
    return this.db.tx(async (tx) => {
      const { entries, accounts } = await loadJournal(tx, end);
      const acc = new Map<string, { opening: number; debit: number; credit: number }>();
      const bucket = (code: string) => {
        let row = acc.get(code);
        if (!row) acc.set(code, (row = { opening: 0, debit: 0, credit: 0 }));
        return row;
      };
      for (const entry of entries) {
        const before = entry.date.getTime() < start.getTime();
        for (const line of entry.lines) {
          for (const code of [line.code, parentOf(line.code)].filter(Boolean) as string[]) {
            const row = bucket(code);
            if (before) row.opening += line.debit - line.credit;
            else {
              row.debit += line.debit;
              row.credit += line.credit;
            }
          }
        }
      }

      const rows = [...acc.entries()]
        .filter(([, v]) => v.opening !== 0 || v.debit !== 0 || v.credit !== 0)
        .sort(([a], [b]) => a.localeCompare(b, "tr", { numeric: true }))
        .map(([code, v]) => ({
          code,
          name: accounts.get(code) ?? code,
          sub: parentOf(code) !== null,
          openingMinor: v.opening,
          debitMinor: v.debit,
          creditMinor: v.credit,
          balanceMinor: v.opening + v.debit - v.credit,
        }));

      const main = rows.filter((r) => !r.sub);
      return {
        from,
        to,
        rows,
        totals: {
          debitMinor: main.reduce((s, r) => s + r.debitMinor, 0),
          creditMinor: main.reduce((s, r) => s + r.creditMinor, 0),
          openingDebitMinor: main.reduce((s, r) => s + Math.max(r.openingMinor, 0), 0),
          openingCreditMinor: main.reduce((s, r) => s + Math.max(-r.openingMinor, 0), 0),
        },
      };
    });
  }

  /** Yevmiye defteri — aralıktaki fişler, tarih sırasıyla numaralı. */
  async journal(from: string, to: string, limit = 1500): Promise<JournalResponse> {
    const start = istanbulStart(from);
    const end = istanbulEnd(to);
    return this.db.tx(async (tx) => {
      const { entries, accounts } = await loadJournal(tx, end);
      const inRange = entries.filter((e) => e.date.getTime() >= start.getTime());
      let debit = 0;
      let credit = 0;
      for (const e of inRange)
        for (const l of e.lines) {
          debit += l.debit;
          credit += l.credit;
        }
      return {
        from,
        to,
        total: inRange.length,
        limit,
        totals: { debitMinor: debit, creditMinor: credit },
        entries: inRange.slice(0, limit).map((e, i) => ({
          no: i + 1,
          date: istanbulDate(e.date),
          source: e.source,
          sourceId: e.sourceId,
          description: e.description,
          lines: e.lines.map((l) => ({
            code: l.code,
            name: accounts.get(l.code) ?? l.code,
            debitMinor: l.debit,
            creditMinor: l.credit,
          })),
        })),
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
        WHERE e.deleted_at IS NULL AND e.staff_id IS NULL AND e.status IN ('approved', 'paid') AND e.period = ${period}
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

/** "2026-03-01" → o günün İstanbul saatiyle başı / sonu. */
export function istanbulStart(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}
export function istanbulEnd(day: string): Date {
  return new Date(`${day}T23:59:59.999+03:00`);
}
export function istanbulDate(at: Date): string {
  return new Date(at.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}
