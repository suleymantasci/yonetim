import { serverEnv } from "@yonetim/config";
import { blindIndex, decryptField, encryptField } from "@yonetim/core/crypto";
import { maskIban, maskTckn } from "@yonetim/core";

/**
 * Kişisel veri şifreleme köprüsü — SPEC Bölüm 5.6, GAP 9.3.
 *
 * `packages/core/crypto` ham ilkelleri sağlar; buradaki sarmalayıcılar
 * anahtarı ve tenant'ı tek yerden bağlar, böylece çağıran taraf anahtar
 * yönetimiyle hiç uğraşmaz ve yanlış tenant anahtarıyla şifreleme
 * yapılamaz (anahtar tenant başına türetiliyor).
 *
 * HANGİ ALAN ŞİFRELENİR — ve neden hepsi değil:
 *
 * - **TCKN → şifreli + blind index.** Hiçbir yerde açık gösterilmez, yalnız
 *   maskeli. Eşitlik sorgusu (aynı kişi mi?) blind index ile yapılır.
 * - **IBAN → şifreli + maskeli kopya + blind index.** Ekranda son 4 hane
 *   yeterli; mutabakatta eşleştirme index ile yapılır.
 * - **Telefon → ŞİFRELENMEZ.** Bilinçli karar: telefon aynı zamanda giriş
 *   kimliğidir (OTP), `users.phone` üzerinde tekillik kısıtı vardır ve gelen
 *   WhatsApp/SMS webhook'u numarayı ters aramayla kullanıcıya bağlar.
 *   Şifreleme bu üçünü de kırardı (deterministik şifreleme ise şifrelemenin
 *   faydasını sıfırlardı). Azaltıcı önlemler: ekranda maskeleme, erişimin
 *   `data_access_logs`'a yazılması ve RLS.
 *
 * Şifresi çözülmüş değer **asla** istemciye gönderilmez; sunucu bileşeni
 * yalnız maskeli hali render eder.
 */

function key(): string {
  return serverEnv.encryptionKey();
}

export interface EncryptedField {
  encrypted: string;
  index: string;
}

/** TCKN'i şifreler ve blind index üretir. Geçersiz/boş değer `null` döner. */
export function sealTckn(tckn: string | undefined, tenantId: string): EncryptedField | null {
  if (!tckn) return null;
  const digits = tckn.replace(/\D+/g, "");
  if (digits.length !== 11) return null;
  return { encrypted: encryptField(digits, key(), tenantId), index: blindIndex(digits, key()) };
}

/** IBAN'ı şifreler; maskeli kopya ve index birlikte döner. */
export function sealIban(
  iban: string | undefined,
  tenantId: string,
): (EncryptedField & { masked: string }) | null {
  if (!iban) return null;
  const normalized = iban.replace(/\s+/g, "").toUpperCase();
  if (normalized.length < 15) return null;
  return {
    encrypted: encryptField(normalized, key(), tenantId),
    index: blindIndex(normalized, key()),
    masked: maskIban(normalized),
  };
}

/**
 * Şifreli alanı çözer. Anahtar döndürüldüyse veya kayıt başka tenant'ın
 * anahtarıyla şifrelendiyse çözme başarısız olur — bu durumda `null` döner
 * ve çağıran taraf "gösterilemiyor" der. Fırlatmak, tek bozuk kayıt yüzünden
 * tüm sakin listesini düşürürdü.
 */
export function openField(payload: string | null, tenantId: string): string | null {
  if (!payload) return null;
  try {
    return decryptField(payload, key(), tenantId);
  } catch {
    return null;
  }
}

/** Ekranda gösterim için: çözer ve maskeler. Çözülemezse sabit maske döner. */
export function revealTcknMasked(payload: string | null, tenantId: string): string | null {
  const plain = openField(payload, tenantId);
  return plain ? maskTckn(plain) : payload ? "•••••••••••" : null;
}

/** Aynı TCKN'e sahip kayıt var mı sorgusu için index üretir. */
export function tcknLookupIndex(tckn: string): string {
  return blindIndex(tckn.replace(/\D+/g, ""), key());
}
