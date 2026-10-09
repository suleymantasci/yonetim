import { z } from "zod";

import { moneyMinor, uuid } from "../_shared/fields";
import { memberScope } from "../_shared/member-scope";

/**
 * Toplu bildirim — Yönetimcell "Üyeler → toplu SMS / e-posta" ekranlarının
 * karşılığı. Kanallar: uygulama içi + e-posta (ücretsiz, hazır); SMS ve
 * WhatsApp entegrasyon açılınca (bkz. yapılacaklar §3).
 *
 *  - `text`: serbest metin
 *  - `debt`: borç durumu bildir (kişinin açık borcu, isteğe bağlı döküm)
 *  - `tenant_debt`: maliklere kiracı borcu bildir (kiracının açık borcu maliğe)
 *  - `login`: panele giriş bilgisi (telefon/e-posta ile kodla giriş bağlantısı)
 */
export const NOTICE_KINDS_BULK = ["text", "debt", "tenant_debt", "login"] as const;
export const BULK_CHANNELS = ["in_app", "email"] as const;
export const NOTICE_PLACEHOLDERS = ["ad", "daire", "borc", "kiraci", "site", "link"] as const;

export const bulkNoticeQuery = z.object({
  kind: z.enum(NOTICE_KINDS_BULK),
  member: memberScope.optional(),
  blockId: uuid.optional(),
  debtTypeId: uuid.optional(),
  /** Kalan borç alt sınırı (kuruş) — borç bildiriminde. */
  minTotal: z.coerce.number().int().min(0).optional(),
  /** Bu dönem ve öncesi (`YYYY-MM`). */
  periodUntil: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});
export type BulkNoticeQuery = z.infer<typeof bulkNoticeQuery>;

export const bulkNoticeRecipient = z.object({
  userId: uuid,
  name: z.string(),
  unitLabel: z.string(),
  hasEmail: z.boolean(),
  emailMasked: z.string().nullable(),
  debtMinor: moneyMinor,
  /** Kiracı borcu bildiriminde kiracının adı. */
  tenantName: z.string().nullable(),
});

export const bulkNoticePreview = z.object({ recipients: z.array(bulkNoticeRecipient) });
export type BulkNoticePreview = z.infer<typeof bulkNoticePreview>;

export const bulkNoticeSend = bulkNoticeQuery.extend({
  subject: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(4000),
  channels: z.array(z.enum(BULK_CHANNELS)).min(1),
  /** Seçilen alıcılar (önizlemeden); boşsa süzgecin tamamı. */
  userIds: z.array(uuid).max(2000).default([]),
  /** E-postaya açık borç dökümü tablosu eklensin (borç bildirimleri). */
  includeItems: z.coerce.boolean().default(false),
});
export type BulkNoticeSend = z.infer<typeof bulkNoticeSend>;

export const bulkNoticeResult = z.object({
  recipients: z.number().int(),
  inApp: z.number().int(),
  emailSent: z.number().int(),
  emailSkipped: z.number().int(),
  emailFailed: z.number().int(),
});
export type BulkNoticeResult = z.infer<typeof bulkNoticeResult>;

/** `{ad}` → değer; tanınmayan yer tutucu olduğu gibi kalır. */
export function fillNotice(
  text: string,
  values: Partial<Record<(typeof NOTICE_PLACEHOLDERS)[number], string>>,
): string {
  return text.replace(/\{([a-z]+)\}/g, (whole, key: string) =>
    (NOTICE_PLACEHOLDERS as readonly string[]).includes(key) &&
    values[key as (typeof NOTICE_PLACEHOLDERS)[number]] !== undefined
      ? values[key as (typeof NOTICE_PLACEHOLDERS)[number]]!
      : whole,
  );
}
