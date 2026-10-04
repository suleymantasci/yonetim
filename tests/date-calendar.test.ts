import { describe, expect, it } from "vitest";

import { addCalendarMonths } from "@yonetim/core";

describe("addCalendarMonths", () => {
  it("ay sonunu bir sonraki aya taşırmıyor", () => {
    expect(addCalendarMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addCalendarMonths(new Date("2028-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2028-02-29");
  });
  it("yıl sınırını aşıyor", () => {
    expect(addCalendarMonths(new Date("2026-11-15T00:00:00Z"), 12).toISOString().slice(0, 10)).toBe("2027-11-15");
    expect(addCalendarMonths(new Date("2026-10-05T00:00:00Z"), 3).toISOString().slice(0, 10)).toBe("2027-01-05");
  });
});
