import { describe, expect, it } from "vitest";

import { moneyToMinor, parseVendorFile, serialKey } from "../apps/api/src/operations/meter-vendor-file";

describe("okuma firması dosyası", () => {
  it("başlığı bulur, Türkçe sayı biçimini çözer", () => {
    const r = parseVendorFile([
      ["Ekim 2026 ısınma dökümü"],
      [],
      ["Daire", "Sayaç No", "Tüketim (kWh)", "Ödenecek Tutar"],
      ["A/1", "SN-001", 123.4, "1.234,56"],
      ["A/2", " sn 002 ", "", 980],
      ["", "", "", ""],
    ]);
    expect(r.missing).toEqual([]);
    expect(r.rows).toEqual([
      { line: 4, serialNo: "SN-001", consumption: "123.4", amountMinor: 123_456 },
      { line: 5, serialNo: "sn 002", consumption: null, amountMinor: 98_000 },
    ]);
    expect(serialKey("sn 002")).toBe("SN002");
  });
  it("eksik sütunu söyler", () => {
    expect(parseVendorFile([["Daire", "Tutar"]]).missing).toEqual(["serial"]);
    expect(moneyToMinor("12,5 TL")).toBe(1_250);
  });
});
