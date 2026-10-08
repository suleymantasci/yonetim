import { createHash } from "node:crypto";

import { foldTurkish } from "@yonetim/core";

import type { BankTransactionDto } from "./providers";
import { parseAmount, parseDate } from "./statement";
import type { Cell } from "./table";

/**
 * Banka dökümü → hareket: başlık bulma, sütun tahmini, eşleştirmeyle okuma.
 *
 * Her bankanın dökümü farklı; ortak bir biçim yok. Bu yüzden sabit banka
 * şablonu yazmak yerine üç adım:
 *
 *   1. `findHeaderRow` — künye satırlarının (hesap sahibi, IBAN, dönem) altında
 *      başlık satırını bul. Ölçülen gerçek dosyalarda başlık 5. (Ziraat kısa),
 *      7. (Vakıfbank), 10. (Akbank), 12. (Ziraat), 14. (Garanti), 16. (İş) ve
 *      ~23. (Halkbank) satırda.
 *   2. `guessMapping` — başlık adından sütunun anlamını tahmin et. Kullanıcı
 *      önizlemede yanlışı düzeltir; düzeltme hesap başına saklanır
 *      (`profileFromMapping` / `mappingFromProfile`).
 *   3. `applyMapping` — satırları harekete çevir; tarih/tutarı okunamayan
 *      **veri** satırı hata, boş/toplam/dipnot satırı sessizce atlanır.
 *
 * Tutar üç biçimde geliyor, hepsi destekleniyor:
 *   - tek işaretli sütun (Ziraat, İş, Garanti, TEB, QNB: eksi = çıkan)
 *   - ayrı Borç/Alacak sütunları (Halkbank)
 *   - işaretsiz/işaretli tutar + B/A yön sütunu (Vakıfbank, Akbank)
 */

export const STATEMENT_FIELDS = [
  "date",
  "time",
  "description",
  "detail",
  "amount",
  "debit",
  "credit",
  "direction",
  "balance",
  "reference",
  "counterparty",
  "iban",
  "ignore",
] as const;
export type StatementField = (typeof STATEMENT_FIELDS)[number];

/** Sütun indeksi → anlam. Verilmeyen sütun `ignore`. */
export type ColumnMapping = Record<number, StatementField>;

/**
 * Başlık adları (katlanmış: küçük harf, Türkçe harfler sadeleşmiş, noktalama
 * boşluk). Sıra önemli: tam eşleşme önce, sonra **öncelik** — Vakıfbank'ta hem
 * "İŞLEM TARİHİ" hem "HAREKET TARIH" var, saatsiz olan (ilki) tercih edilir.
 */
const ALIASES: Array<[Exclude<StatementField, "ignore">, string[]]> = [
  ["direction", ["b a", "ba", "borc alacak", "b a kodu", "yon"]],
  ["date", ["islem tarihi", "tarih", "tarih saat", "islem tarihi saat", "hareket tarihi", "hareket tarih", "date"]],
  ["time", ["saat", "islem saati", "time"]],
  ["amount", ["islem tutari", "tutar", "tutar tl", "islem tutari tl", "miktar", "amount"]],
  ["debit", ["borc", "borc tutari", "cikan", "giden", "debit"]],
  ["credit", ["alacak", "alacak tutari", "giren", "gelen", "credit"]],
  ["balance", ["bakiye", "yeni bakiye", "islem sonrasi bakiye", "kalan bakiye", "balance"]],
  ["description", ["aciklama", "islem aciklamasi", "aciklamalar", "detay", "islem detayi", "description"]],
  ["detail", ["islem tipi", "islem turu", "etiket", "hareket tipi", "islem ozel aciklamasi", "islem adi"]],
  ["reference", ["dekont no", "fis no", "fis dekont no", "referans", "referans no", "referans kodu", "islem referansi", "dekont numarasi", "ref no", "islem no", "dekont", "fis dekont"]],
  ["counterparty", ["karsi taraf", "gonderen", "alici", "unvan", "ad soyad", "karsi hesap unvani", "gonderen alici"]],
  ["iban", ["iban", "karsi iban", "gonderen iban", "karsi hesap iban", "alici iban"]],
];

/** Tam eşleşme bulunamazsa "içinde geçiyor" denenen alanlar ve anahtar kelimeleri. */
const CONTAINS: Array<[Exclude<StatementField, "ignore">, string]> = [
  ["date", "tarih"],
  ["amount", "tutar"],
  ["balance", "bakiye"],
  ["description", "aciklama"],
  ["iban", "iban"],
];

/** Tarih benzeri ama hareket tarihi olmayan sütunlar: tahminde atlanır. */
const NOT_DATE = ["valor", "valor tarihi", "hesaba giris tarihi"];

export function foldHeader(value: Cell): string {
  if (value === null || value instanceof Date || typeof value === "number") return "";
  return foldTurkish(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function exactField(header: string): Exclude<StatementField, "ignore"> | null {
  for (const [field, names] of ALIASES) if (names.includes(header)) return field;
  return null;
}

/**
 * Başlık satırı: ilk 60 satırdan, tarih + tutar (ya da borç/alacak) içeren ve
 * en çok alanı tanınan satır. Eşitlikte üstteki. Bulunamazsa -1.
 */
export function findHeaderRow(rows: Cell[][]): number {
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const fields = new Set(
      (rows[i] ?? []).map((c) => {
        const h = foldHeader(c);
        return h ? (exactField(h) ?? containsField(h)) : null;
      }),
    );
    const hasDate = fields.has("date");
    const hasMoney = fields.has("amount") || fields.has("debit") || fields.has("credit");
    if (!hasDate || !hasMoney) continue;
    const score = [...fields].filter(Boolean).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

function containsField(header: string): Exclude<StatementField, "ignore"> | null {
  if (NOT_DATE.includes(header)) return null;
  for (const [field, needle] of CONTAINS) if (header.includes(needle)) return field;
  return null;
}

/**
 * Başlıktan sütun anlamı tahmini. Her alan bir kez atanır (ilk/öncelikli
 * sütuna); `detail` birden çok sütun alabilir (açıklamaya eklenir).
 */
export function guessMapping(header: Cell[]): ColumnMapping {
  const folded = header.map(foldHeader);
  const mapping: ColumnMapping = {};
  const taken = new Set<StatementField>();

  // 1) Tam eşleşme, alias öncelik sırasıyla.
  for (const [field, names] of ALIASES) {
    for (const name of names) {
      const index = folded.findIndex((h, i) => h === name && mapping[i] === undefined);
      if (index < 0) continue;
      if (taken.has(field) && field !== "detail") continue;
      mapping[index] = field;
      taken.add(field);
      if (field !== "detail") break;
    }
  }
  // 2) İçinde geçen (eksik kalan zorunlu/önemli alanlar için).
  for (const [field, needle] of CONTAINS) {
    if (taken.has(field)) continue;
    const index = folded.findIndex(
      (h, i) => mapping[i] === undefined && h.includes(needle) && !(field === "date" && NOT_DATE.includes(h)),
    );
    if (index >= 0) {
      mapping[index] = field;
      taken.add(field);
    }
  }
  // Tek tutar sütunu varsa borç/alacak tahmini gereksiz (ör. "Borç/Alacak"
  // yön sütunu "borc" sanılmasın diye `direction` önce geliyor zaten).
  return mapping;
}

export type MappingProblem = "missing_date" | "missing_amount";

export function validateMapping(mapping: ColumnMapping): MappingProblem[] {
  const fields = new Set(Object.values(mapping));
  const problems: MappingProblem[] = [];
  if (!fields.has("date")) problems.push("missing_date");
  if (!fields.has("amount") && !fields.has("debit") && !fields.has("credit")) problems.push("missing_amount");
  return problems;
}

/* -------------------------------------------------------------------------- *
 * Kayıtlı eşleştirme (hesap başına)
 * -------------------------------------------------------------------------- */

/**
 * Eşleştirme **başlık adıyla** saklanır, indeksle değil: banka araya sütun
 * eklese de (Kuveyt Türk "Referans Kodu" ekliyor) kayıt geçerli kalır.
 */
export interface ImportProfile {
  columns: Record<string, StatementField>;
}

export function profileFromMapping(header: Cell[], mapping: ColumnMapping): ImportProfile {
  const columns: Record<string, StatementField> = {};
  header.forEach((cell, i) => {
    const name = foldHeader(cell);
    const field = mapping[i];
    if (name && field && field !== "ignore") columns[name] = field;
  });
  return { columns };
}

/** Kayıttaki tüm adlar bu başlıkta varsa eşleştirmeyi kur; yoksa null. */
export function mappingFromProfile(header: Cell[], profile: ImportProfile | null | undefined): ColumnMapping | null {
  if (!profile || Object.keys(profile.columns).length === 0) return null;
  const folded = header.map(foldHeader);
  const mapping: ColumnMapping = {};
  for (const [name, field] of Object.entries(profile.columns)) {
    const index = folded.indexOf(name);
    if (index < 0) return null;
    mapping[index] = field;
  }
  return validateMapping(mapping).length === 0 ? mapping : null;
}

/* -------------------------------------------------------------------------- *
 * Okuma
 * -------------------------------------------------------------------------- */

export type RowErrorReason = "bad_date" | "bad_amount";

export interface MappedStatement {
  rows: Array<BankTransactionDto & { line: number }>;
  errors: Array<{ line: number; reason: RowErrorReason; cells: string[] }>;
  /** Boş, toplam, devir ya da dipnot olduğu için sessizce atlanan satır sayısı. */
  skipped: number;
}

const FOOTER = /^(toplam|genel toplam|devir|onceki bakiye|donem basi|donem sonu|sayfa|bakiye|aciklama)/;

export function applyMapping(rows: Cell[][], headerRow: number, mapping: ColumnMapping): MappedStatement {
  const columnsOf = (field: StatementField) =>
    Object.entries(mapping)
      .filter(([, f]) => f === field)
      .map(([i]) => Number(i));
  const first = (field: StatementField) => columnsOf(field)[0];

  const col = {
    date: first("date"),
    time: first("time"),
    amount: first("amount"),
    debit: first("debit"),
    credit: first("credit"),
    direction: first("direction"),
    balance: first("balance"),
    reference: first("reference"),
    counterparty: first("counterparty"),
    iban: first("iban"),
    description: columnsOf("description"),
    detail: columnsOf("detail"),
  };
  // Başlığı boş ve eşleştirilmemiş sütunlar: bazı dökümlerde (birleştirilmiş
  // başlık hücresi) açıklama metni başlığın yanındaki adsız sütunda duruyor.
  // Metin içeriyorsa açıklamaya eklenir; gönderen adı kaybolmasın.
  const header = rows[headerRow] ?? [];
  const width = rows.reduce((max, row, i) => (i > headerRow ? Math.max(max, row.length) : max), header.length);
  const unnamed = Array.from({ length: width }, (_, i) => i).filter(
    (i) => mapping[i] === undefined && foldHeader(header[i] ?? null) === "",
  );

  const out: MappedStatement = { rows: [], errors: [], skipped: 0 };
  const seen = new Map<string, number>();

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const line = r + 1;
    const at = (i: number | undefined): Cell => (i === undefined ? null : (row[i] ?? null));

    const moneyCells = [at(col.amount), at(col.debit), at(col.credit)].filter((c) => c !== null);
    const dateCell = at(col.date);
    if (dateCell === null && moneyCells.length === 0) {
      out.skipped++;
      continue;
    }

    const date = readDate(dateCell, at(col.time));
    if (!date) {
      // "Toplam", "Devir bakiyesi" gibi satırlar: tarih yerinde metin.
      const label = foldHeader(dateCell) || foldHeader(row.find((c) => typeof c === "string") ?? null);
      if (FOOTER.test(label) || moneyCells.length === 0) {
        out.skipped++;
        continue;
      }
      out.errors.push({ line, reason: "bad_date", cells: row.map(display) });
      continue;
    }

    const signed = readSigned(at(col.amount), at(col.debit), at(col.credit), at(col.direction));
    if (signed === null || signed === 0) {
      if (moneyCells.length === 0) {
        out.skipped++;
        continue;
      }
      out.errors.push({ line, reason: "bad_amount", cells: row.map(display) });
      continue;
    }

    const description =
      [...col.description, ...unnamed.filter((i) => typeof at(i) === "string"), ...col.detail]
        .map((i) => text(at(i)))
        .filter((v): v is string => Boolean(v))
        .join(" · ") || undefined;
    const reference = text(at(col.reference));
    const key = `${date.toISOString()}|${signed}|${description ?? ""}`;
    const ordinal = (seen.get(key) ?? 0) + 1;
    seen.set(key, ordinal);
    const balance = col.balance === undefined ? null : readAmount(at(col.balance));

    out.rows.push({
      line,
      externalId: reference
        ? `ref-${reference}-${date.toISOString().slice(0, 10)}`
        : `row-${createHash("sha256").update(`${key}|${ordinal}`).digest("hex").slice(0, 32)}`,
      direction: signed > 0 ? "in" : "out",
      amountKurus: Math.abs(signed),
      ...(balance !== null ? { balanceAfterKurus: balance } : {}),
      counterparty: text(at(col.counterparty)) ?? counterpartyFromText(description),
      counterpartyIban: text(at(col.iban))?.replace(/\s+/g, "").toUpperCase(),
      description,
      transactionAt: date,
      provider: "manual_file",
      raw: { line },
    });
  }
  return out;
}

/**
 * Karşı taraf sütunu olmayan dökümlerde gönderen adı açıklamanın başında:
 * Garanti "ELİF KÜBRA TAŞÇI-FAST-4797992626", "AD SOYAD - EFT - ...",
 * Ziraat/İş "FAST GELEN ... GÖNDEREN: AD SOYAD". Bulunamazsa undefined.
 */
export function counterpartyFromText(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const sender = /g[oö]nderen\s*(?:ad[ıi]?\s*)?[:-]\s*([^\d·,;/]{3,60})/iu.exec(description);
  if (sender?.[1]) return sender[1].trim();
  const prefix = /^([^\d·-]{3,60}?)\s*-\s*(?:fast|eft|havale|swift)\b/iu.exec(description);
  return prefix?.[1]?.trim() || undefined;
}

function text(cell: Cell): string | undefined {
  if (cell === null) return undefined;
  const v = display(cell).trim();
  return v ? v : undefined;
}

export function display(cell: Cell): string {
  if (cell === null) return "";
  if (cell instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    const base = `${p(cell.getDate())}.${p(cell.getMonth() + 1)}.${cell.getFullYear()}`;
    return cell.getHours() || cell.getMinutes() ? `${base} ${p(cell.getHours())}:${p(cell.getMinutes())}` : base;
  }
  if (typeof cell === "number") return String(cell);
  return cell;
}

/**
 * Excel tarihi (`Date`, SheetJS yerel saat bileşenleriyle kurar) ya da metin;
 * ayrı saat sütunu varsa eklenir. Sonuç UTC'de aynı takvim günü/saat — saat
 * yoksa öğlen (gün kayması olmasın).
 */
function readDate(cell: Cell, timeCell: Cell): Date | null {
  let date: Date | null = null;
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    const hasTime = cell.getHours() !== 0 || cell.getMinutes() !== 0;
    date = new Date(
      Date.UTC(cell.getFullYear(), cell.getMonth(), cell.getDate(), hasTime ? cell.getHours() : 12, hasTime ? cell.getMinutes() : 0),
    );
  } else if (typeof cell === "string") {
    date = parseDate(cell);
  } else if (typeof cell === "number" && cell > 20000 && cell < 80000) {
    // Biçimsiz Excel seri tarihi (1900 tabanlı).
    const ms = Math.round((cell - 25569) * 86_400_000);
    const d = new Date(ms);
    date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
  }
  if (!date) return null;
  const time = timeCell instanceof Date ? `${timeCell.getHours()}:${timeCell.getMinutes()}` : typeof timeCell === "string" ? timeCell : null;
  const m = time ? /(\d{1,2}):(\d{2})/.exec(time) : null;
  if (m) date.setUTCHours(Number(m[1]), Number(m[2]), 0, 0);
  return date;
}

function readAmount(cell: Cell): number | null {
  if (cell === null) return null;
  if (typeof cell === "number") return Number.isFinite(cell) ? Math.round(cell * 100) : null;
  if (cell instanceof Date) return null;
  return parseAmount(cell);
}

/**
 * İşaretli kuruş: + giren, − çıkan.
 * Yön sütunu (B/A) varsa işareti o belirler — Vakıfbank tutarı işaretsiz
 * yazıyor, Akbank işaretli + B/A; ikisi de doğru sonuç verir.
 */
function readSigned(amount: Cell, debit: Cell, credit: Cell, direction: Cell): number | null {
  let value: number | null = null;
  if (amount !== null) value = readAmount(amount);
  if (value === null || value === 0) {
    const c = Math.abs(readAmount(credit) ?? 0);
    const d = Math.abs(readAmount(debit) ?? 0);
    if (c > 0) value = c;
    else if (d > 0) value = -d;
  }
  if (value === null) return null;
  const dir = foldHeader(direction);
  if (dir.startsWith("b") || dir.startsWith("borc") || dir === "d") return -Math.abs(value);
  if (dir.startsWith("a") || dir.startsWith("alacak") || dir === "c") return Math.abs(value);
  return value;
}
