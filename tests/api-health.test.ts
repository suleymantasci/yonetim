import { describe, expect, it } from "vitest";

import { readinessStatus } from "../apps/api/src/infra/health/health.controller";

describe("API readiness status", () => {
  it("yalnız DB hazırsa degraded döner", () => {
    expect(readinessStatus(true, false)).toBe("degraded");
  });

  it("DB ve Redis hazırsa ok döner", () => {
    expect(readinessStatus(true, true)).toBe("ok");
  });

  it("DB yoksa degraded döner", () => {
    expect(readinessStatus(false, true)).toBe("degraded");
  });
});
