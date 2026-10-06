import { describe, expect, it } from "vitest";

import { parseAmount, parseDate, parseStatementCsv } from "@yonetim/bank";

describe("ekstre tutar ve tarih ayrıştırma", () => {
  it.each([
    ["1.234,56", 123_456],
    ["-1.234,56", -123_456],
    ["1234.56", 123_456],
    ["1,234.56", 123_456],
    ["12,5", 1_250],
    ["500", 50_000],
    ["1.234", 123_400], // Türkçe: nokta binliktir
    ["  ₺ 2.500,00 TL ", 250_000],
    ["0,05", 5],
  ])("%s → %s kuruş", (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it("tutar olmayan metni reddeder", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });

  it("tarih biçimleri ve taşan tarih", () => {
    expect(parseDate("05.10.2026")?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(parseDate("05/10/2026 14:30")?.toISOString()).toBe("2026-10-05T14:30:00.000Z");
    expect(parseDate("2026-10-05")?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(parseDate("31.02.2026")).toBeNull();
    expect(parseDate("yarın")).toBeNull();
  });
});

describe("ekstre CSV", () => {
  const signed = [
    "Tarih;Açıklama;Tutar;Karşı Taraf;IBAN;Referans",
    "05.10.2026;AIDAT DAIRE 12 EKIM;1.500,00;Ali Veli;TR330006100519786457841326;REF-1",
    "06.10.2026;ASANSOR BAKIM;-2.400,00;Asansör AŞ;;",
    "07.10.2026;\"HAVALE; DAIRE 5\";750,50;;;",
  ].join("\n");

  it("işaretli tutar sütununu yön ve kuruşa çevirir, tırnaklı ayracı korur", () => {
    const { rows, errors } = parseStatementCsv(signed);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ direction: "in", amountKurus: 150_000, externalId: "REF-1", counterparty: "Ali Veli" });
    expect(rows[1]).toMatchObject({ direction: "out", amountKurus: 240_000 });
    expect(rows[2]).toMatchObject({ direction: "in", amountKurus: 75_050, description: "HAVALE; DAIRE 5" });
  });

  it("Borç/Alacak sütunlu ekstreyi okur, başlıklar sıradan bağımsız", () => {
    // Virgül hem ayraç hem ondalık olabilir; burada ondalıksız tutarlarla sınıyoruz.
    const { rows } = parseStatementCsv(["Alacak,Borç,Tarih,Açıklama", "1000,,05.10.2026,A", ",250,06.10.2026,B"].join("\n"));
    expect(rows.map((r) => [r.direction, r.amountKurus])).toEqual([["in", 100_000], ["out", 25_000]]);
  });

  it("referans yoksa kimlik kararlı; aynı gün aynı tutarlı iki gerçek hareket ayrı kalır", () => {
    const csv = ["Tarih;Açıklama;Tutar", "05.10.2026;AIDAT;100,00", "05.10.2026;AIDAT;100,00"].join("\n");
    const a = parseStatementCsv(csv).rows;
    const b = parseStatementCsv(csv).rows;
    expect(a[0]!.externalId).not.toBe(a[1]!.externalId);
    expect(a.map((r) => r.externalId)).toEqual(b.map((r) => r.externalId));
  });

  it("hatalı satır dosyayı düşürmez, satır numarasıyla raporlanır", () => {
    const csv = ["Tarih;Açıklama;Tutar", "05.10.2026;İyi;10,00", "99.99.2026;Kötü tarih;10,00", "06.10.2026;Kötü tutar;abc", "07.10.2026;Sıfır;0,00"].join("\n");
    const { rows, errors } = parseStatementCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([
      { line: 3, reason: "bad_date" },
      { line: 4, reason: "bad_amount" },
      { line: 5, reason: "bad_amount" },
    ]);
  });

  it("zorunlu sütun yoksa açık hata verir", () => {
    expect(parseStatementCsv("Foo;Bar\n1;2").errors[0]).toEqual({ line: 1, reason: "missing_columns" });
    expect(parseStatementCsv("").errors[0]!.reason).toBe("missing_columns");
  });
});
