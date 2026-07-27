import { describe, expect, it } from "vitest";

import { signJwt, verifyJwt } from "../apps/api/src/identity/jwt.util";

/**
 * Mobil access/refresh token'ı elle yazılmış bir HS256 uygulaması kullanıyor
 * (MIMARI-PLAN §6.1 `mobile-auth`). Elle yazılan her kriptografi kanıt ister;
 * bu testler tam olarak o kanıtı veriyor: imza değiştirilemez, algoritma
 * düşürülemez, süresi geçmiş token kabul edilmez, tür karıştırılamaz.
 */
const SECRET = "test-secret-at-least-8";

describe("mobil JWT (apps/api identity)", () => {
  it("imzaladığını doğrular", () => {
    const token = signJwt({ sub: "u1", tid: "t1", typ: "access" }, SECRET, 60);
    const payload = verifyJwt(token, SECRET);
    expect(payload?.sub).toBe("u1");
    expect(payload?.tid).toBe("t1");
    expect(payload?.typ).toBe("access");
  });

  it("başka anahtarla imzalanmışı reddeder", () => {
    const token = signJwt({ sub: "u1", tid: "t1", typ: "access" }, SECRET, 60);
    expect(verifyJwt(token, "baska-secret-8")).toBeNull();
  });

  it("gövdesi değiştirilmiş token'ı reddeder", () => {
    const token = signJwt({ sub: "u1", tid: "t1", typ: "access" }, SECRET, 60);
    const [head, , mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin", tid: "t1", typ: "access", exp: 9e9 }))
      .toString("base64url");
    expect(verifyJwt(`${head}.${forged}.${mac}`, SECRET)).toBeNull();
  });

  it("alg=none saldırısına kapalı — algoritma başlıktan okunmuyor", () => {
    const head = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const claims = Buffer.from(
      JSON.stringify({ sub: "admin", tid: "t1", typ: "access", iat: 0, exp: 9e9 }),
    ).toString("base64url");
    expect(verifyJwt(`${head}.${claims}.`, SECRET)).toBeNull();
  });

  it("süresi dolmuş token'ı reddeder", () => {
    const token = signJwt({ sub: "u1", tid: "t1", typ: "access" }, SECRET, -1);
    expect(verifyJwt(token, SECRET)).toBeNull();
  });

  it("bilinmeyen tür taşıyan token'ı reddeder", () => {
    // Access token'ı refresh yerine kullanmayı guard ayrıca engelliyor; burada
    // tamamen tanınmayan bir tür de kabul edilmemeli.
    const token = signJwt(
      { sub: "u1", tid: "t1", typ: "admin" as unknown as "access" },
      SECRET,
      60,
    );
    expect(verifyJwt(token, SECRET)).toBeNull();
  });

  it("bozuk biçimli token'da çökmez", () => {
    for (const bad of ["", "a", "a.b", "a.b.c.d", "...."]) {
      expect(verifyJwt(bad, SECRET)).toBeNull();
    }
  });
});
