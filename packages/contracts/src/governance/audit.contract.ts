import { z } from "zod";

import { dateTime, uuid } from "../_shared/fields";
import { listQuery, option, pageMeta } from "../_shared/list";

/**
 * Denetim kütüğü sözleşmesi — MIMARI-PLAN §6.4 `governance/audit`.
 *
 * Kütük **append-only**: DB trigger'ı UPDATE/DELETE'i engelliyor. Bu yüzden
 * burada bilinçli olarak **hiçbir yazma ucu yok** — kayıtlar yalnız ilgili
 * bağlamın servisi tarafından, iş akışının içinde yazılır (`AuditService`).
 * Dışarıya açık bir "denetim kaydı oluştur" ucu, kütüğün değerini sıfırlardı:
 * uyduran bir kayıt gerçek olanla ayırt edilemezdi.
 *
 * Ekran de aynı sebeple salt okunur ve sıralamayı değiştiremez.
 */

export const AUDIT_SORT_KEYS = ["createdAt"] as const;

export const auditListQuery = listQuery.extend({
  sort: z.enum(AUDIT_SORT_KEYS).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  /** Eylem türü (`debt_created` gibi) — facet listesinden seçilir. */
  action: z.string().trim().max(60).optional(),
  resource: z.string().trim().max(60).optional(),
  from: dateTime.optional(),
  to: dateTime.optional(),
});

export type AuditListQuery = z.infer<typeof auditListQuery>;

export const auditRow = z.object({
  id: uuid,
  action: z.string(),
  resource: z.string(),
  resourceId: uuid.nullable(),
  /**
   * Ham diff yalnız detayda; listede satır sayısı yeterli. Diff kişisel veri
   * içerebiliyor ve liste ekranı onu göstermek için yanlış yer.
   */
  changeCount: z.number().int(),
  reason: z.string().nullable(),
  ip: z.string().nullable(),
  actorName: z.string().nullable(),
  impersonatedBy: uuid.nullable(),
  createdAt: dateTime,
});

export type AuditRow = z.infer<typeof auditRow>;

export const auditListResponse = z.object({
  rows: z.array(auditRow),
  meta: pageMeta,
  facets: z.object({
    actions: z.array(option),
    resources: z.array(option),
  }),
  /** Saklama süresi (gün) — ekrandaki "ne kadar geriye gidebilir" notu için. */
  retentionDays: z.number().int(),
});

export type AuditListResponse = z.infer<typeof auditListResponse>;

export const auditDetail = auditRow.extend({
  diff: z.record(z.object({ from: z.unknown(), to: z.unknown() })).nullable(),
  userAgent: z.string().nullable(),
});

export type AuditDetail = z.infer<typeof auditDetail>;
