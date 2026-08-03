import { describe, expect, it } from "vitest";

import { resolveApiOrigin } from "../apps/app/src/lib/api/server";

describe("server API origin forwarding", () => {
  it("gelen origin'i server API çağrısına taşır", () => {
    expect(
      resolveApiOrigin("http://localhost:3001", "https://panel.example"),
    ).toBe("http://localhost:3001");
  });

  it("origin yoksa yapılandırılmış panel origin'ine düşer", () => {
    expect(resolveApiOrigin(null, "https://panel.example")).toBe(
      "https://panel.example",
    );
  });

  it("iki değer de yoksa başlık üretmez", () => {
    expect(resolveApiOrigin(null, undefined)).toBeUndefined();
  });
});
