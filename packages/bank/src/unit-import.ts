import { foldTurkish } from "@yonetim/core";

import { parseAmount } from "./statement";
import { display, foldHeader } from "./statement-map";
import type { Cell } from "./table";

/**
 * Başka programdan daire + borç aktarımı (Veri Aktarımı / `panel/gecis`).
 *
 * Rakip programların dışa aktarım biçimi yayımlanmış değil; elimizdeki tek
 * gerçek örnek Yönetimcell'in "Taşınmazların borçlandırma seçeneklerine göre
 * durumu" raporu: `.xls` uzantılı **HTML tablosu**, 1. satır künye, 2. satır
 * başlık (BLOK · NO · DEVREDEN · AİDAT · YAKIT · DEMİRBAŞ · TOPLAM), sonda
 * birleşik hücreli "(TOPLAM)" satırı. Bu yüzden program şablonu yazmak yerine
 * banka dökümündeki üç adım:
 *
 *   1. `findUnitHeaderRow` — künye altındaki başlık satırını bul.
 *   2. `guessUnitMapping` — başlık adından sütun anlamını tahmin et; kullanıcı
 *      önizlemede her sütunu kendisi düzeltir.
 *   3. `applyUnitMapping` — satırları daire + borç kalemlerine çevir.
 *
 * Borç sütunları **kayıp vermez**: her tutar sütunu bir borç türüne bağlanır
 * (aidat / yakıt-su / gecikme / diğer). Karşılığımız olmayan kalemler
 * (demirbaş, devreden, onarım fonu…) "diğer"e gider; aynı türe bağlanan
 * sütunlar daire başına **toplanır** ve açıklamada sütun adları korunur
 * ("DEMİRBAŞ + DEVREDEN"). Dosyada toplam sütunu varsa her satırda kalemlerin
 * toplamı onunla karşılaştırılır; tutmayan satır aktarımı durdurur — eşlenmemiş
 * bir borç sütunu böyle yakalanır.
 */

export const UNIT_IMPORT_FIELDS = [
  "ignore",
  "block",
  "unit",
  "floor",
  "area",
  "landShare",
  "ownerName",
  "ownerPhone",
  "tenantName",
  "tenantPhone",
  "debtDues",
  "debtUtility",
  "debtLateFee",
  "debtOther",
  "total",
] as const;

export type UnitImportField = (typeof UNIT_IMPORT_FIELDS)[number];
export type UnitImportMapping = Record<number, UnitImportField>;

/** Borç sütunu → `debt_kind`. */
export const DEBT_FIELD_KIND = {
  debtDues: "dues",
  debtUtility: "utility",
  debtLateFee: "late_fee",
  debtOther: "extra",
} as const;

export type DebtField = keyof typeof DEBT_FIELD_KIND;
export type ImportDebtKind = (typeof DEBT_FIELD_KIND)[DebtField];

const DEBT_FIELDS = Object.keys(DEBT_FIELD_KIND) as DebtField[];

/** Bir dosyada yalnız bir sütuna bağlanabilen alanlar (borç kalemleri çoklu). */
export const UNIQUE_UNIT_FIELDS: UnitImportField[] = [
  "block", "unit", "floor", "area", "landShare", "ownerName", "ownerPhone", "tenantName", "tenantPhone", "total",
];

export function isDebtField(field: UnitImportField): field is DebtField {
  return (DEBT_FIELDS as string[]).includes(field);
}

/** Katlanmış başlık (bkz. `foldHeader`) → alan; tam eşleşme. */
const EXACT: Array<[UnitImportField, string[]]> = [
  ["block", ["blok", "blok adi", "blok no", "bina", "bina adi", "block", "building"]],
  [
    "unit",
    [
      "no", "daire", "daire no", "daire numarasi", "d no", "kapi no", "bb", "bb no", "bagimsiz bolum",
      "bagimsiz bolum no", "bolum no", "unit", "unit no", "flat",
    ],
  ],
  ["floor", ["kat", "kat no", "floor"]],
  ["area", ["m2", "m 2", "metrekare", "brut m2", "net m2", "alan", "brut alan", "net alan", "area"]],
  ["landShare", ["arsa payi", "arsa pay", "pay", "land share"]],
  [
    "ownerName",
    [
      "malik", "malik adi", "malik adi soyadi", "malik ad soyad", "ev sahibi", "mulk sahibi", "kat maliki",
      "daire sahibi", "sahibi", "ad soyad", "adi soyadi", "isim", "owner",
    ],
  ],
  ["ownerPhone", ["malik telefon", "malik tel", "malik gsm", "ev sahibi telefon", "telefon", "tel", "gsm", "cep", "cep telefonu"]],
  ["tenantName", ["kiraci", "kiraci adi", "kiraci adi soyadi", "kiraci ad soyad", "oturan", "tenant"]],
  ["tenantPhone", ["kiraci telefon", "kiraci tel", "kiraci gsm", "tenant phone"]],
];

/**
 * Kelime başında geçen (sıra önemli: telefon addan, kiracı malikten, toplam
 * kalemlerden önce — "Gecikme dahil toplam borç" bir toplamdır).
 */
const CONTAINS: Array<[UnitImportField, string[]]> = [
  ["tenantPhone", ["kiraci tel", "kiraci gsm", "kiraci cep"]],
  ["ownerPhone", ["malik tel", "malik gsm", "malik cep", "sahibi tel"]],
  ["tenantName", ["kiraci"]],
  ["ownerName", ["malik", "sahibi"]],
  ["landShare", ["arsa pay"]],
  ["area", ["metrekare", "m2"]],
  ["unit", ["daire", "bagimsiz bolum"]],
  ["block", ["blok"]],
  ["total", ["toplam"]],
  ["debtLateFee", ["gecikme", "faiz", "tazminat"]],
  ["debtDues", ["aidat"]],
  ["debtUtility", ["yakit", "isinma", "dogalgaz", "dogal gaz", "sicak su", "elektrik", "kalorimetre", "pay olcer"]],
  [
    "debtOther",
    ["demirbas", "devreden", "devir", "borc", "bakiye", "onarim", "tadilat", "fon", "diger", "otopark", "ek odeme", "ceza"],
  ],
];

function fieldOf(header: string): UnitImportField | null {
  if (!header) return null;
  for (const [field, names] of EXACT) if (names.includes(header)) return field;
  const padded = ` ${header}`;
  for (const [field, needles] of CONTAINS) if (needles.some((n) => padded.includes(` ${n}`))) return field;
  // "Su" tek başına kelime olmalı ("şube", "sunum" değil).
  if (/(^| )su( |$)/.test(header)) return "debtUtility";
  return null;
}

/**
 * Başlık satırı: ilk 40 satırdan, daire numarası sütunu tanınan ve en çok
 * alanı tanınan satır (künye satırı "TOPLAM BORÇ" içerse de daire sütunu
 * olmadığı için seçilmez). Bulunamazsa -1.
 */
export function findUnitHeaderRow(rows: Cell[][]): number {
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const fields = (rows[i] ?? []).map((c) => fieldOf(foldHeader(c)));
    if (!fields.includes("unit")) continue;
    const score = fields.filter(Boolean).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Başlıktan sütun tahmini. Tekil alanlar ilk uygun sütuna; borç kalemleri
 * birden çok sütuna. Toplam sütunu **başka borç sütunu varsa** kontrol
 * sütunudur; tek tutar sütunu oysa ("TOPLAM BORÇ") borcun kendisidir.
 */
export function guessUnitMapping(header: Cell[]): UnitImportMapping {
  const mapping: UnitImportMapping = {};
  const taken = new Set<UnitImportField>();
  header.forEach((cell, index) => {
    const field = fieldOf(foldHeader(cell));
    if (!field) return;
    if (UNIQUE_UNIT_FIELDS.includes(field) && taken.has(field)) return;
    mapping[index] = field;
    taken.add(field);
  });
  const hasDebt = Object.values(mapping).some(isDebtField);
  if (!hasDebt) {
    for (const [key, field] of Object.entries(mapping)) if (field === "total") mapping[Number(key)] = "debtOther";
  }
  return mapping;
}

export type UnitMappingProblem = "missing_unit" | "duplicate_field";

export function validateUnitMapping(mapping: UnitImportMapping): UnitMappingProblem[] {
  const values = Object.values(mapping);
  const problems: UnitMappingProblem[] = [];
  if (!values.includes("unit")) problems.push("missing_unit");
  if (UNIQUE_UNIT_FIELDS.some((f) => values.filter((v) => v === f).length > 1)) problems.push("duplicate_field");
  return problems;
}

export interface ImportDebtLine {
  kind: ImportDebtKind;
  amountMinor: number;
  /** Bu türe toplanan sütunların başlıkları ("DEMİRBAŞ", "DEVREDEN"). */
  columns: string[];
}

export interface ImportUnitRow {
  /** 1 tabanlı dosya satırı. */
  line: number;
  blockName?: string;
  number: string;
  floor?: number;
  areaM2?: number;
  landShare?: number;
  ownerName?: string;
  ownerPhone?: string;
  tenantName?: string;
  tenantPhone?: string;
  /** Yalnız pozitif toplamlı türler (aktarılacak borçlar). */
  debts: ImportDebtLine[];
}

export type UnitImportIssueCode =
  | "empty_unit"
  | "duplicate_unit"
  | "bad_amount"
  | "total_mismatch"
  | "credit_balance"
  | "land_share_large";

export interface UnitImportIssue {
  line: number;
  /** `error` aktarımı durdurur; `warning` bilgi. */
  severity: "error" | "warning";
  code: UnitImportIssueCode;
  /** Daire etiketi ("A BLOK / 1") — satırda varsa. */
  unit?: string;
  /** Sütun başlığı (bad_amount, credit_balance). */
  column?: string;
  /** Kuruş: total_mismatch'te dosya toplamı / kalemler toplamı; credit_balance'ta alacak. */
  expectedMinor?: number;
  actualMinor?: number;
  value?: string;
}

export interface MappedUnitImport {
  units: ImportUnitRow[];
  issues: UnitImportIssue[];
  /** Boş ve toplam/dipnot satırları (sessizce atlanan). */
  skipped: number;
  totals: {
    byKind: Record<ImportDebtKind, number>;
    debtMinor: number;
    blocks: string[];
  };
}

/** Daire numarası karşılaştırma anahtarı: "01" ile "1" aynı daire. */
export function unitKey(blockName: string | undefined | null, number: string): string {
  const block = foldTurkish(blockName ?? "").replace(/\s+/g, " ").trim();
  const no = foldTurkish(number).replace(/\s+/g, "").replace(/^0+(?=[0-9a-z])/, "");
  return `${block}#${no}`;
}

function text(cell: Cell | undefined): string {
  return display(cell ?? null).replace(/\s+/g, " ").trim();
}

function amount(cell: Cell | undefined): number | null {
  if (cell === null || cell === undefined) return 0;
  if (typeof cell === "number") return Number.isFinite(cell) ? Math.round(cell * 100) : null;
  if (cell instanceof Date) return null;
  if (cell.trim() === "" || /^[-–—]$/.test(cell.trim())) return 0;
  return parseAmount(cell);
}

function decimal(cell: Cell | undefined): number | undefined {
  if (cell === null || cell === undefined || cell instanceof Date) return undefined;
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : undefined;
  const raw = cell.replace(/\s/g, "");
  if (!raw) return undefined;
  // Türkçe yazımda virgül ondalıktır ("0,041667", "1.250,5"); arsa payı ve
  // m² için kuruşa yuvarlayan parseAmount kullanılamaz.
  const n = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
  return Number.isFinite(n) ? n : undefined;
}

const SUMMARY_ROW = /\b(genel )?toplam\b|\bara toplam\b|\btotal\b/;

export function applyUnitMapping(rows: Cell[][], headerRow: number, mapping: UnitImportMapping): MappedUnitImport {
  const header = rows[headerRow] ?? [];
  const col = (field: UnitImportField) => {
    const hit = Object.entries(mapping).find(([, f]) => f === field);
    return hit ? Number(hit[0]) : undefined;
  };
  const debtCols = Object.entries(mapping)
    .filter(([, f]) => isDebtField(f))
    .map(([i, f]) => ({ index: Number(i), kind: DEBT_FIELD_KIND[f as DebtField], title: text(header[Number(i)]) || `#${Number(i) + 1}` }));
  const blockCol = col("block");
  const unitCol = col("unit");
  const totalCol = col("total");

  const units: ImportUnitRow[] = [];
  const issues: UnitImportIssue[] = [];
  const seen = new Set<string>();
  const byKind: Record<ImportDebtKind, number> = { dues: 0, utility: 0, late_fee: 0, extra: 0 };
  let skipped = 0;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const line = r + 1;
    if (row.every((c) => text(c) === "")) {
      skipped += 1;
      continue;
    }
    const blockName = blockCol === undefined ? "" : text(row[blockCol]);
    const number = unitCol === undefined ? "" : text(row[unitCol]);
    // "(TOPLAM)", "Genel Toplam" gibi özet satırları daire değildir.
    if (SUMMARY_ROW.test(foldTurkish(`${blockName} ${number}`)) || (!number && SUMMARY_ROW.test(foldTurkish(text(row[0]))))) {
      skipped += 1;
      continue;
    }
    if (!number) {
      issues.push({ line, severity: "warning", code: "empty_unit", value: row.map(text).filter(Boolean).slice(0, 4).join(" · ") });
      continue;
    }
    const label = blockName ? `${blockName} / ${number}` : number;
    const key = unitKey(blockName, number);
    if (seen.has(key)) {
      issues.push({ line, severity: "error", code: "duplicate_unit", unit: label });
      continue;
    }
    seen.add(key);

    // Borç kalemleri: tür başına topla, sütun adlarını koru.
    const sums = new Map<ImportDebtKind, { minor: number; columns: string[] }>();
    let rowSum = 0;
    let badRow = false;
    for (const d of debtCols) {
      const minor = amount(row[d.index]);
      if (minor === null) {
        issues.push({ line, severity: "error", code: "bad_amount", unit: label, column: d.title, value: text(row[d.index]) });
        badRow = true;
        continue;
      }
      rowSum += minor;
      if (minor === 0) continue;
      const entry = sums.get(d.kind) ?? { minor: 0, columns: [] };
      entry.minor += minor;
      entry.columns.push(d.title);
      sums.set(d.kind, entry);
    }
    if (badRow) continue;

    if (totalCol !== undefined && debtCols.length > 0) {
      const expected = amount(row[totalCol]);
      if (expected === null) {
        issues.push({ line, severity: "error", code: "bad_amount", unit: label, column: text(header[totalCol]), value: text(row[totalCol]) });
        continue;
      }
      if (Math.abs(expected - rowSum) > 1) {
        issues.push({ line, severity: "error", code: "total_mismatch", unit: label, expectedMinor: expected, actualMinor: rowSum });
        continue;
      }
    }

    const debts: ImportDebtLine[] = [];
    for (const [kind, s] of sums) {
      // Alacak (fazla ödeme) bakiyesi borç olarak yazılamaz; kaybolmasın
      // diye satır uyarısıyla gösterilir, yönetici elle işler.
      if (s.minor < 0) {
        issues.push({ line, severity: "warning", code: "credit_balance", unit: label, column: s.columns.join(" + "), actualMinor: -s.minor });
        continue;
      }
      debts.push({ kind, amountMinor: s.minor, columns: s.columns });
      byKind[kind] += s.minor;
    }

    const landShare = decimal(row[col("landShare") ?? -1]);
    if (landShare !== undefined && landShare > 100) {
      issues.push({ line, severity: "warning", code: "land_share_large", unit: label, value: String(landShare) });
    }
    const floor = decimal(row[col("floor") ?? -1]);
    const opt = (field: UnitImportField) => {
      const i = col(field);
      const v = i === undefined ? "" : text(row[i]);
      return v || undefined;
    };
    units.push({
      line,
      blockName: blockName || undefined,
      number,
      floor: floor !== undefined && Number.isInteger(floor) ? floor : undefined,
      areaM2: decimal(row[col("area") ?? -1]),
      landShare,
      ownerName: opt("ownerName"),
      ownerPhone: opt("ownerPhone"),
      tenantName: opt("tenantName"),
      tenantPhone: opt("tenantPhone"),
      debts,
    });
  }

  return {
    units,
    issues,
    skipped,
    totals: {
      byKind,
      debtMinor: byKind.dues + byKind.utility + byKind.late_fee + byKind.extra,
      blocks: [...new Set(units.map((u) => u.blockName).filter((b): b is string => Boolean(b)))],
    },
  };
}
