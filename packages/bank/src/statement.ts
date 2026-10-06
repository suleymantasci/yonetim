import { createHash } from "node:crypto";

import { foldTurkish } from "@yonetim/core";

import type { BankTransactionDto } from "./providers";

/**
 * Banka ekstresi (CSV) ayrıştırıcı — manuel ekstre yükleme.
 *
 * Türkiye'deki bankalar ortak bir format yayınlamıyor; ortak payda: başlık
 * satırı, `;` / `,` / sekme ayracı, `GG.AA.YYYY` tarih, `1.234,56` tutar.
 * Başlıklar **adlarına göre** bulunuyor (sıra değil), tutar iki biçimden
 * birinde olabilir: tek işaretli sütun (`Tutar`, eksi = çıkan) ya da ayrı
 * `Borç`/`Alacak` sütunları.
 *
 * Satır hatası tüm dosyayı düşürmüyor: hatalı satır `errors`'a gidiyor,
 * geri kalanı içe aktarılıyor — 300 satırlık ekstrenin tamamını bir bozuk
 * satır yüzünden reddetmek kullanıcıyı elle düzeltmeye iter.
 *
 * `externalId`: bankanın referans/dekont numarası varsa o; yoksa
 * (tarih, tutar, açıklama, aynı kombinasyonun sıra numarası) özeti. Aynı
 * ekstre iki kez yüklenince `(account_id, external_id)` benzersizliği
 * satırları çoğaltmıyor; aynı gün aynı tutarlı **iki gerçek** hareket de
 * sıra numarası sayesinde ayrı kalıyor.
 */

export interface ParsedStatement {
  rows: BankTransactionDto[];
  errors: Array<{ line: number; reason: StatementErrorReason }>;
}

export type StatementErrorReason = "bad_date" | "bad_amount" | "missing_columns";

const HEADER_ALIASES = {
  date: ["tarih", "islem tarihi", "date", "valor"],
  description: ["aciklama", "islem aciklamasi", "description", "detay"],
  amount: ["tutar", "islem tutari", "amount"],
  debit: ["borc", "cikan", "debit"],
  credit: ["alacak", "giren", "credit"],
  counterparty: ["karsi taraf", "gonderen", "alici", "unvan", "counterparty", "ad soyad"],
  iban: ["iban", "karsi iban", "gonderen iban"],
  reference: ["referans", "dekont no", "islem no", "reference", "dekont"],
  balance: ["bakiye", "balance"],
} as const;

type Field = keyof typeof HEADER_ALIASES;

export function parseStatementCsv(text: string): ParsedStatement {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { rows: [], errors: [{ line: 1, reason: "missing_columns" }] };

  const delimiter = detectDelimiter(lines[0]!);
  const header = splitLine(lines[0]!, delimiter).map((h) => foldTurkish(h).trim());
  const index = {} as Record<Field, number>;
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    index[field] = header.findIndex((h) => (HEADER_ALIASES[field] as readonly string[]).includes(h));
  }

  const hasAmount = index.amount >= 0 || (index.debit >= 0 && index.credit >= 0);
  if (index.date < 0 || !hasAmount) {
    return { rows: [], errors: [{ line: 1, reason: "missing_columns" }] };
  }

  const rows: BankTransactionDto[] = [];
  const errors: ParsedStatement["errors"] = [];
  const seen = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!, delimiter);
    const at = parseDate(cells[index.date] ?? "");
    if (!at) {
      errors.push({ line: i + 1, reason: "bad_date" });
      continue;
    }

    let signed: number | null;
    if (index.amount >= 0) {
      signed = parseAmount(cells[index.amount] ?? "");
    } else {
      const credit = parseAmount(cells[index.credit] ?? "") ?? 0;
      const debit = parseAmount(cells[index.debit] ?? "") ?? 0;
      signed = credit > 0 ? credit : debit > 0 ? -debit : null;
    }
    if (signed === null || signed === 0) {
      errors.push({ line: i + 1, reason: "bad_amount" });
      continue;
    }

    const description = clean(cells[index.description]);
    const reference = clean(cells[index.reference]);
    const key = `${at.toISOString()}|${signed}|${description ?? ""}`;
    const ordinal = (seen.get(key) ?? 0) + 1;
    seen.set(key, ordinal);

    const balance = index.balance >= 0 ? parseAmount(cells[index.balance] ?? "") : null;
    rows.push({
      externalId:
        reference ?? `csv-${createHash("sha256").update(`${key}|${ordinal}`).digest("hex").slice(0, 32)}`,
      direction: signed > 0 ? "in" : "out",
      amountKurus: Math.abs(signed),
      ...(balance !== null ? { balanceAfterKurus: balance } : {}),
      counterparty: clean(cells[index.counterparty]),
      counterpartyIban: clean(cells[index.iban]),
      description,
      transactionAt: at,
      provider: "manual_csv",
      raw: { line: i + 1 },
    });
  }

  return { rows, errors };
}

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

function detectDelimiter(headerLine: string): string {
  const counts = [";", "\t", ","].map((d) => [d, headerLine.split(d).length - 1] as const);
  return counts.sort((a, b) => b[1] - a[1])[0]![0];
}

/** Tırnaklı alanları (`"a;b"`) bölmeden tutan basit ayırıcı. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out;
}

/** `GG.AA.YYYY[ SS:DD]`, `GG/AA/YYYY`, `YYYY-AA-GG` → UTC `Date`; geçersizse null. */
export function parseDate(raw: string): Date | null {
  const v = raw.trim();
  let y: number, m: number, d: number, rest = "";
  let match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(.*)$/.exec(v);
  if (match) {
    d = Number(match[1]); m = Number(match[2]); y = Number(match[3]); rest = match[4] ?? "";
  } else if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/.exec(v))) {
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3]); rest = match[4] ?? "";
  } else return null;

  const time = /(\d{1,2}):(\d{2})/.exec(rest);
  const hh = time ? Number(time[1]) : 12; // saat yoksa öğlen: gün kayması (UTC/TR) tarihi bozmasın
  const mm = time ? Number(time[2]) : 0;
  const date = new Date(Date.UTC(y, m - 1, d, hh, mm));
  // 31.02 gibi taşan tarihleri reddet.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/**
 * `1.234,56` / `-1.234,56` / `1234.56` / `1,234.56` → işaretli kuruş.
 * Ondalık ayracı **son** ayraçtan çıkarılıyor: `1.234` (üç hane) binlik, `12,5`
 * ondalık; belirsizlikte (`1.234` / `1,234`) Türkçe kuralı: nokta binliktir.
 */
export function parseAmount(raw: string): number | null {
  let v = raw.replace(/[^\d,.\-+]/g, "");
  if (!v || !/\d/.test(v)) return null;
  let negative = false;
  if (v.startsWith("-")) negative = true;
  v = v.replace(/[+-]/g, "");

  const lastComma = v.lastIndexOf(",");
  const lastDot = v.lastIndexOf(".");
  let decimalSep: "," | "." | null = null;
  if (lastComma >= 0 && lastDot >= 0) decimalSep = lastComma > lastDot ? "," : ".";
  else if (lastComma >= 0) decimalSep = v.length - lastComma - 1 === 3 && v.split(",").length > 1 && lastComma === v.indexOf(",") ? null : ",";
  else if (lastDot >= 0) decimalSep = v.length - lastDot - 1 <= 2 ? "." : null;

  let integer = v;
  let fraction = "";
  if (decimalSep) {
    const at = v.lastIndexOf(decimalSep);
    integer = v.slice(0, at);
    fraction = v.slice(at + 1);
  }
  integer = integer.replace(/[.,]/g, "");
  if (!/^\d+$/.test(integer || "0") || !/^\d*$/.test(fraction)) return null;
  const kurus = Number(integer || "0") * 100 + Number((fraction + "00").slice(0, 2));
  return negative ? -kurus : kurus;
}
