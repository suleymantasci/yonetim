import { createHash, createHmac, randomInt } from "node:crypto";

/** SMS OTP + TOTP (2FA) — SPEC Bölüm 14.2. */

export function generateOtp(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, "0");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** RFC 6238 TOTP doğrulaması (Google Authenticator uyumlu). */
export function verifyTotp(secretBase32: string, code: string, window = 1, now = Date.now()): boolean {
  const counter = Math.floor(now / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    if (totpAt(secretBase32, counter + i) === code.trim()) return true;
  }
  return false;
}

export function totpAt(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(length = 20): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += B32_ALPHABET[randomInt(0, 32)];
  }
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpUri(params: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const q = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${q.toString()}`;
}
