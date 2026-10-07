import { createHash, randomBytes } from "node:crypto";

import { serverEnv, siteConfig } from "@yonetim/config";
import { decryptField, encryptField } from "@yonetim/core/crypto";

import { env } from "../../infra/config/env";

/**
 * Demo akışının API ve worker tarafından ortak kullanılan küçük parçaları.
 */

/** Onay bağlantısının geçerlilik süresi. */
export const DEMO_TOKEN_TTL_MINUTES = 60;
/** Hatırlatma e-postası bitişe bu kadar saat kala gider. */
export const DEMO_REMINDER_HOURS = 3;
/** Kurulum bu süreyi aşarsa takılmış sayılır. */
export const DEMO_PROVISION_TIMEOUT_MINUTES = 10;
/** Başarısız kurulum en çok bu kadar kez denenir. */
export const DEMO_MAX_ATTEMPTS = 3;

export function demoSettings() {
  return serverEnv.demo();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** 6 karakterlik demo kodu — `demo-k7m2qa@…`, `demo-k7m2qa-yesilvadi`. */
export function newDemoCode(): string {
  const buf = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[buf[i]! % CODE_ALPHABET.length];
  return out;
}

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Okunaklı, karışmayan karakterlerle 14 haneli parola (`Xk7m-p2Qa-9hTz`). */
export function newDemoPassword(): string {
  const buf = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) out += "-";
    out += PASSWORD_ALPHABET[buf[i]! % PASSWORD_ALPHABET.length];
  }
  return out;
}

const scope = (requestId: string) => `demo-request:${requestId}`;

export function sealDemoPassword(password: string, requestId: string): string {
  return encryptField(password, env().FIELD_ENCRYPTION_KEY, scope(requestId));
}

export function openDemoPassword(sealed: string | null, requestId: string): string | null {
  if (!sealed) return null;
  try {
    return decryptField(sealed, env().FIELD_ENCRYPTION_KEY, scope(requestId));
  } catch {
    return null;
  }
}

export function loginEmailFor(code: string): string {
  return `demo-${code}@${demoSettings().emailDomain}`;
}

export function appUrl(path: string): string {
  return `${siteConfig.env.appUrl.replace(/\/$/, "")}${path}`;
}

/**
 * Tek kullanımlık / geçici e-posta servisleri. Liste kısa ve bilinçli: amaç
 * kapsamlı bir kara liste değil, otomatik demo toplayan betiklerin en sık
 * kullandığı alanları kesmek. Asıl sınır IP ve eşzamanlı demo limiti.
 */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "grr.la",
  "10minutemail.com", "10minutemail.net", "temp-mail.org", "tempmail.com", "tempmail.net",
  "yopmail.com", "yopmail.net", "trashmail.com", "trashmail.de", "getnada.com", "nada.email",
  "dispostable.com", "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mohmal.com",
  "emailondeck.com", "tempail.com", "minuteinbox.com", "mailnesia.com", "burnermail.io",
  "tempr.email", "discard.email", "mintemail.com", "spamgourmet.com", "mailcatch.com",
  "moakt.com", "tmpmail.org", "tmail.ws", "emailfake.com", "inboxkitten.com",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}

export function splitName(fullName: string): { firstName: string; lastName: string | null } {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  return { firstName: first ?? fullName.trim(), lastName: rest.join(" ") || null };
}

export function formatIstanbul(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
