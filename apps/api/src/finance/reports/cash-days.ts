import { isCashCode, type Journal } from "../accounting/journal";

/** Fişin İstanbul günü (YYYY-MM-DD). */
export function istanbulDay(d: Date): string {
  return new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

export interface CashDay {
  day: string;
  inMinor: number;
  outMinor: number;
  closingMinor: number;
}

/**
 * Kasa/banka günlükleri — yevmiye fişlerinin kasa kodlu (100, 102.xx)
 * satırlarından: devir (başlangıç öncesi), gün gün giren/çıkan/kalan.
 * Kasalar arası virman tek hesaba bakılırken giriş/çıkış, tüm kasalara
 * bakılırken (`account` yok) net sıfırdır — iki satır da kasa kodlu.
 *
 * Saf: test girdisi doğrudan fiş listesi.
 */
export function cashDays(
  journal: Pick<Journal, "entries">,
  fromDay: string,
  toDay: string,
  account?: string,
): { openingMinor: number; days: CashDay[] } {
  const match = (code: string) => (account ? code === account : isCashCode(code));
  let opening = 0;
  const byDay = new Map<string, { in: number; out: number }>();
  for (const e of journal.entries) {
    const day = istanbulDay(e.date);
    if (day > toDay) continue;
    let dIn = 0;
    let dOut = 0;
    for (const l of e.lines) {
      if (!match(l.code)) continue;
      dIn += l.debit;
      dOut += l.credit;
    }
    // Aynı fişte hem giren hem çıkan kasa satırı (tüm kasalar + virman) → net.
    if (!account && dIn > 0 && dOut > 0) {
      const net = dIn - dOut;
      dIn = Math.max(0, net);
      dOut = Math.max(0, -net);
    }
    if (dIn === 0 && dOut === 0) continue;
    if (day < fromDay) {
      opening += dIn - dOut;
      continue;
    }
    const cur = byDay.get(day) ?? { in: 0, out: 0 };
    cur.in += dIn;
    cur.out += dOut;
    byDay.set(day, cur);
  }
  const days: CashDay[] = [];
  let running = opening;
  for (let d = new Date(`${fromDay}T00:00:00Z`); d.toISOString().slice(0, 10) <= toDay; d = new Date(d.getTime() + 86_400_000)) {
    const key = d.toISOString().slice(0, 10);
    const v = byDay.get(key) ?? { in: 0, out: 0 };
    running += v.in - v.out;
    days.push({ day: key, inMinor: v.in, outMinor: v.out, closingMinor: running });
  }
  return { openingMinor: opening, days };
}
