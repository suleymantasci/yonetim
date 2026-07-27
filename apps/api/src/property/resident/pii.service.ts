import { Injectable, Logger } from "@nestjs/common";

import { maskIban, maskTckn } from "@yonetim/core";
import { blindIndex, decryptField, encryptField } from "@yonetim/core/crypto";

import { env } from "../../infra/config/env";

/**
 * Kişisel veri şifreleme köprüsü — SPEC 5.6, MIMARI-PLAN §9.1.
 *
 * A3'ün ASIL KAZANCI BURADA: bu dosya `apps/app/src/lib/pii.ts`'in yerini
 * alıyor ve `FIELD_ENCRYPTION_KEY` app konteynerinden **çıkıyor**. Bundan
 * sonra şifre çözme yalnız bu süreçte mümkün; render katmanı anahtarı
 * göremediği için "yanlışlıkla açık TCKN render etmek" fiziksel olarak
 * imkânsız hale geliyor — disiplinle değil, yetkiyle.
 *
 * HANGİ ALAN ŞİFRELENİR — ve neden hepsi değil (GAP-DURUM kararı 7):
 *
 *  - **TCKN → şifreli + blind index.** Hiçbir yerde açık gösterilmez.
 *    Eşitlik sorgusu (aynı kişi mi?) blind index ile yapılır.
 *  - **IBAN → şifreli + maskeli kopya + blind index.** Ekranda son 4 hane
 *    yeterli; mutabakat eşleştirmesi index ile.
 *  - **Telefon → ŞİFRELENMEZ.** Numara aynı zamanda giriş kimliğidir (OTP),
 *    `users.phone` üzerinde tekillik kısıtı vardır ve gelen WhatsApp/SMS
 *    webhook'u numarayı ters aramayla kullanıcıya bağlar. Şifreleme bu üçünü
 *    de kırardı; deterministik şifreleme ise faydayı sıfırlardı. Azaltıcı
 *    önlemler: okuma ucunda maskeleme, `data_access_logs` ve RLS.
 */
@Injectable()
export class PiiService {
  private readonly logger = new Logger(PiiService.name);

  private key(): string {
    return env().FIELD_ENCRYPTION_KEY;
  }

  /** TCKN'i şifreler ve blind index üretir. Geçersiz/boş değer `null`. */
  sealTckn(
    tckn: string | undefined,
    tenantId: string,
  ): { encrypted: string; index: string } | null {
    if (!tckn) return null;
    const digits = tckn.replace(/\D+/g, "");
    if (digits.length !== 11) return null;
    return {
      encrypted: encryptField(digits, this.key(), tenantId),
      index: blindIndex(digits, this.key()),
    };
  }

  /** IBAN'ı şifreler; maskeli kopya ve index birlikte döner. */
  sealIban(
    iban: string | undefined,
    tenantId: string,
  ): { encrypted: string; index: string; masked: string } | null {
    if (!iban) return null;
    const normalized = iban.replace(/\s+/g, "").toUpperCase();
    if (normalized.length < 15) return null;
    return {
      encrypted: encryptField(normalized, this.key(), tenantId),
      index: blindIndex(normalized, this.key()),
      masked: maskIban(normalized),
    };
  }

  /**
   * Şifreli alanı çözer.
   *
   * Anahtar döndürüldüyse veya kayıt başka tenant'ın anahtarıyla
   * şifrelendiyse `null` döner ve çağıran "gösterilemiyor" der. Fırlatmak,
   * tek bozuk kayıt yüzünden tüm sakin listesini düşürürdü.
   */
  open(payload: string | null, tenantId: string): string | null {
    if (!payload) return null;
    try {
      return decryptField(payload, this.key(), tenantId);
    } catch {
      this.logger.warn({ event: "pii.decrypt_failed", tenantId });
      return null;
    }
  }

  /**
   * Ekranda gösterim için: çözer ve maskeler.
   *
   * Uçtan dönen **tek** TCKN temsili budur. Çözülemeyen kayıt sabit maskeyle
   * döner: "kayıt var ama okunamıyor" ile "kayıt yok" ayrımı yöneticiye
   * anlamlı, açık değer ise hiçbir zaman gerekli değil.
   */
  revealTcknMasked(payload: string | null, tenantId: string): string | null {
    if (!payload) return null;
    const plain = this.open(payload, tenantId);
    return plain ? maskTckn(plain) : "•••••••••••";
  }

  /** Aynı TCKN'e sahip kayıt var mı sorgusu için index. */
  tcknLookupIndex(tckn: string): string {
    return blindIndex(tckn.replace(/\D+/g, ""), this.key());
  }
}
