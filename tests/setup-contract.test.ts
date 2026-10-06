import { describe, expect, it } from "vitest";

import { setupTenant } from "@yonetim/contracts";

/** /kurulum formu şehir boşken `city: null` gönderiyordu; sözleşme null kabul etmez. */
describe("kurulum sözleşmesi", () => {
  const base = { propertyName: "Test Sitesi", propertyType: "apartment", unitCount: 10, generateUnits: false };

  it("şehir hiç gönderilmezse geçerli", () => {
    expect(setupTenant.safeParse(base).success).toBe(true);
  });

  it("şehir null gönderilirse reddedilir (formun hiç göndermemesi gerek)", () => {
    expect(setupTenant.safeParse({ ...base, city: null }).success).toBe(false);
  });
});
