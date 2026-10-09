import { describe, expect, it } from "vitest";

import { parseDay, parseExpenseFile } from "../apps/api/src/finance/expense/expense-file";

describe("gider dosyası", () => {
  it("başlık, tarih biçimleri, ödendi sütunu", () => {
    const r = parseExpenseFile([
      ["Ekim giderleri"],
      ["Tarih", "Gider Grubu", "Firma", "Açıklama", "Fatura No", "Tutar", "Ödendi"],
      ["05.10.2026", "Bakım Onarım", "Yıldız Asansör", "Asansör bakımı", "A-1", "1.250,00", "Evet"],
      [new Date("2026-10-07T00:00:00+03:00"), "", "", "Elektrik", null, 830.5, "hayır"],
      [46302, null, null, "Su", null, "100", ""],
      ["", "", "", "", "", "", ""],
    ]);
    expect(r.missing).toEqual([]);
    expect(r.rows).toEqual([
      { line: 3, date: "2026-10-05", description: "Asansör bakımı", amountMinor: 125_000, category: "Bakım Onarım", vendor: "Yıldız Asansör", invoiceNo: "A-1", paid: true },
      { line: 4, date: "2026-10-07", description: "Elektrik", amountMinor: 83_050, category: null, vendor: null, invoiceNo: null, paid: false },
      { line: 5, date: "2026-10-07", description: "Su", amountMinor: 10_000, category: null, vendor: null, invoiceNo: null, paid: null },
    ]);
  });
  it("geçersiz tarih ve eksik sütun", () => {
    expect(parseDay("31.02.2026")).toBeNull();
    expect(parseDay("2026-10-09")).toBe("2026-10-09");
    expect(parseExpenseFile([["Açıklama", "Tutar"]]).missing).toEqual(["date"]);
  });
});
