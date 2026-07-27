import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Küçük bir HS256 JWT uygulaması — mobil access/refresh akışı için.
 *
 * Neden hazır kütüphane değil: ihtiyacımız tek algoritma (HS256), tek anahtar
 * ve üç claim. `jsonwebtoken` bunun için 300 kB bağımlılık ve `none` algoritması
 * gibi tarihsel tuzaklar getiriyor. Burada algoritma **sabit**: başlıktaki
 * `alg` alanı okunmuyor bile, doğrulama her zaman HS256 ile yapılıyor.
 */
export interface JwtPayload {
  /** Kullanıcı kimliği. */
  sub: string;
  /** Aktif tenant. */
  tid: string;
  /** Token türü — access token'ı refresh yerine kullanmak mümkün olmasın. */
  typ: "access" | "refresh";
  /** Oturum kaydı kimliği — iptal (revocation) bunun üzerinden çalışır. */
  sid?: string;
  iat: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(
    input.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64",
  );
}

function sign(data: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(data).digest());
}

export function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  secret: string,
  ttlSeconds: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const body: JwtPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify(body));
  const data = `${head}.${claims}`;
  return `${data}.${sign(data, secret)}`;
}

/** Geçersiz/süresi dolmuş token'da `null` — çağıran taraf 401'e çevirir. */
export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, claims, mac] = parts as [string, string, string];

  const expected = sign(`${head}.${claims}`, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      fromB64url(claims).toString("utf8"),
    ) as JwtPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now())
      return null;
    if (payload.typ !== "access" && payload.typ !== "refresh") return null;
    if (!payload.sub || !payload.tid) return null;
    return payload;
  } catch {
    return null;
  }
}
