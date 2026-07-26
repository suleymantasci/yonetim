/**
 * Self-servis veri migration — SPEC Bölüm 3.11 / 6.16.
 * Apsiyon, Biyos, Dijiyon, Yönetimcell ve genel Excel dışa aktarımlarını
 * ortak bir iç modele çevirir. Sütun adları esnek eşleştirilir.
 */
export type MigrationSource = "apsiyon" | "biyos" | "dijiyon" | "yonetimcell" | "excel";

export interface ImportedUnit {
  blockName?: string;
  number: string;
  floor?: number;
  areaM2?: number;
  landShare?: number;
  ownerName?: string;
  ownerPhone?: string;
  tenantName?: string;
  tenantPhone?: string;
  openingBalanceKurus?: number;
  rowIndex: number;
}

export interface MigrationIssue {
  rowIndex: number;
  severity: "error" | "warning";
  field?: string;
  /** i18n anahtarı: `app.migration.issue.<code>`. */
  code:
    | "noDataRows"
    | "missingUnitColumn"
    | "emptyUnitNumber"
    | "duplicateUnit"
    | "landShareTooLarge";
  params?: Record<string, string | number>;
}

export interface MigrationResult {
  source: MigrationSource;
  units: ImportedUnit[];
  issues: MigrationIssue[];
  detectedColumns: Record<string, string>;
  summary: {
    totalRows: number;
    importable: number;
    skipped: number;
    totalOpeningBalanceKurus: number;
    blocks: string[];
  };
}

/** Sütun adı eş anlamlıları — rakiplerin farklı başlıkları tek modele iner. */
const COLUMN_ALIASES: Record<keyof Omit<ImportedUnit, "rowIndex">, string[]> = {
  blockName: ["blok", "blok adi", "blok adı", "bloknu", "block", "bina", "bina adi"],
  number: ["daire", "daire no", "daire numarasi", "daire numarası", "bagimsiz bolum", "bağımsız bölüm", "bb no", "no", "kapi no", "kapı no", "unit"],
  floor: ["kat", "kat no", "floor"],
  areaM2: ["m2", "metrekare", "alan", "brut m2", "brüt m2", "area"],
  landShare: ["arsa payi", "arsa payı", "arsa pay", "pay", "land share"],
  ownerName: ["malik", "malik adi", "malik adı", "ev sahibi", "mulk sahibi", "mülk sahibi", "owner"],
  ownerPhone: ["malik telefon", "malik tel", "ev sahibi telefon", "owner phone"],
  tenantName: ["kiraci", "kiracı", "kiraci adi", "kiracı adı", "oturan", "tenant"],
  tenantPhone: ["kiraci telefon", "kiracı telefon", "kiraci tel", "tenant phone"],
  openingBalanceKurus: ["bakiye", "borc", "borç", "acilis bakiye", "açılış bakiye", "devir", "balance", "borc bakiye"],
};

function normalizeHeader(header: string): string {
  const map: Record<string, string> = {
    ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i", i̇: "i",
    ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
  };
  return header
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** CSV içeriğini ayrıştırır (ayraç otomatik: ; veya ,). Alıntılı hücreleri destekler. */
export function parseCsv(content: string): string[][] {
  const text = content.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.length > 0));
}

function parseTrNumber(value: string): number | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/[^\d.,-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** Dışa aktarım dosyasını içeri alınabilir modele çevirir. */
export function mapImport(content: string, source: MigrationSource): MigrationResult {
  const rows = parseCsv(content);
  const issues: MigrationIssue[] = [];

  if (rows.length < 2) {
    return {
      source,
      units: [],
      issues: [{ rowIndex: 0, severity: "error", code: "noDataRows" }],
      detectedColumns: {},
      summary: { totalRows: 0, importable: 0, skipped: 0, totalOpeningBalanceKurus: 0, blocks: [] },
    };
  }

  const headers = (rows[0] ?? []).map(normalizeHeader);
  const detectedColumns: Record<string, string> = {};
  const columnIndex: Partial<Record<keyof Omit<ImportedUnit, "rowIndex">, number>> = {};

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [
    keyof Omit<ImportedUnit, "rowIndex">,
    string[],
  ][]) {
    const idx = headers.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));
    if (idx >= 0) {
      columnIndex[field] = idx;
      detectedColumns[field] = rows[0]![idx] ?? "";
    }
  }

  if (columnIndex.number === undefined) {
    issues.push({ rowIndex: 0, severity: "error", field: "number", code: "missingUnitColumn" });
  }

  const units: ImportedUnit[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const rowIndex = r + 1;
    const get = (field: keyof Omit<ImportedUnit, "rowIndex">) => {
      const idx = columnIndex[field];
      return idx === undefined ? "" : (row[idx] ?? "").trim();
    };

    const number = get("number");
    if (!number) {
      issues.push({ rowIndex, severity: "warning", field: "number", code: "emptyUnitNumber" });
      continue;
    }

    const blockName = get("blockName") || undefined;
    const key = `${blockName ?? ""}#${number}`;
    if (seen.has(key)) {
      issues.push({
        rowIndex,
        severity: "warning",
        field: "number",
        code: "duplicateUnit",
        params: { number },
      });
      continue;
    }
    seen.add(key);

    const balanceRaw = parseTrNumber(get("openingBalanceKurus"));
    const landShare = parseTrNumber(get("landShare"));
    const areaM2 = parseTrNumber(get("areaM2"));

    if (landShare !== undefined && landShare > 100) {
      issues.push({
        rowIndex,
        severity: "warning",
        field: "landShare",
        code: "landShareTooLarge",
        params: { value: landShare },
      });
    }

    units.push({
      blockName,
      number,
      floor: parseTrNumber(get("floor")),
      areaM2,
      landShare,
      ownerName: get("ownerName") || undefined,
      ownerPhone: get("ownerPhone") || undefined,
      tenantName: get("tenantName") || undefined,
      tenantPhone: get("tenantPhone") || undefined,
      openingBalanceKurus: balanceRaw !== undefined ? Math.round(balanceRaw * 100) : undefined,
      rowIndex,
    });
  }

  const blocks = [...new Set(units.map((u) => u.blockName).filter(Boolean))] as string[];

  return {
    source,
    units,
    issues,
    detectedColumns,
    summary: {
      totalRows: rows.length - 1,
      importable: units.length,
      skipped: rows.length - 1 - units.length,
      totalOpeningBalanceKurus: units.reduce((a, u) => a + (u.openingBalanceKurus ?? 0), 0),
      blocks,
    },
  };
}

/** Kaynak adları i18n katmanındadır: `enum.migrationSource.<source>`. */
export const MIGRATION_SOURCES: readonly MigrationSource[] = [
  "apsiyon", "biyos", "dijiyon", "yonetimcell", "excel",
];
