import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options?: { N?: number; r?: number; p?: number; maxmem?: number },
) => Promise<Buffer>;

// L-15: scrypt parametreleri açıkça set ediliyor. N=2^15 OWASP 2024 önerisi.
// Format `v1$N$r$p$...` — eski `scrypt$...` hash'leri geriye uyumlu parse edilir
// (varsayılan N/r/p uygulanır).
const VERSION = "v1";
const N = 1 << 15; // 32768
const R = 8;
const P = 1;
const MAXMEM = 64 * 1024 * 1024; // 64 MB
const KEYLEN = 64;

export const HASH_VERSION: "v1" = VERSION;

/** scrypt ile parola hash'leme. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return `${VERSION}$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  // L-15: Eski format `scrypt$salt$hash` (parametre yok) ve yeni format
  // `v1$N$r$p$salt$hash` kabul edilir; geriye uyumluluk korunur.
  const parts = stored.split("$");
  let saltB64: string;
  let hashB64: string;
  let opts: { N?: number; r?: number; p?: number; maxmem?: number } | undefined;
  if (parts.length === 3 && parts[0] === "scrypt") {
    [saltB64, hashB64] = [parts[1]!, parts[2]!];
  } else if (parts.length === 6 && parts[0] === VERSION) {
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
      return false;
    }
    saltB64 = parts[4]!;
    hashB64 = parts[5]!;
    opts = { N: n, r, p, maxmem: MAXMEM };
  } else {
    return false;
  }
  if (!saltB64 || !hashB64) return false;
  const derived = await scrypt(
    password,
    Buffer.from(saltB64, "base64"),
    KEYLEN,
    opts,
  );
  const expected = Buffer.from(hashB64, "base64");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Kullanıcı bulunamadığında da parola doğrulamış gibi zaman harcatır.
 *
 * NEDEN GEREKLİ: `verifyPassword` scrypt çalıştırıyor ve bu ~100 ms sürüyor.
 * Kullanıcı yoksa doğrudan "geçersiz" dönmek, cevabın **hızlı** gelmesi
 * demekti — yani giriş ucu, yanıt süresine bakarak "bu e-posta kayıtlı mı"
 * sorusunun sorulabildiği bir yüzeye dönüşürdü. Kullanıcı sayımına (enumeration)
 * karşı alınan bütün önlemler (aynı mesaj, aynı durum kodu) bu kanaldan
 * sızardı.
 *
 * Sabit bir hash'e karşı çalışıyor: parolanın kendisi girdi olduğu için maliyet
 * gerçek doğrulamayla aynı, ama sonucu her zaman `false`.
 */
let dummyHash: Promise<string> | undefined;

export async function burnPasswordTime(password: string): Promise<false> {
  // Hash elle yazılmıyor, ilk çağrıda üretiliyor: elle yazılmış bir dize
  // biçim değişirse sessizce "geçersiz format" dalına düşer ve scrypt hiç
  // çalışmazdı — yani önlem, koruduğu şeyi ölçmeden ortadan kalkardı.
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  await verifyPassword(password, await dummyHash);
  return false;
}

/** Parola gücü kontrolü — yönetici hesapları için zorunlu (Bölüm 14.2). */
export interface PasswordPolicyResult {
  ok: boolean;
  score: number;
  problems: string[];
}

/**
 * M-44: Bilinen / sık kullanılan parolaların küçük bir blocklist'i. Tam
 * HIBP API entegrasyonu (k-anonymity modeli) ileride eklenebilir; bu liste
 * OWASP "top breached passwords" özetinden alınmıştır ve minimum savunma.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "sifre",
  "qwerty",
  "111111",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "abc123",
  "admin",
  "welcome",
  "letmein",
  "iloveyou",
  "monkey",
  "dragon",
  "master",
  "passw0rd",
  "p@ssword",
  "password1",
  "123123",
  "qazwsx",
  "asdf",
  "asdfgh",
  "zxcvbn",
  "000000",
  "11111111",
  "1234",
  "12345",
  "654321",
]);

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const problems: string[] = [];
  if (password.length < 10) problems.push("En az 10 karakter olmalı.");
  if (!/[a-zçğıöşü]/.test(password)) problems.push("Küçük harf içermeli.");
  if (!/[A-ZÇĞİÖŞÜ]/.test(password)) problems.push("Büyük harf içermeli.");
  if (!/\d/.test(password)) problems.push("Rakam içermeli.");
  if (/^(?:123456|password|sifre|qwerty|111111)/i.test(password)) {
    problems.push("Çok yaygın bir parola.");
  }
  // M-44: Tam blocklist kontrolü (prefix-only yetersiz).
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    problems.push("Çok yaygın bir parola.");
  }
  const score = Math.max(0, 4 - problems.length);
  return { ok: problems.length === 0, score, problems };
}

/**
 * M-44: Identity-parity kontrolü — parola kullanıcının e-posta, telefon veya
 * ad/soyadı içeriyorsa reddet. Varsa `false` döner.
 */
export function passwordContainsIdentity(
  password: string,
  identity: { email?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null },
): boolean {
  const lower = password.toLowerCase();
  if (identity.email) {
    const local = identity.email.split("@")[0]?.toLowerCase() ?? "";
    if (local.length >= 4 && lower.includes(local)) return true;
  }
  if (identity.phone) {
    const digits = identity.phone.replace(/\D/g, "");
    if (digits.length >= 6 && lower.includes(digits)) return true;
  }
  for (const part of [identity.firstName, identity.lastName]) {
    if (!part) continue;
    const norm = part.toLowerCase().replace(/[^a-zçğıöşü]/g, "");
    if (norm.length >= 4 && lower.includes(norm)) return true;
  }
  return false;
}
