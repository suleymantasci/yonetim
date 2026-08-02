import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Alan bazlı şifreleme — SPEC Bölüm 5.6.
 * TCKN, IBAN, telefon gibi hassas alanlar AES-256-GCM ile şifrelenir.
 * Anahtar tenant başına türetilir (HKDF-SHA256).
 *
 * M-6: Önceki sürüm tek-aşamalı `SHA-256(master ‖ "tenant:" ‖ tenantId)`
 * kullanıyordu. HKDF "extract + expand" ayrımı, info string ile
 * key/tenant çakışmasını önler. Master key yeterince entropik olduğu
 * sürece doğrudan saldırı zor, ancak KDF best-practice'e taşındı.
 */

const ALGO = "aes-256-gcm";
const VERSION = "v1";
/**
 * HKDF info string: tenantId'yi de içermek zorunda. Aksi halde aynı
 * masterKey ile farklı tenantId'ler aynı anahtarı türetir (HKDF-SHA256
 * expand'i tek PRK bloğunda info'dan bağımsız değil; tenantId info'da
 * olmalı).
 */
function tenantInfo(tenantId: string): Buffer {
  return Buffer.from(`yonetim:tenant-key:v1:${tenantId}`, "utf8");
}
function blindTenantInfo(tenantId: string): Buffer {
  return Buffer.from(`yonetim:blind-index:v1:${tenantId}`, "utf8");
}

function deriveKey(masterKeyHex: string, tenantId: string): Buffer {
  const master = Buffer.from(masterKeyHex, "hex");
  return Buffer.from(
    hkdfSync("sha256", master, Buffer.alloc(0), tenantInfo(tenantId), 32),
  ).subarray(0, 32);
}

export function encryptField(
  plaintext: string,
  masterKeyHex: string,
  tenantId: string,
): string {
  const key = deriveKey(masterKeyHex, tenantId);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptField(
  payload: string,
  masterKeyHex: string,
  tenantId: string,
): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("[crypto] Geçersiz şifreli alan formatı.");
  }
  const key = deriveKey(masterKeyHex, tenantId);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Aranabilir hash — eşitlik sorgusu gereken şifreli alanlar için (blind index).
 * M-7: Blind index tenant scope'a taşındı. Aynı değer farklı tenant'larda
 * farklı index üretir. Eski kullanım `masterKey` ile global'di; geriye
 * uyumluluk için signature korunuyor (`masterKeyHex`) ama implementasyon
 * tenantId parametresiyle HKDF kullanıyor.
 */
export function blindIndex(
  value: string,
  masterKeyHex: string,
  tenantId: string,
): string {
  const master = Buffer.from(masterKeyHex, "hex");
  // Tenant key — yukarıdaki deriveKey ile aynı HKDF yapısı.
  const tenantKey = Buffer.from(
    hkdfSync("sha256", master, Buffer.alloc(0), blindTenantInfo(tenantId), 32),
  ).subarray(0, 32);
  return createHash("sha256")
    .update(tenantKey)
    .update(Buffer.from(`tenant:${tenantId}:`))
    .update(value.trim().toLowerCase())
    .digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Kısa, okunabilir davet/promo kodu (karışabilen karakterler çıkarıldı). */
export function readableCode(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[buf[i]! % alphabet.length];
  }
  return out;
}
