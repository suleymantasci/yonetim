import { describe, expect, it } from "vitest";

import { buildDebtMatrix, valueOf, type MatrixInputRow } from "../apps/api/src/finance/debt-report/matrix";

const row = (p: Partial<MatrixInputRow>): MatrixInputRow => ({
  key: "u1", label: "A / 1", sub: null, bucket: "2026-03", amount: 10_000, lateFee: 500, paid: 4_000, closed: false, ...p,
});

describe("dönem matrisi", () => {
  it("kalan: gecikme dahil / anapara; silinen borçta sıfır", () => {
    const opts = { year: 2026, value: "remaining" as const, lateFee: true };
    expect(valueOf(row({}), opts)).toBe(6_500);
    expect(valueOf(row({}), { ...opts, lateFee: false })).toBe(6_000);
    expect(valueOf(row({ closed: true }), opts)).toBe(0);
    expect(valueOf(row({ paid: 12_000 }), { ...opts, lateFee: false })).toBe(0);
  });

  it("tahakkuk ve ödenen", () => {
    expect(valueOf(row({}), { year: 2026, value: "charged", lateFee: false })).toBe(10_000);
    expect(valueOf(row({}), { year: 2026, value: "charged", lateFee: true })).toBe(10_500);
    expect(valueOf(row({}), { year: 2026, value: "paid", lateFee: true })).toBe(4_000);
  });

  it("aylar, devreden ve sonraki sütunlar; toplamlar; sıfır satır düşer", () => {
    const m = buildDebtMatrix(
      [
        row({ bucket: "2025-12" }),
        row({ bucket: "2026-01" }),
        row({ bucket: "2026-01" }),
        row({ bucket: "2027-02" }),
        row({ key: "u2", label: "A / 2", bucket: "2026-12", paid: 10_500 }),
        row({ key: "u10", label: "A / 10", bucket: "2026-06" }),
      ],
      { year: 2026, value: "remaining", lateFee: true },
    );
    expect(m.rows.map((r) => r.label)).toEqual(["A / 1", "A / 10"]);
    const u1 = m.rows[0]!;
    expect(u1.beforeMinor).toBe(6_500);
    expect(u1.months[0]).toBe(13_000);
    expect(u1.afterMinor).toBe(6_500);
    expect(u1.totalMinor).toBe(26_000);
    expect(m.totals.months[5]).toBe(6_500);
    expect(m.totals.totalMinor).toBe(32_500);
  });
});
