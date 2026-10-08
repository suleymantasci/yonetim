import { foldTurkish, normalizePhone } from "@yonetim/core";

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
 *
 * İki dosya şekli var:
 *   - **daire bazlı** (taşınmaz raporu): her daire bir satır; malik/kiracı adı
 *     ayrı sütunlarda olabilir; borç dairenin.
 *   - **kişi bazlı** (Yönetimcell "Üyelerin (cari) …" raporu): her satır bir
 *     kişi — BLOK · NO · DURUMU (Malik/Kiracı) · AD SOYAD · TELEFON · kalemler.
 *     Aynı daire birden çok satırda geçer (malik + kiracı, eski + yeni
 *     kiracı); borç **o kişinin** borcudur. Eski kiracının kalan borcu da
 *     kişiyle birlikte aktarılır (kira ilişkisi kapalı olarak).
 * "Durumu" ya da "Ad Soyad" sütunu eşlenmişse dosya kişi bazlı okunur.
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
  "role",
  "personName",
  "personPhone",
  "debtDues",
  "debtUtility",
  "debtLateFee",
  "debtRent",
  "debtDeposit",
  "debtFine",
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
  debtRent: "rent",
  debtDeposit: "deposit",
  debtFine: "admin_fine",
  debtOther: "extra",
} as const;

export type DebtField = keyof typeof DEBT_FIELD_KIND;
export type ImportDebtKind = (typeof DEBT_FIELD_KIND)[DebtField];

const DEBT_FIELDS = Object.keys(DEBT_FIELD_KIND) as DebtField[];

export const IMPORT_DEBT_KINDS = Object.values(DEBT_FIELD_KIND) as ImportDebtKind[];

export function emptyKindTotals(): Record<ImportDebtKind, number> {
  return Object.fromEntries(IMPORT_DEBT_KINDS.map((k) => [k, 0])) as Record<ImportDebtKind, number>;
}

/** Bir dosyada yalnız bir sütuna bağlanabilen alanlar (borç kalemleri çoklu). */
export const UNIQUE_UNIT_FIELDS: UnitImportField[] = [
  "block", "unit", "floor", "area", "landShare", "ownerName", "ownerPhone", "tenantName", "tenantPhone",
  "role", "personName", "personPhone", "total",
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
      "daire sahibi", "sahibi", "owner",
    ],
  ],
  ["ownerPhone", ["malik telefon", "malik tel", "malik gsm", "ev sahibi telefon"]],
  ["role", ["durum", "durumu", "sifat", "sifati", "uye tipi", "uye turu", "iliski", "oturum sekli", "role"]],
  ["personName", ["ad soyad", "adi soyadi", "ad soyadi", "adi soyad", "isim", "isim soyisim", "uye", "uye adi", "cari", "cari adi", "name"]],
  ["personPhone", ["telefon", "tel", "gsm", "cep", "cep telefonu", "telefon no", "phone"]],
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
  ["debtRent", ["kira bedeli", "kira borcu"]],
  ["debtDeposit", ["depozit", "depozito", "teminat"]],
  ["debtFine", ["idari ceza", "idari para cezasi"]],
  ["debtUtility", ["yakit", "isinma", "dogalgaz", "dogal gaz", "sicak su", "elektrik", "kalorimetre", "pay olcer"]],
  [
    "debtOther",
    ["demirbas", "avans", "ek gider", "devreden", "devir", "borc", "bakiye", "onarim", "tadilat", "fon", "diger", "otopark", "ek odeme", "ceza"],
  ],
];

function fieldOf(header: string): UnitImportField | null {
  if (!header) return null;
  for (const [field, names] of EXACT) if (names.includes(header)) return field;
  const padded = ` ${header}`;
  for (const [field, needles] of CONTAINS) if (needles.some((n) => padded.includes(` ${n}`))) return field;
  // "Su" tek başına kelime olmalı ("şube", "sunum" değil).
  if (/(^| )su( |$)/.test(header)) return "debtUtility";
  // "Kira" tek başına kelime ("kiracı" değil).
  if (/(^| )kira( |$)/.test(header)) return "debtRent";
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

export type PersonRole = "owner" | "tenant";

export interface ImportPerson {
  line: number;
  role: PersonRole;
  /** Eski malik/kiracı ("Eski Kiracı") — ilişki kapalı aktarılır. */
  former: boolean;
  name: string;
  /** Biçimlenmiş (+905…) telefon; okunamadıysa yok. */
  phone?: string;
  /** Kişi bazlı dosyada bu kişinin borçları. */
  debts: ImportDebtLine[];
}

export interface ImportUnitRow {
  /** 1 tabanlı dosya satırı. */
  line: number;
  blockName?: string;
  number: string;
  floor?: number;
  areaM2?: number;
  landShare?: number;
  /** Malik/kiracı(lar), dosyadaki sırayla. */
  people: ImportPerson[];
  /** Daire bazlı dosyada dairenin borçları (kişi bazlıda boş). Yalnız pozitif toplamlı türler. */
  debts: ImportDebtLine[];
}

export type UnitImportIssueCode =
  | "empty_unit"
  | "duplicate_unit"
  | "bad_amount"
  | "total_mismatch"
  | "credit_balance"
  | "land_share_large"
  | "duplicate_person"
  | "unknown_role"
  | "multiple_tenants"
  | "bad_phone"
  | "shared_phone";

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
  /** "Durumu" / "Ad Soyad" eşlendi: her satır bir kişi. */
  personMode: boolean;
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

/** "Malik", "Kiracı", "Eski Kiracı", "Hissedar" … → rol. */
export function parseRole(value: string): { role: PersonRole; former: boolean } | null {
  const v = ` ${foldTurkish(value).replace(/[^a-z0-9]+/g, " ").trim()} `;
  const former = /\s(eski|onceki|ayrilan|ayrildi|cikan|cikti|pasif)\s/.test(v);
  if (/\s(kiraci|oturan|kullanici|tenant)/.test(v)) return { role: "tenant", former };
  if (/\s(malik|mal sahibi|ev sahibi|mulk sahibi|hissedar|sahib|owner)/.test(v)) return { role: "owner", former };
  return null;
}

export function personKey(role: PersonRole, name: string): string {
  return `${role}#${foldTurkish(name).replace(/[^a-z0-9]+/g, " ").trim()}`;
}

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
  const personMode = col("role") !== undefined || col("personName") !== undefined;

  const units: ImportUnitRow[] = [];
  const byUnit = new Map<string, ImportUnitRow>();
  const issues: UnitImportIssue[] = [];
  const byKind: Record<ImportDebtKind, number> = emptyKindTotals();
  let skipped = 0;

  const cellText = (row: Cell[], field: UnitImportField) => {
    const i = col(field);
    return i === undefined ? "" : text(row[i]);
  };
  const phoneOf = (raw: string, line: number, label: string) => {
    if (!raw) return undefined;
    const phone = normalizePhone(raw);
    if (!phone) issues.push({ line, severity: "warning", code: "bad_phone", unit: label, value: raw });
    return phone ?? undefined;
  };

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
    let unit = byUnit.get(key);
    if (unit && !personMode) {
      issues.push({ line, severity: "error", code: "duplicate_unit", unit: label });
      continue;
    }

    // Kişi (kişi bazlı dosyada) — borçtan önce: yinelenen kişi satırı atlanır.
    let person: ImportPerson | undefined;
    if (personMode) {
      const name = cellText(row, "personName");
      const roleRaw = cellText(row, "role");
      let parsed = roleRaw ? parseRole(roleRaw) : { role: "owner" as const, former: false };
      if (!parsed) {
        issues.push({ line, severity: "warning", code: "unknown_role", unit: label, value: roleRaw });
        parsed = { role: "owner", former: false };
      }
      if (name) {
        const pk = personKey(parsed.role, name);
        if (unit?.people.some((p) => personKey(p.role, p.name) === pk && p.former === parsed.former)) {
          issues.push({ line, severity: "error", code: "duplicate_person", unit: label, value: name });
          continue;
        }
        person = {
          line,
          role: parsed.role,
          former: parsed.former,
          name,
          phone: phoneOf(cellText(row, "personPhone"), line, label),
          debts: [],
        };
      }
    }

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
        issues.push({ line, severity: "warning", code: "credit_balance", unit: person ? `${label} — ${person.name}` : label, column: s.columns.join(" + "), actualMinor: -s.minor });
        continue;
      }
      debts.push({ kind, amountMinor: s.minor, columns: s.columns });
      byKind[kind] += s.minor;
    }

    if (!unit) {
      const landShare = decimal(row[col("landShare") ?? -1]);
      if (landShare !== undefined && landShare > 100) {
        issues.push({ line, severity: "warning", code: "land_share_large", unit: label, value: String(landShare) });
      }
      const floor = decimal(row[col("floor") ?? -1]);
      unit = {
        line,
        blockName: blockName || undefined,
        number,
        floor: floor !== undefined && Number.isInteger(floor) ? floor : undefined,
        areaM2: decimal(row[col("area") ?? -1]),
        landShare,
        people: [],
        debts: [],
      };
      byUnit.set(key, unit);
      units.push(unit);
    }

    if (personMode) {
      if (person) {
        person.debts = debts;
        unit.people.push(person);
      } else if (debts.length > 0) {
        // Adı boş kişi satırının borcu daireye yazılır, kaybolmaz.
        unit.debts.push(...debts);
      }
    } else {
      unit.debts = debts;
      const owner = cellText(row, "ownerName");
      const tenant = cellText(row, "tenantName");
      if (owner) unit.people.push({ line, role: "owner", former: false, name: owner, phone: phoneOf(cellText(row, "ownerPhone"), line, label), debts: [] });
      if (tenant) unit.people.push({ line, role: "tenant", former: false, name: tenant, phone: phoneOf(cellText(row, "tenantPhone"), line, label), debts: [] });
    }
  }

  // Bir dairede birden çok "güncel" kiracı: dosyada sonra gelen güncel kabul
  // edilir, öncekiler eski kiracı olarak (ilişki kapalı) aktarılır.
  for (const unit of units) {
    const current = unit.people.filter((p) => p.role === "tenant" && !p.former);
    if (current.length < 2) continue;
    for (const p of current.slice(0, -1)) p.former = true;
    issues.push({
      line: current[0]!.line,
      severity: "warning",
      code: "multiple_tenants",
      unit: unit.blockName ? `${unit.blockName} / ${unit.number}` : unit.number,
      value: current[current.length - 1]!.name,
    });
  }

  return {
    units,
    personMode,
    issues,
    skipped,
    totals: {
      byKind,
      debtMinor: Object.values(byKind).reduce((a, b) => a + b, 0),
      blocks: [...new Set(units.map((u) => u.blockName).filter((b): b is string => Boolean(b)))],
    },
  };
}

/** Bir dairenin aktarılacak bütün borçları (daireninki + kişilerinki). */
export function unitDebtTotal(unit: ImportUnitRow): number {
  return [...unit.debts, ...unit.people.flatMap((p) => p.debts)].reduce((s, d) => s + d.amountMinor, 0);
}
