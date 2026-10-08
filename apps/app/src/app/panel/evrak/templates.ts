/**
 * Yazışma şablonları — yer tutucular ve varsayılan metinler.
 *
 * Metin yöneticinin: ekranda düzenlenir, sunucuda yalnız yer tutucular
 * doldurulur. Hukuki dayanak cümleleri KMK md.20 (ortak gidere katılma,
 * aylık %5 gecikme tazminatı) ve md.29 (genel kurul çağrısı) ile sınırlı;
 * avukatın göndereceği resmî ihtarnamenin yerini tutmaz.
 */
export const PLACEHOLDERS = ["ad", "daire", "tutar", "tarih", "sonOdeme", "site"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

/** `{ad}` → değer; tanınmayan yer tutucu olduğu gibi kalır (yazım hatası görünsün). */
export function fillTemplate(text: string, values: Partial<Record<Placeholder, string>>): string {
  return text.replace(/\{([a-zA-Z]+)\}/g, (whole, key: string) =>
    (PLACEHOLDERS as readonly string[]).includes(key) && values[key as Placeholder] !== undefined
      ? values[key as Placeholder]!
      : whole,
  );
}

export const NOTICE_KINDS = ["payment", "warning"] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

export const DEFAULT_NOTICE_TEXT: Record<NoticeKind, string> = {
  payment:
    "Sayın {ad},\n\n{site} {daire} numaralı bağımsız bölüme ait {tarih} itibarıyla ödenmemiş {tutar} tutarında borcunuz bulunmaktadır. Borç dökümü aşağıdadır.\n\nBorcunuzu en geç {sonOdeme} tarihine kadar yönetim hesabına ödemenizi rica ederiz. Ödeme yaptıysanız bu yazıyı dikkate almayınız.",
  warning:
    "Sayın {ad},\n\n634 sayılı Kat Mülkiyeti Kanunu'nun 20. maddesi uyarınca kat malikleri ve bağımsız bölümde oturanlar ortak giderlere katılmakla yükümlüdür. {site} {daire} numaralı bağımsız bölüme ait {tarih} itibarıyla {tutar} tutarındaki borcunuz ödenmemiştir.\n\nBorcunuzu {sonOdeme} tarihine kadar ödemediğiniz takdirde, KMK md.20 uyarınca işleyen gecikme tazminatı ve yargılama giderleriyle birlikte yasal yollara başvurulacağını bildiririz.",
};

export const DEFAULT_CALL_TEXT =
  "Sayın Kat Maliki,\n\n{site} kat malikleri kurulu, aşağıda yazılı gündemi görüşmek üzere toplanacaktır. Toplantıya bizzat ya da vekiliniz aracılığıyla katılmanızı rica ederiz.\n\nİlk toplantıda yeter sayı sağlanamazsa ikinci toplantı belirtilen tarihte aynı yerde yapılacaktır (KMK md.29–30).";
