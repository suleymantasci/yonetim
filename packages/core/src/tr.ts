/**
 * Türkiye'ye özgü doğrulayıcılar ve normalize ediciler.
 * (SPEC Bölüm 14.1 — TCKN/IBAN/telefon kişisel veri; Bölüm 5.6 — şifrelenerek saklanır.)
 */

/** TCKN algoritmik doğrulama (11 hane, kontrol basamakları). */
export function isValidTckn(value: string): boolean {
  const v = value.trim();
  if (!/^[1-9][0-9]{10}$/.test(v)) return false;
  const d = v.split("").map(Number) as number[];
  const odd = (d[0]! + d[2]! + d[4]! + d[6]! + d[8]!) * 7;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const digit10 = (odd - even) % 10;
  if (((digit10 + 10) % 10) !== d[9]!) return false;
  const sumFirst10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return sumFirst10 % 10 === d[10]!;
}

/** VKN (vergi kimlik no) — 10 hane, GİB algoritması. */
export function isValidVkn(value: string): boolean {
  const v = value.trim();
  if (!/^[0-9]{10}$/.test(v)) return false;
  const digits = v.split("").map(Number) as number[];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (digits[i]! + (10 - i)) % 10;
    if (tmp === 0) {
      sum += 9;
    } else {
      sum += (tmp * Math.pow(2, 10 - i)) % 9 || 9;
    }
  }
  const check = (10 - (sum % 10)) % 10;
  return check === digits[9]!;
}

/** IBAN mod-97 doğrulaması (TR için 26 hane). */
export function isValidIban(value: string): boolean {
  const iban = value.replace(/\s+/g, "").toUpperCase();
  if (!/^TR[0-9A-Z]{24}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of expanded) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

export function formatIban(value: string): string {
  const iban = value.replace(/\s+/g, "").toUpperCase();
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

/** Telefonu E.164 (+90XXXXXXXXXX) formatına normalize eder. Geçersizse null. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let d = digits.startsWith("+") ? digits.slice(1) : digits;
  if (d.startsWith("0090")) d = d.slice(4);
  else if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  if (!/^5[0-9]{9}$/.test(d)) {
    // Sabit hat da kabul: 2/3/4 ile başlayan 10 hane.
    if (!/^[2-4][0-9]{9}$/.test(d)) return null;
  }
  return `+90${d}`;
}

/**
 * Demo kişilerinin telefon aralığı: +90 500 … (500 hiçbir operatöre tahsis
 * edilmemiş). SMS/WhatsApp katmanı bu numaralara gönderim yapmaz.
 */
export function isDemoPhone(phone: string): boolean {
  const digits = phone.replace(/[^\d]/g, "");
  return /^(90)?0?500\d{7}$/.test(digits);
}

export function isMobilePhone(e164: string): boolean {
  return /^\+905[0-9]{9}$/.test(e164);
}

/** Görüntüleme için maskeleme (KVKK — Bölüm 14.1). */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return "***";
  return `${e164.slice(0, 6)}*** ${e164.slice(-2)}`;
}

export function maskTckn(tckn: string): string {
  if (tckn.length !== 11) return "***********";
  return `${tckn.slice(0, 3)}******${tckn.slice(-2)}`;
}

export function maskIban(iban: string): string {
  const v = iban.replace(/\s+/g, "");
  if (v.length < 10) return "****";
  return `${v.slice(0, 6)}${"*".repeat(v.length - 10)}${v.slice(-4)}`;
}

/** Türkçe karakterleri koruyarak slug üretir (tenant slug, blog slug). */
export function slugify(input: string): string {
  const map: Record<string, string> = {
    ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i", ö: "o", Ö: "o",
    ş: "s", Ş: "s", ü: "u", Ü: "u", â: "a", î: "i", û: "u",
  };
  return input
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Türkçe karakterleri ASCII'ye indirger ve küçük harfe çevirir.
 * Metin karşılaştırmalarında kullanılır: banka açıklamaları genellikle
 * ASCII-büyük harf gelir ("AYSE YILMAZ"), veritabanındaki ad ise "Ayşe Yılmaz"dır.
 */
export function foldTurkish(input: string): string {
  const map: Record<string, string> = {
    ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", I: "i", İ: "i", i: "i",
    ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
    â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u",
  };
  return input
    .normalize("NFC")
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .toLowerCase()
    // Birleşik aksan işaretlerini (örn. i̇) temizle.
    .replace(/[̀-ͯ]/g, "");
}

/** Türkçe büyük harf (i → İ). */
export function trUpper(input: string): string {
  return input.replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase();
}

/** Türkçe küçük harf (I → ı). */
export function trLower(input: string): string {
  return input.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
}
