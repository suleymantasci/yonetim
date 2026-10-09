import { describe, expect, it } from "vitest";

import { duePeriods } from "@yonetim/jobs";

const at = (iso: string) => new Date(iso);

describe("tekrarlayan fatura dönemleri", () => {
  const def = { startPeriod: "2026-08", endPeriod: null, lastPeriod: null, dayOfMonth: 15 };
  it("günü gelmemiş ay üretilmez, kaçırılan aylar üretilir", () => {
    expect(duePeriods(def, at("2026-10-10T09:00:00Z"))).toEqual(["2026-08", "2026-09"]);
    expect(duePeriods(def, at("2026-10-15T09:00:00Z"))).toEqual(["2026-08", "2026-09", "2026-10"]);
  });
  it("son üretilenden sonrası; bitiş dönemi sınırı", () => {
    expect(duePeriods({ ...def, lastPeriod: "2026-09" }, at("2026-10-20T09:00:00Z"))).toEqual(["2026-10"]);
    expect(duePeriods({ ...def, endPeriod: "2026-08" }, at("2026-12-20T09:00:00Z"))).toEqual(["2026-08"]);
    expect(duePeriods({ ...def, lastPeriod: "2026-10" }, at("2026-10-20T09:00:00Z"))).toEqual([]);
  });
  it("İstanbul günü: UTC 21:00 sonrası ertesi gün sayılır", () => {
    expect(duePeriods({ ...def, startPeriod: "2026-10", dayOfMonth: 1 }, at("2026-09-30T21:30:00Z"))).toEqual(["2026-10"]);
  });
  it("yıl dönümü", () => {
    expect(duePeriods({ ...def, startPeriod: "2026-12", dayOfMonth: 1 }, at("2027-01-02T09:00:00Z"))).toEqual(["2026-12", "2027-01"]);
  });
});
