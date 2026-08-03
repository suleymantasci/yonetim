import { describe, expect, it } from "vitest";
import type { IncomingHttpHeaders } from "node:http";

import {
  buildSafeOrigins,
  isSafeCsrfRequest,
  requiresCookieCsrf,
} from "../apps/api/src/infra/security/csrf";

function request(input: {
  method: string;
  origin?: string;
  referer?: string;
  cookie?: string;
  authorization?: string;
}): { method: string; headers: IncomingHttpHeaders } {
  return {
    method: input.method,
    headers: {
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.referer ? { referer: input.referer } : {}),
      ...(input.cookie ? { cookie: input.cookie } : {}),
      ...(input.authorization ? { authorization: input.authorization } : {}),
    },
  };
}

describe("cookie-authenticated CSRF origin kararı", () => {
  it("session cookie + trusted Origin geçer", () => {
    expect(
      isSafeCsrfRequest(
        request({
          method: "POST",
          origin: "http://localhost:3001",
          cookie: "yonetim_session=x",
        }),
        new Set(["http://localhost:3001"]),
      ),
    ).toBe(true);
  });

  it("session cookie + kötü Origin reddedilir", () => {
    expect(
      isSafeCsrfRequest(
        request({
          method: "POST",
          origin: "https://evil.example",
          cookie: "yonetim_session=x",
        }),
        new Set(["http://localhost:3001"]),
      ),
    ).toBe(false);
  });

  it("session'sız public POST cookie-CSRF kapsamına girmez", () => {
    expect(requiresCookieCsrf(request({ method: "POST" }))).toBe(false);
  });

  it("Authorization POST cookie-CSRF kapsamına girmez", () => {
    expect(
      requiresCookieCsrf(
        request({
          method: "POST",
          authorization: "Bearer token",
          cookie: "yonetim_session=x",
        }),
      ),
    ).toBe(false);
  });

  it("Referer prefix taklidi kabul edilmez", () => {
    expect(
      isSafeCsrfRequest(
        request({
          method: "POST",
          referer: "https://panel.example.attacker.test/path",
          cookie: "yonetim_session=x",
        }),
        new Set(["https://panel.example"]),
      ),
    ).toBe(false);
  });

  it("development allowlist loopback web ve panel origin'lerini ekler", () => {
    const origins = buildSafeOrigins({
      corsOrigins: "",
      isProduction: false,
      port: 3100,
    });
    for (const origin of [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://localhost:3100",
      "https://localhost:3100",
    ]) {
      expect(origins.has(origin)).toBe(true);
    }
  });

  it("production allowlist loopback uygulama origin'lerini otomatik eklemez", () => {
    const origins = buildSafeOrigins({
      corsOrigins: "https://panel.example",
      isProduction: true,
      port: 3100,
    });
    expect(origins).toEqual(new Set(["https://panel.example"]));
  });
});
