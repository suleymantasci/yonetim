import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import {
  applyUnitMapping,
  findUnitHeaderRow,
  guessUnitMapping,
  readTable,
  unitKey,
  validateUnitMapping,
  type Cell,
} from "@yonetim/bank";

/**
 * Veri Aktarımı — başka programın dışa aktarımı (daire + borç kalemleri).
 * İlk örnek Yönetimcell'in "Taşınmazların borçlandırma seçeneklerine göre
 * durumu" raporunun yapısı: `.xls` uzantılı HTML, künye satırı, başlık,
 * birleşik hücreli "(TOPLAM)" satırı.
 */
function yonetimcellHtml(): Uint8Array {
  const row = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  const html =
    "﻿<html lang=\"tr\"><head><meta charset=\"utf-8\" /></head><body><table>" +
    `<tr><td colspan="7">ÖRNEK SİTESİ YÖNETİMİ<br>( TAŞINMAZLARIN BORÇLANDIRMA SEÇENEKLERİNE GÖRE DURUMU<br>GECİKME BEDELİ EKLENMİŞ TOPLAM BORÇ TUTARI (08-10-2026) )</td></tr>` +
    `<tr><th>BLOK</th><th>NO</th><th>DEVREDEN</th><th>AİDAT</th><th>YAKIT</th><th>DEMİRBAŞ</th><th>TOPLAM</th></tr>` +
    row(["A BLOK", "1", "0,00", "5.925,00", "750,00", "1.200,00", "7.875,00"]) +
    row(["A BLOK", "2", "100,00", "0,00", "0,00", "414,66", "514,66"]) +
    row(["B BLOK", "01", "0,00", "0,00", "0,00", "0,00", "0,00"]) +
    row(["C BLOK", "1", "-50,00", "750,00", "0,00", "0,00", "700,00"]) +
    `<tr><td colspan="2">(TOPLAM)</td><td>50,00</td><td>6.675,00</td><td>750,00</td><td>1.614,66</td><td>9.089,66</td></tr>` +
    "</table></body></html>";
  return new TextEncoder().encode(html);
}

describe("Yönetimcell borç durumu raporu (.xls kılıklı HTML)", () => {
  const table = readTable(yonetimcellHtml());
  const headerRow = findUnitHeaderRow(table.rows);
  const mapping = guessUnitMapping(table.rows[headerRow] ?? []);

  it("künyeyi değil başlık satırını bulur", () => {
    expect(table.format).toBe("html");
    expect(headerRow).toBe(1);
  });

  it("sütunları tahmin eder: karşılığı olmayan kalemler 'diğer', TOPLAM kontrol", () => {
    expect(mapping).toEqual({
      0: "block",
      1: "unit",
      2: "debtOther",
      3: "debtDues",
      4: "debtUtility",
      5: "debtOther",
      6: "total",
    });
    expect(validateUnitMapping(mapping)).toEqual([]);
  });

  const result = applyUnitMapping(table.rows, headerRow, mapping);

  it("toplam satırını daire saymaz", () => {
    expect(result.units.map((u) => `${u.blockName}/${u.number}`)).toEqual(["A BLOK/1", "A BLOK/2", "B BLOK/01", "C BLOK/1"]);
    expect(result.skipped).toBe(1);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("borç kalemlerini türe göre toplar, sütun adlarını korur", () => {
    const a2 = result.units[1]!;
    expect(a2.debts).toEqual([{ kind: "extra", amountMinor: 51_466, columns: ["DEVREDEN", "DEMİRBAŞ"] }]);
    const a1 = result.units[0]!;
    expect(a1.debts).toEqual([
      { kind: "dues", amountMinor: 592_500, columns: ["AİDAT"] },
      { kind: "utility", amountMinor: 75_000, columns: ["YAKIT"] },
      { kind: "extra", amountMinor: 120_000, columns: ["DEMİRBAŞ"] },
    ]);
    expect(result.units[2]!.debts).toEqual([]);
  });

  it("alacak bakiyesini borç yazmaz ama uyarıyla gösterir", () => {
    expect(result.units[3]!.debts).toEqual([{ kind: "dues", amountMinor: 75_000, columns: ["AİDAT"] }]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "credit_balance", unit: "C BLOK / 1", actualMinor: 5_000, severity: "warning" }),
    );
  });

  it("eşlenmemiş borç sütunu toplam kontrolüne takılır", () => {
    const withoutFixtures = { ...mapping, 5: "ignore" as const };
    const r = applyUnitMapping(table.rows, headerRow, withoutFixtures);
    expect(r.issues.filter((i) => i.code === "total_mismatch").map((i) => i.unit)).toEqual(["A BLOK / 1", "A BLOK / 2"]);
  });
});

describe("genel Excel/CSV", () => {
  it("gerçek xlsx: sayılar sayı, tek tutar sütunlu 'Toplam Borç' borcun kendisi", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Daire No", "Kat", "Brüt m2", "Arsa Payı", "Malik Adı Soyadı", "Malik Telefon", "Kiracı", "Toplam Borç"],
      [5, 2, 95.5, 0.041667, "Ali Veli", "0532 000 00 01", "", 1250],
      [6, 2, 110, 0.048, "Ayşe Yılmaz", "", "Can Demir", 0],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Daireler");
    const buf = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    const table = readTable(buf);
    const mapping = guessUnitMapping(table.rows[findUnitHeaderRow(table.rows)]!);
    expect(Object.values(mapping)).toEqual(["unit", "floor", "area", "landShare", "ownerName", "ownerPhone", "tenantName", "debtOther"]);
    const r = applyUnitMapping(table.rows, 0, mapping);
    expect(r.units[0]).toMatchObject({ number: "5", floor: 2, areaM2: 95.5, landShare: 0.041667, ownerName: "Ali Veli" });
    expect(r.units[0]!.debts).toEqual([{ kind: "extra", amountMinor: 125_000, columns: ["Toplam Borç"] }]);
    expect(r.units[1]).toMatchObject({ tenantName: "Can Demir", debts: [] });
  });

  it("CSV, Türkçe sayılar; daire sütunu yoksa eşleştirme eksik", () => {
    const csv = "Blok;Daire;Arsa Payı;Bakiye\nA;1;0,041667;1.250,50\nA;1;0;5";
    const table = readTable(new TextEncoder().encode(csv));
    const mapping = guessUnitMapping(table.rows[0]!);
    const r = applyUnitMapping(table.rows, 0, mapping);
    expect(r.units).toHaveLength(1);
    expect(r.units[0]!.landShare).toBeCloseTo(0.041667);
    expect(r.units[0]!.debts[0]!.amountMinor).toBe(125_050);
    expect(r.issues).toContainEqual(expect.objectContaining({ code: "duplicate_unit", severity: "error" }));
    expect(validateUnitMapping(guessUnitMapping(["Ad", "Soyad"] as Cell[]))).toEqual(["missing_unit"]);
  });

  it("okunamayan tutar satırı hata, boş daire uyarı", () => {
    const rows: Cell[][] = [["Daire", "Aidat"], ["1", "abc"], ["", "100"], [null, null]];
    const r = applyUnitMapping(rows, 0, guessUnitMapping(rows[0]!));
    expect(r.issues.map((i) => [i.code, i.severity])).toEqual([["bad_amount", "error"], ["empty_unit", "warning"]]);
    expect(r.skipped).toBe(1);
  });

  it("daire anahtarı: büyük/küçük harf ve baştaki sıfır fark etmez", () => {
    expect(unitKey("A Blok", "01")).toBe(unitKey("A BLOK", "1"));
    expect(unitKey("A Blok", "1")).not.toBe(unitKey("B Blok", "1"));
    expect(unitKey(null, "0")).toBe("#0");
  });
});
