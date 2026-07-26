import { siteConfig } from "@yonetim/config";

/**
 * Aydınlatma metni ve rıza şablonları — SPEC Bölüm 14.1.
 *
 * Hukuki metinler cümle cümle çevrilmez; her dil için ayrı, o dilde hukuken
 * doğru bir sürüm tutulur. Türkçe sürüm bağlayıcıdır (veri sorumlusu Türkiye'de
 * yerleşiktir); İngilizce sürüm bilgilendirme amaçlıdır ve metinde bu belirtilir.
 */
export const PRIVACY_NOTICE_VERSION = "1.0.0";

export interface PrivacyNoticeParams {
  tenantName: string;
  tenantAddress?: string;
  contactEmail?: string;
}

function privacyNoticeTr(params: PrivacyNoticeParams): string {
  const contact = params.contactEmail ?? siteConfig.brand.contact.email;
  return `# KİŞİSEL VERİLERİN KORUNMASI HAKKINDA AYDINLATMA METNİ

**Veri Sorumlusu:** ${params.tenantName}${params.tenantAddress ? ` (${params.tenantAddress})` : ""}
**Veri İşleyen:** ${siteConfig.brand.legalName} — ${siteConfig.domains.base}
**Sürüm:** ${PRIVACY_NOTICE_VERSION}

## 1. İşlenen Kişisel Veriler
Ad-soyad, T.C. kimlik numarası, iletişim bilgileri (telefon, e-posta), bağımsız bölüm
bilgisi, malik/kiracı durumu, aidat ve ödeme kayıtları, banka/IBAN bilgisi, talep ve
şikâyet kayıtları, uygulama kullanım kayıtları (IP, işlem logları).

## 2. İşleme Amaçları
634 sayılı Kat Mülkiyeti Kanunu kapsamında anagayrimenkulün yönetimi, aidat ve gider
paylaşımının hesaplanması ve tahsili, ortak alan hizmetlerinin yürütülmesi, toplantı ve
karar süreçlerinin yönetimi, hukuki takip, mevzuattan doğan saklama ve bildirim
yükümlülüklerinin yerine getirilmesi.

## 3. Hukuki Sebepler (KVKK md.5)
- Kanunlarda açıkça öngörülmesi (md.5/2-a) — Kat Mülkiyeti Kanunu,
- Sözleşmenin kurulması/ifası (md.5/2-c),
- Hukuki yükümlülüğün yerine getirilmesi (md.5/2-ç),
- Meşru menfaat (md.5/2-f) — ortak giderlerin tahsili,
- Açık rıza (md.5/1) — yalnızca pazarlama ve isteğe bağlı iletişim kanalları için.

## 4. Aktarım
Verileriniz; ödeme kuruluşları, SMS/WhatsApp altyapı sağlayıcıları, e-fatura entegratörü,
gerektiğinde avukat/icra daireleri ve yetkili kamu kurumları ile mevzuata uygun olarak
paylaşılır. Yurt dışına aktarım, KVKK md.9 kapsamında ve yalnızca gerekli hallerde yapılır.

## 5. Saklama Süreleri
- Aktif sakin kayıtları: ilişki süresince,
- İlişki sona erdikten sonra: ${siteConfig.legal.passiveResidentRetentionYears} yıl (yasal yükümlülükler),
- Mali kayıtlar: 5 yıl (VUK md.253),
- İşlem logları: ${siteConfig.legal.logRetentionDays} gün.
Süre sonunda veriler silinir veya anonim hale getirilir.

## 6. Haklarınız (KVKK md.11)
Kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini,
silinmesini isteme, işlemeye itiraz etme ve zararınızın giderilmesini talep etme
haklarına sahipsiniz. Talebinizi uygulama içindeki **KVKK Taleplerim** ekranından veya
${contact} adresinden iletebilirsiniz; başvurunuz en geç
${Math.round(siteConfig.legal.kvkkResponseHours / 24)} gün içinde sonuçlandırılır.

## 7. Güvenlik Tedbirleri (KVKK md.12)
Veriler aktarımda TLS 1.3, saklamada AES-256 ile şifrelenir; T.C. kimlik numarası ve IBAN
gibi alanlar alan bazlı şifreleme ile korunur. Erişimler yetki matrisine bağlıdır ve
denetim kütüğüne kaydedilir.`;
}

function privacyNoticeEn(params: PrivacyNoticeParams): string {
  const contact = params.contactEmail ?? siteConfig.brand.contact.email;
  return `# PRIVACY NOTICE ON THE PROCESSING OF PERSONAL DATA

**Data Controller:** ${params.tenantName}${params.tenantAddress ? ` (${params.tenantAddress})` : ""}
**Data Processor:** ${siteConfig.brand.legalName} — ${siteConfig.domains.base}
**Version:** ${PRIVACY_NOTICE_VERSION}

> This English text is provided for information only. The Turkish version is the
> binding one, as the data controller is established in Türkiye and the processing
> is governed by Law No. 6698 on the Protection of Personal Data (KVKK).

## 1. Personal data processed
Name and surname, Turkish ID number, contact details (phone, email), unit details,
owner/tenant status, dues and payment records, bank/IBAN details, service requests and
complaints, and application usage records (IP address, action logs).

## 2. Purposes of processing
Management of the property under the Condominium Act (Law No. 634), calculation and
collection of dues and shared expenses, operation of common area services, management of
meetings and resolutions, legal enforcement, and compliance with statutory retention and
notification duties.

## 3. Legal bases (KVKK art. 5)
- Expressly provided for by law (art. 5/2-a) — the Condominium Act,
- Necessary for the performance of a contract (art. 5/2-c),
- Compliance with a legal obligation (art. 5/2-ç),
- Legitimate interests (art. 5/2-f) — collection of shared expenses,
- Explicit consent (art. 5/1) — only for marketing and optional communication channels.

## 4. Transfers
Your data is shared, in accordance with the law, with payment institutions, SMS/WhatsApp
infrastructure providers, the e-invoice provider, and where necessary with lawyers,
enforcement offices and competent public authorities. Transfers abroad are made only where
necessary and within the scope of KVKK art. 9.

## 5. Retention periods
- Active resident records: for the duration of the relationship,
- After the relationship ends: ${siteConfig.legal.passiveResidentRetentionYears} years (statutory obligations),
- Financial records: 5 years (Tax Procedure Law art. 253),
- Action logs: ${siteConfig.legal.logRetentionDays} days.
At the end of the period, data is deleted or anonymised.

## 6. Your rights (KVKK art. 11)
You have the right to learn whether your personal data is processed, to request
information, rectification and erasure, to object to processing, and to claim
compensation for damages. You can submit a request from the **My data requests** screen in
the application or via ${contact}; your request is resolved within
${Math.round(siteConfig.legal.kvkkResponseHours / 24)} days at the latest.

## 7. Security measures (KVKK art. 12)
Data is encrypted with TLS 1.3 in transit and AES-256 at rest; fields such as the Turkish
ID number and IBAN are protected with field-level encryption. Access follows a permission
matrix and is written to the audit log.`;
}

const NOTICES: Record<string, (params: PrivacyNoticeParams) => string> = {
  tr: privacyNoticeTr,
  en: privacyNoticeEn,
};

/** Verilen dilde aydınlatma metnini üretir; bilinmeyen dil Türkçeye düşer. */
export function privacyNotice(params: PrivacyNoticeParams, locale = "tr"): string {
  return (NOTICES[locale] ?? privacyNoticeTr)(params);
}

/**
 * Rıza kalemleri. Etiket ve açıklamalar i18n katmanındadır:
 * `kvkk.consent.<kind>.label` ve `kvkk.consent.<kind>.description`.
 */
export const CONSENT_ITEMS = [
  { kind: "kvkk_aydinlatma", required: true },
  { kind: "acik_riza_zorunlu", required: true },
  { kind: "whatsapp_iletisim", required: false },
  { kind: "acik_riza_pazarlama", required: false },
] as const;

export type ConsentKind = (typeof CONSENT_ITEMS)[number]["kind"];

/**
 * Veri ihlali bildirim taslağı — KVKK md.12/5 (72 saat).
 * Bildirim Kurul'a Türkçe yapılır; bu nedenle metin yalnızca Türkçedir.
 */
export function breachNotificationDraft(params: {
  tenantName: string;
  detectedAt: Date;
  affectedCount: number;
  dataCategories: string[];
  mitigation: string;
}): string {
  return `KİŞİSEL VERİ İHLALİ BİLDİRİMİ

Veri Sorumlusu: ${params.tenantName}
İhlalin tespit edildiği tarih: ${params.detectedAt.toISOString()}
Etkilenen kişi sayısı (tahmini): ${params.affectedCount}
Etkilenen veri kategorileri: ${params.dataCategories.join(", ")}

Alınan tedbirler:
${params.mitigation}

Bu bildirim, 6698 sayılı Kanun'un 12/5. maddesi ve Kurul'un 24.01.2019 tarihli kararı
uyarınca, ihlalin öğrenildiği tarihten itibaren 72 saat içinde Kişisel Verileri Koruma
Kurulu'na yapılmak üzere hazırlanmıştır. İlgili kişilere bildirim en kısa sürede
gerçekleştirilecektir.`;
}
