import type { Cell } from "@yonetim/bank";

/**
 * Okuma firması dosyasını çözer — saf. Başlık satırı ilk 15 satırda aranır;
 * sütunlar adlarından tanınır (firmalar farklı yazıyor):
 *   seri no: "sayaç no", "sayac no", "seri", "abone no", "cihaz no"
 *   tutar:   "tutar", "toplam", "ödenecek", "bedel"
 *   tüketim: "tüketim", "m3", "kwh", "birim"
 */
export interface VendorRow {
  line: number;
  serialNo: string;
  consumption: string | null;
  amountMinor: number;
}

const norm = (v: Cell) =>
  String(v ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .replace(/\s+/g, " ")
    .trim();

const SERIAL = [/sayac ?no/, /seri/, /abone ?no/, /cihaz ?no/, /sayac$/];
const AMOUNT = [/odenecek/, /toplam/, /tutar/, /bedel/];
const CONSUMPTION = [/tuketim/, /\bm3\b|m³/, /kwh/];

function findCol(header: string[], patterns: RegExp[]): number {
  for (const p of patterns) {
    const i = header.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

/** "1.234,56" / "1234.56" / 1234.56 → kuruş. */
export function moneyToMinor(v: Cell): number {
  if (typeof v === "number") return Math.round(v * 100);
  const s = String(v ?? "").replace(/[₺\s]|TL/gi, "");
  if (!s) return 0;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function parseVendorFile(rows: Cell[][]): { rows: VendorRow[]; missing: ("serial" | "amount")[] } {
  for (let h = 0; h < Math.min(rows.length, 15); h++) {
    const header = (rows[h] ?? []).map(norm);
    const serial = findCol(header, SERIAL);
    const amount = findCol(header, AMOUNT);
    if (serial < 0 || amount < 0) continue;
    const consumption = findCol(header, CONSUMPTION);
    const out: VendorRow[] = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const serialNo = String(r[serial] ?? "").trim();
      if (!serialNo) continue;
      out.push({
        line: i + 1,
        serialNo,
        consumption: consumption >= 0 && r[consumption] !== null && r[consumption] !== "" ? String(r[consumption]).trim() : null,
        amountMinor: moneyToMinor(r[amount] ?? null),
      });
    }
    return { rows: out, missing: [] };
  }
  const all = rows.slice(0, 15).flatMap((r) => r.map(norm));
  return {
    rows: [],
    missing: [
      ...(findCol(all, SERIAL) < 0 ? (["serial"] as const) : []),
      ...(findCol(all, AMOUNT) < 0 ? (["amount"] as const) : []),
    ],
  };
}

/** Seri no karşılaştırması: boşluk/tire yok, büyük harf. */
export const serialKey = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();
