import { describe, expect, it } from "vitest";

import { cashDays } from "../apps/api/src/finance/reports/cash-days";

const e = (iso: string, lines: [string, number, number][]) => ({
  date: new Date(iso), order: 2, source: "payment" as const, sourceId: null, description: "",
  lines: lines.map(([code, debit, credit]) => ({ code, debit, credit })),
});

describe("kasa günlükleri", () => {
  const journal = {
    entries: [
      e("2026-10-01T09:00:00Z", [["100", 10_000, 0], ["120", 0, 10_000]]),
      e("2026-10-03T09:00:00Z", [["770.01", 2_500, 0], ["100", 0, 2_500]]),
      e("2026-10-03T10:00:00Z", [["102.01", 3_000, 0], ["100", 0, 3_000]]), // virman
      e("2026-10-04T22:30:00Z", [["100", 1_000, 0], ["602", 0, 1_000]]), // İstanbul 5 Ekim
    ],
  };
  it("devir, giren, çıkan, kalan; virman tüm kasalarda net sıfır", () => {
    const r = cashDays(journal, "2026-10-02", "2026-10-05");
    expect(r.openingMinor).toBe(10_000);
    expect(r.days.map((d) => [d.day, d.inMinor, d.outMinor, d.closingMinor])).toEqual([
      ["2026-10-02", 0, 0, 10_000],
      ["2026-10-03", 0, 2_500, 7_500],
      ["2026-10-04", 0, 0, 7_500],
      ["2026-10-05", 1_000, 0, 8_500],
    ]);
  });
  it("tek hesap: virman giriş/çıkış olarak görünür", () => {
    const r = cashDays(journal, "2026-10-03", "2026-10-03", "100");
    expect(r.days[0]).toMatchObject({ inMinor: 0, outMinor: 5_500, closingMinor: 4_500 });
    const bank = cashDays(journal, "2026-10-03", "2026-10-03", "102.01");
    expect(bank.days[0]).toMatchObject({ inMinor: 3_000, closingMinor: 3_000 });
  });
});
