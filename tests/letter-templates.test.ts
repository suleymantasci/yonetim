import { describe, expect, it } from "vitest";

import { DEFAULT_NOTICE_TEXT, fillTemplate } from "../apps/app/src/app/panel/evrak/templates";

describe("yazışma şablonu", () => {
  it("yer tutucuları doldurur, tanınmayanı olduğu gibi bırakır", () => {
    expect(fillTemplate("Sayın {ad}, {daire} · {tutar} · {bilinmez}", { ad: "Ayşe", daire: "A / 1", tutar: "₺10,00" })).toBe(
      "Sayın Ayşe, A / 1 · ₺10,00 · {bilinmez}",
    );
  });

  it("varsayılan metinlerde doldurulmamış yer tutucu kalmaz", () => {
    const values = { ad: "x", daire: "x", tutar: "x", tarih: "x", sonOdeme: "x", site: "x" };
    for (const text of Object.values(DEFAULT_NOTICE_TEXT)) {
      expect(fillTemplate(text, values)).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });
});
