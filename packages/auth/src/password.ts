import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;

/** scrypt ile parola hash'leme (Node yerleşik, ek bağımlılık yok). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const derived = await scrypt(password, Buffer.from(saltB64, "base64"), KEYLEN);
  const expected = Buffer.from(hashB64, "base64");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Parola gücü kontrolü — yönetici hesapları için zorunlu (Bölüm 14.2). */
export interface PasswordPolicyResult {
  ok: boolean;
  score: number;
  problems: string[];
}

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const problems: string[] = [];
  if (password.length < 10) problems.push("En az 10 karakter olmalı.");
  if (!/[a-zçğıöşü]/.test(password)) problems.push("Küçük harf içermeli.");
  if (!/[A-ZÇĞİÖŞÜ]/.test(password)) problems.push("Büyük harf içermeli.");
  if (!/\d/.test(password)) problems.push("Rakam içermeli.");
  if (/^(?:123456|password|sifre|qwerty|111111)/i.test(password)) {
    problems.push("Çok yaygın bir parola.");
  }
  const score = Math.max(0, 4 - problems.length);
  return { ok: problems.length === 0, score, problems };
}
