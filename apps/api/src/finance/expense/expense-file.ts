import type { Cell } from "@yonetim/bank";

import { moneyToMinor } from "../../operations/meter-vendor-file";

/**
 * Gider dosyası (Excel/CSV) çözücü — saf. Başlık satırı ilk 15 satırda;
 * sütunlar adlarından tanınır. Zorunlu: tarih, açıklama, tutar.
 */
export interface ExpenseFileRow {
  line: number;
  date: string | null;
  description: string;
  amountMinor: number;
  category: string | null;
  vendor: string | null;
  invoiceNo: string | null;
  paid: boolean | null;
}

const norm = (v: Cell) =>
  String(v ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .replace(/\s+/g, " ")
    .trim();

const COLS = {
  date: [/^tarih|fatura tarihi|islem tarihi|^date/],
  description: [/aciklama|^gider$|^gider adi|description/],
  amount: [/^tutar|toplam|bedel|^amount/],
  category: [/gider grubu|^grup|kategori|hesap adi/],
  vendor: [/firma|tedarikci|cari|satici|vendor/],
  invoiceNo: [/fatura no|belge no|evrak no|invoice/],
  paid: [/odendi|odeme durumu|^durum/],
} as const;

function find(header: string[], patterns: readonly RegExp[]): number {
  for (const p of patterns) {
    const i = header.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

/** Date | "dd.mm.yyyy" | "dd/mm/yyyy" | "yyyy-mm-dd" | Excel seri günü → YYYY-MM-DD. */
export function parseDay(v: Cell): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(v.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  }
  if (typeof v === "number" && v > 20_000 && v < 80_000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s);
  if (m) return valid(`${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? valid(`${m[1]}-${m[2]}-${m[3]}`) : null;
}
function valid(day: string): string | null {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day ? null : day;
}

function parsePaid(v: Cell): boolean | null {
  const s = norm(v);
  if (!s) return null;
  if (/^(evet|e|odendi|odenmis|yes|true|1|x)$/.test(s)) return true;
  if (/^(hayir|h|odenmedi|bekliyor|no|false|0)$/.test(s)) return false;
  return null;
}

export function parseExpenseFile(rows: Cell[][]): { rows: ExpenseFileRow[]; missing: ("date" | "description" | "amount")[] } {
  for (let h = 0; h < Math.min(rows.length, 15); h++) {
    const header = (rows[h] ?? []).map(norm);
    const idx = Object.fromEntries(Object.entries(COLS).map(([k, p]) => [k, find(header, p)])) as Record<keyof typeof COLS, number>;
    if (idx.date < 0 || idx.description < 0 || idx.amount < 0) continue;
    const cell = (r: Cell[], i: number) => (i >= 0 ? r[i] ?? null : null);
    const text = (r: Cell[], i: number) => {
      const v = String(cell(r, i) ?? "").trim();
      return v === "" ? null : v;
    };
    const out: ExpenseFileRow[] = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const description = text(r, idx.description);
      const amountMinor = moneyToMinor(cell(r, idx.amount));
      if (!description && amountMinor === 0) continue;
      out.push({
        line: i + 1,
        date: parseDay(cell(r, idx.date)),
        description: (description ?? "").slice(0, 240),
        amountMinor,
        category: text(r, idx.category),
        vendor: text(r, idx.vendor)?.slice(0, 160) ?? null,
        invoiceNo: text(r, idx.invoiceNo)?.slice(0, 60) ?? null,
        paid: idx.paid >= 0 ? parsePaid(cell(r, idx.paid)) : null,
      });
    }
    return { rows: out, missing: [] };
  }
  const all = rows.slice(0, 15).flatMap((r) => r.map(norm));
  return {
    rows: [],
    missing: (["date", "description", "amount"] as const).filter((k) => find(all, COLS[k]) < 0),
  };
}

export const nameKey = (s: string) => norm(s).replace(/[^a-z0-9]/g, "");
