import { describe, expect, it } from "vitest";

import {
  applyMapping,
  findHeaderRow,
  guessMapping,
  mappingFromProfile,
  profileFromMapping,
  readTable,
  sniffFormat,
  validateMapping,
  type Cell,
} from "@yonetim/bank";
import { BANK_FIXTURES } from "@yonetim/bank/fixtures";

/**
 * Banka dökümleri — her bankanın internet şubesi "hesap hareketleri"
 * dosyasının yapısını taklit eden örneklerle (bkz. `packages/bank/src/
 * fixtures.ts`): biçim tanıma, başlık bulma, sütun tahmini, okuma.
 * Her dökümde aynı üç hareket var; hepsinden aynı sonuç beklenir.
 */
describe.each(BANK_FIXTURES)("$bank ($fileName)", ({ build, expect: want, fileName }) => {
  const file = build();
  const table = readTable(file);

  it("biçimi imzadan tanır", () => {
    const ext = fileName.split(".").pop();
    const expected = fileName.includes("kuveyt") ? "html" : ext === "xls" ? "xls" : ext === "csv" ? "csv" : "xlsx";
    expect(sniffFormat(file)).toBe(expected);
    expect(table.format).toBe(expected);
  });

  it("künye satırlarının altındaki başlığı bulur", () => {
    expect(findHeaderRow(table.rows)).toBe(want.headerRow);
  });

  it("sütunları doğru tahmin eder ve üç hareketi okur", () => {
    const header = table.rows[want.headerRow]!;
    const mapping = guessMapping(header);
    expect(validateMapping(mapping)).toEqual([]);

    const result = applyMapping(table.rows, want.headerRow, mapping);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(want.rows.length);
    result.rows.forEach((row, i) => {
      const w = want.rows[i]!;
      expect(row.transactionAt.toISOString().slice(0, 10)).toBe(w.date);
      expect(row.direction).toBe(w.direction);
      expect(row.amountKurus).toBe(w.amountKurus);
      expect(row.description ?? "").toContain(w.descriptionIncludes);
      if (w.reference) expect(row.externalId).toContain(w.reference);
    });
  });

  it("kayıtlı eşleştirme başlık adıyla geri kurulur", () => {
    const header = table.rows[want.headerRow]!;
    const mapping = guessMapping(header);
    const profile = profileFromMapping(header, mapping);
    // Banka araya sütun eklese de (Kuveyt Türk) adla bulunur.
    const shifted: Cell[] = ["Yeni Sütun", ...header];
    const restored = mappingFromProfile(shifted, profile)!;
    expect(restored).not.toBeNull();
    for (const [i, field] of Object.entries(mapping)) {
      if (field !== "ignore") expect(restored[Number(i) + 1]).toBe(field);
    }
  });
});

describe("elle eşleştirme ve hata satırları", () => {
  const rows: Cell[][] = [
    ["Hesap Özeti"],
    ["Tar.", "Ayrıntı", "Tut."],
    ["05.10.2026", "AİDAT D:3", "1.250,00"],
    ["32.10.2026", "BOZUK TARİH", "100,00"],
    ["06.10.2026", "BOZUK TUTAR", "yüz lira"],
    [null, "Toplam", "1.350,00"],
  ];

  it("tanınmayan başlıkta satır bulunmaz, elle eşleştirme okur ve hatalı satırı gösterir", () => {
    expect(findHeaderRow(rows)).toBe(-1);
    const mapping = { 0: "date", 1: "description", 2: "amount" } as const;
    const result = applyMapping(rows, 1, mapping);
    expect(result.rows.map((r) => r.amountKurus)).toEqual([125_000]);
    expect(result.errors.map((e) => [e.line, e.reason])).toEqual([
      [4, "bad_date"],
      [5, "bad_amount"],
    ]);
    expect(result.skipped).toBe(1);
  });

  it("eksik zorunlu alanı bildirir", () => {
    expect(validateMapping({ 1: "description" })).toEqual(["missing_date", "missing_amount"]);
  });

  it("boş ve okunamayan dosyayı reddeder", () => {
    expect(() => readTable(new Uint8Array())).toThrow("empty");
  });
});
