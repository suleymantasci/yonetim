import { isCashCode, parentOf, type Journal, type JournalEntry } from "./journal";

/**
 * Mali tablolar — `loadJournal`'ın ürettiği fiş listesinden saf hesaplar.
 *
 * Veritabanına dokunmuyor; böylece aynı fiş listesiyle birim testinde
 * doğrulanabiliyor. Hesap sınıfları Tek Düzen Hesap Planı'nın ilk hanesine
 * göre: 1 dönen varlık, 3 kısa vadeli borç, 5 özkaynak, 6 gelir, 7 gider.
 * 659 (silinen alacaklar) 6 ile başlasa da gider niteliğinde.
 */

const ISTANBUL_OFFSET_MS = 3 * 3_600_000;

/** Fişin İstanbul saatine göre ayı: `YYYY-MM`. */
export function monthOf(at: Date): string {
  return new Date(at.getTime() + ISTANBUL_OFFSET_MS).toISOString().slice(0, 7);
}

/** `from`..`to` (YYYY-MM-DD) aralığındaki aylar, en çok `max` adet (sondan kırpılır). */
export function monthsInRange(from: string, to: string, max = 24): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number) as [number, number];
  const end = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > end) break;
    out.push(key);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.slice(-max);
}

export function isIncomeCode(code: string): boolean {
  return code.startsWith("6") && !code.startsWith("659");
}
export function isExpenseCode(code: string): boolean {
  return code.startsWith("7") || code.startsWith("659");
}

const nameOf = (journal: Journal, code: string) => journal.accounts.get(code) ?? code;
const byCode = (a: string, b: string) => a.localeCompare(b, "tr", { numeric: true });
const inRange = (e: JournalEntry, start: Date, end: Date) =>
  e.date.getTime() >= start.getTime() && e.date.getTime() <= end.getTime();

/* ------------------------------ Gelir-gider ------------------------------ */

export interface StatementRow {
  code: string;
  name: string;
  byMonth: number[];
  totalMinor: number;
}

export function incomeStatement(journal: Journal, start: Date, end: Date, months: string[]) {
  const index = new Map(months.map((m, i) => [m, i]));
  const income = new Map<string, number[]>();
  const expense = new Map<string, number[]>();
  const add = (map: Map<string, number[]>, code: string, i: number, v: number) => {
    let row = map.get(code);
    if (!row) map.set(code, (row = months.map(() => 0)));
    row[i]! += v;
  };
  for (const e of journal.entries) {
    if (!inRange(e, start, end)) continue;
    const i = index.get(monthOf(e.date));
    if (i === undefined) continue;
    for (const l of e.lines) {
      if (isIncomeCode(l.code)) add(income, l.code, i, l.credit - l.debit);
      else if (isExpenseCode(l.code)) add(expense, l.code, i, l.debit - l.credit);
    }
  }
  const rows = (map: Map<string, number[]>): StatementRow[] =>
    [...map.entries()]
      .sort(([a], [b]) => byCode(a, b))
      .map(([code, byMonth]) => ({
        code,
        name: nameOf(journal, code),
        byMonth,
        totalMinor: byMonth.reduce((s, v) => s + v, 0),
      }))
      .filter((r) => r.byMonth.some((v) => v !== 0));
  const incomeRows = rows(income);
  const expenseRows = rows(expense);
  const sumBy = (list: StatementRow[]) => months.map((_, i) => list.reduce((s, r) => s + r.byMonth[i]!, 0));
  const incomeByMonth = sumBy(incomeRows);
  const expenseByMonth = sumBy(expenseRows);
  const incomeMinor = incomeByMonth.reduce((s, v) => s + v, 0);
  const expenseMinor = expenseByMonth.reduce((s, v) => s + v, 0);
  return {
    months,
    income: incomeRows,
    expense: expenseRows,
    totals: {
      incomeByMonth,
      expenseByMonth,
      netByMonth: months.map((_, i) => incomeByMonth[i]! - expenseByMonth[i]!),
      incomeMinor,
      expenseMinor,
      netMinor: incomeMinor - expenseMinor,
    },
  };
}

/* -------------------------------- Bilanço -------------------------------- */

export interface BalanceLine {
  code: string;
  name: string;
  amountMinor: number;
  sub: boolean;
}

/** Yaprak hesap bakiyeleri (borç pozitif) — `end` dahil. */
export function balancesAt(journal: Journal, end: Date, start?: Date): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of journal.entries) {
    if (e.date.getTime() > end.getTime()) continue;
    if (start && e.date.getTime() < start.getTime()) continue;
    for (const l of e.lines) out.set(l.code, (out.get(l.code) ?? 0) + l.debit - l.credit);
  }
  return out;
}

/**
 * Bilanço: aktif (1xx), pasif (3xx), özkaynak (5xx + geçmiş yıllar sonucu +
 * dönem sonucu). Sonuç hesapları kapanış kaydı yapılmış gibi özkaynağa
 * aktarılır; fişler denk olduğu için aktif = pasif + özkaynak.
 *
 * Alt hesaplar (102.xx) üst hesabın altında ayrı satır; toplam yalnız
 * üst hesaplardan.
 */
export function balanceSheet(journal: Journal, end: Date, yearStart: Date) {
  const all = balancesAt(journal, end);
  const before = balancesAt(journal, new Date(yearStart.getTime() - 1));
  const resultOf = (map: Map<string, number>) => {
    let r = 0;
    for (const [code, v] of map) if (isIncomeCode(code) || isExpenseCode(code)) r -= v;
    return r;
  };
  const totalResult = resultOf(all);
  const priorResult = resultOf(before);
  const periodResult = totalResult - priorResult;

  const section = (first: string, sign: 1 | -1): BalanceLine[] => {
    const parents = new Map<string, number>();
    const subs = new Map<string, number>();
    for (const [code, v] of all) {
      if (!code.startsWith(first)) continue;
      const parent = parentOf(code) ?? code;
      parents.set(parent, (parents.get(parent) ?? 0) + v * sign);
      if (parentOf(code)) subs.set(code, v * sign);
    }
    const lines: BalanceLine[] = [];
    for (const [code, amount] of [...parents.entries()].sort(([a], [b]) => byCode(a, b))) {
      const children = [...subs.entries()].filter(([c]) => parentOf(c) === code && c !== code);
      if (amount === 0 && children.every(([, v]) => v === 0)) continue;
      lines.push({ code, name: nameOf(journal, code), amountMinor: amount, sub: false });
      for (const [c, v] of children.sort(([a], [b]) => byCode(a, b)))
        if (v !== 0) lines.push({ code: c, name: nameOf(journal, c), amountMinor: v, sub: true });
    }
    return lines;
  };

  const assets = section("1", 1);
  const liabilities = section("3", -1);
  const equity = section("5", -1);
  if (priorResult !== 0)
    equity.push({ code: "570", name: "Geçmiş yıllar sonucu", amountMinor: priorResult, sub: false });
  equity.push({ code: "590", name: "Dönem sonucu (gelir − gider)", amountMinor: periodResult, sub: false });

  const total = (lines: BalanceLine[]) => lines.filter((l) => !l.sub).reduce((s, l) => s + l.amountMinor, 0);
  return {
    assets,
    liabilities,
    equity,
    totals: {
      assetsMinor: total(assets),
      liabilitiesMinor: total(liabilities),
      equityMinor: total(equity),
      periodResultMinor: periodResult,
    },
  };
}

/* --------------------------------- Kebir --------------------------------- */

const matches = (lineCode: string, code: string) => lineCode === code || parentOf(lineCode) === code;

export function ledger(journal: Journal, code: string, start: Date, end: Date, limit = 3000) {
  let opening = 0;
  const lines: {
    date: Date;
    source: string;
    sourceId: string | null;
    description: string;
    counter: string;
    debitMinor: number;
    creditMinor: number;
    balanceMinor: number;
  }[] = [];
  let balance = 0;
  let debit = 0;
  let credit = 0;
  let total = 0;
  for (const e of journal.entries) {
    if (e.date.getTime() > end.getTime()) continue;
    const own = e.lines.filter((l) => matches(l.code, code));
    if (own.length === 0) continue;
    const d = own.reduce((s, l) => s + l.debit, 0);
    const c = own.reduce((s, l) => s + l.credit, 0);
    if (e.date.getTime() < start.getTime()) {
      opening += d - c;
      continue;
    }
    if (total === 0) balance = opening;
    total += 1;
    balance += d - c;
    debit += d;
    credit += c;
    if (lines.length < limit) {
      const counter = [...new Set(e.lines.filter((l) => !matches(l.code, code)).map((l) => l.code))]
        .map((c2) => `${c2} ${nameOf(journal, c2)}`)
        .join(", ");
      lines.push({
        date: e.date,
        source: e.source,
        sourceId: e.sourceId,
        description: e.description,
        counter,
        debitMinor: d,
        creditMinor: c,
        balanceMinor: balance,
      });
    }
  }
  const accounts = new Set<string>();
  for (const e of journal.entries)
    for (const l of e.lines) {
      accounts.add(l.code);
      const p = parentOf(l.code);
      if (p) accounts.add(p);
    }
  return {
    code,
    name: nameOf(journal, code),
    openingMinor: opening,
    lines,
    totals: { debitMinor: debit, creditMinor: credit },
    closingMinor: opening + debit - credit,
    truncated: total > lines.length,
    accounts: [...accounts].sort(byCode).map((c) => ({ code: c, name: nameOf(journal, c) })),
  };
}

/* ---------------------------- İşletme defteri ---------------------------- */

/** Karşı hesaba göre defter başlığı. */
function headOf(journal: Journal, entry: JournalEntry, counterCodes: string[]): string {
  if (entry.source === "payment") return "Aidat ve borç tahsilatı";
  if (entry.source === "expense_payment" && counterCodes.includes("320")) return "Gider ödemesi";
  if (counterCodes.includes("335")) return "Personel maaş ödemesi";
  if (counterCodes.includes("196")) return "Personel avansı";
  return counterCodes.map((c) => nameOf(journal, c)).join(", ") || "—";
}

/**
 * İşletme defteri (KMK 35) — nakit esaslı gelir/gider kaydı: kasa ve
 * bankalara giren ve çıkan para, kronolojik ve kümülatif bakiyeli. Kasa ↔
 * banka virmanı iç harekettir, deftere girmez. Açılış fişi devir olarak
 * `openingMinor`'a yansır.
 */
export function operatingBook(journal: Journal, start: Date, end: Date, limit = 3000) {
  let opening = 0;
  let income = 0;
  let expense = 0;
  let balance = 0;
  let count = 0;
  const lines: {
    date: Date;
    description: string;
    account: string;
    head: string;
    incomeMinor: number;
    expenseMinor: number;
    balanceMinor: number;
  }[] = [];
  for (const e of journal.entries) {
    if (e.date.getTime() > end.getTime()) continue;
    const cash = e.lines.filter((l) => isCashCode(l.code));
    if (cash.length === 0) continue;
    const delta = cash.reduce((s, l) => s + l.debit - l.credit, 0);
    // Dönem içine düşen açılış fişi de devirdir (gelir değil).
    if (e.date.getTime() < start.getTime() || e.source === "opening") {
      opening += delta;
      if (count > 0) balance += delta;
      continue;
    }
    if (delta === 0) continue; // virman
    if (count === 0) balance = opening;
    count += 1;
    balance += delta;
    if (delta > 0) income += delta;
    else expense += -delta;
    if (lines.length < limit) {
      const counterCodes = [...new Set(e.lines.filter((l) => !isCashCode(l.code)).map((l) => l.code))];
      lines.push({
        date: e.date,
        description: e.description,
        account: [...new Set(cash.map((l) => nameOf(journal, l.code)))].join(", "),
        head: headOf(journal, e, counterCodes),
        incomeMinor: delta > 0 ? delta : 0,
        expenseMinor: delta < 0 ? -delta : 0,
        balanceMinor: balance,
      });
    }
  }
  return {
    openingMinor: opening,
    lines,
    totals: { incomeMinor: income, expenseMinor: expense },
    closingMinor: opening + income - expense,
    truncated: count > lines.length,
  };
}
