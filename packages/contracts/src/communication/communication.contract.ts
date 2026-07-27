import { z } from "zod";

import { dateTime, uuid } from "../_shared/fields";

/**
 * `communication` bağlamı — duyuru, anket, mesaj, toplantı (MIMARI-PLAN §6.3).
 *
 * ORTAK ÖZELLİK: dördü de sakinle kurulan iletişimin kaydı ve üçü yasal
 * sonuç doğuruyor (KMK toplantı/karar defteri, anket oy ağırlıkları, KVKK
 * açısından mesaj içeriği). Bu yüzden hiçbiri "sadece bir liste" değil;
 * yanıtlar kararın **dayanağını** da taşıyor (yeter sayı, oy ağırlığı,
 * botun mu insanın mı cevapladığı).
 */

/* ------------------------------------------------------------------ *
 * Duyurular
 * ------------------------------------------------------------------ */

export const announcementRow = z.object({
  id: uuid,
  title: z.string(),
  body: z.string(),
  audience: z.string(),
  channels: z.array(z.string()),
  isUrgent: z.boolean(),
  scheduledAt: dateTime.nullable(),
  publishedAt: dateTime.nullable(),
  expiresAt: dateTime.nullable(),
  /**
   * KVKK tarayıcısı duyuru metninde kişisel veri bulduysa işaretli
   * (GAP 4.1.13). Bulgular listede değil detayda: liste ekranında ham
   * bulguyu göstermek, gizlenmesi gereken veriyi ikinci kez yaymak olurdu.
   */
  kvkkFlagged: z.boolean(),
  createdAt: dateTime,
});

export const announcementListResponse = z.object({
  rows: z.array(announcementRow),
  totals: z.object({
    published: z.number().int(),
    scheduled: z.number().int(),
    draft: z.number().int(),
    flagged: z.number().int(),
  }),
});

export type AnnouncementListResponse = z.infer<typeof announcementListResponse>;

/* ------------------------------------------------------------------ *
 * Anketler / oylama
 * ------------------------------------------------------------------ */

export const pollRow = z.object({
  id: uuid,
  question: z.string(),
  description: z.string().nullable(),
  options: z.array(z.unknown()),
  /** `equal` = daire başı bir oy, `land_share` = arsa payı ağırlıklı (KMK). */
  weightMode: z.string(),
  quorumRule: z.string(),
  visibility: z.string(),
  ownersOnly: z.boolean(),
  opensAt: dateTime,
  closesAt: dateTime,
  closedAt: dateTime.nullable(),
  resultJson: z.unknown().nullable(),
  /** Oylama şu anda açık mı — sunucu saatine göre. */
  isOpen: z.boolean(),
  voteCount: z.number().int(),
  createdAt: dateTime,
});

export const pollListResponse = z.object({
  rows: z.array(pollRow),
  totals: z.object({
    open: z.number().int(),
    closed: z.number().int(),
  }),
});

export type PollListResponse = z.infer<typeof pollListResponse>;

/* ------------------------------------------------------------------ *
 * Mesajlar (WhatsApp / SMS / uygulama içi)
 * ------------------------------------------------------------------ */

export const messageRow = z.object({
  id: uuid,
  channel: z.string(),
  /** `in` = sakinden geldi, `out` = sisteme gönderildi. */
  direction: z.string(),
  body: z.string().nullable(),
  intent: z.string().nullable(),
  intentConfidence: z.string().nullable(),
  handledByBot: z.boolean(),
  createdAt: dateTime,
});

export const messageListResponse = z.object({
  rows: z.array(messageRow),
  totals: z.object({
    inbound: z.number().int(),
    botHandled: z.number().int(),
    needsHuman: z.number().int(),
    /** Botun devraldığı gelen mesaj oranı (%) — otomasyonun gerçek etkisi. */
    botRatePct: z.number().int(),
  }),
});

export type MessageListResponse = z.infer<typeof messageListResponse>;

/* ------------------------------------------------------------------ *
 * Toplantılar ve karar defteri
 * ------------------------------------------------------------------ */

export const meetingDecisionRow = z.object({
  id: uuid,
  meetingId: uuid,
  decisionNo: z.number().int(),
  title: z.string(),
  body: z.string(),
  quorumRule: z.string(),
  votesFor: z.string(),
  votesAgainst: z.string(),
  abstentions: z.string(),
  passed: z.boolean(),
  /** Karar defteri sayfa numarası — KMK md.32 fiziki defterle eşleşme. */
  ledgerPageNo: z.number().int().nullable(),
});

export const meetingRow = z.object({
  id: uuid,
  title: z.string(),
  kind: z.string(),
  scheduledAt: dateTime,
  secondCallAt: dateTime.nullable(),
  location: z.string().nullable(),
  onlineUrl: z.string().nullable(),
  agenda: z.array(z.unknown()),
  attendanceShare: z.string().nullable(),
  quorumMet: z.boolean().nullable(),
  minutesUrl: z.string().nullable(),
  status: z.string(),
  decisions: z.array(meetingDecisionRow),
});

export const meetingListResponse = z.object({
  rows: z.array(meetingRow),
  totals: z.object({
    planned: z.number().int(),
    completed: z.number().int(),
    decisions: z.number().int(),
  }),
});

export type MeetingListResponse = z.infer<typeof meetingListResponse>;

/* ------------------------------------------------------------------ *
 * Duyuru oluşturma
 * ------------------------------------------------------------------ */

export const ANNOUNCEMENT_AUDIENCES = [
  "all",
  "owners",
  "tenants",
  "block",
  "units",
  "new_residents",
] as const;

export const ANNOUNCEMENT_CHANNELS = [
  "whatsapp",
  "sms",
  "email",
  "in_app",
] as const;

export const announcementCreate = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(4000),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).default("all"),
  channels: z.array(z.enum(ANNOUNCEMENT_CHANNELS)).min(1),
  isUrgent: z.coerce.boolean().default(false),
  publish: z.coerce.boolean().default(true),
});

export type AnnouncementCreate = z.infer<typeof announcementCreate>;

export const kvkkFinding = z.object({
  severity: z.string(),
  /** `kvkk.finding.<code>` altındaki mesaj/öneri çiftinin kodu. */
  code: z.string(),
  match: z.string(),
});

/**
 * KVKK tarama sonucu.
 *
 * Tarama **sunucuda** yapılıyor ve `blocked` bir uyarı değil **karar**:
 * engellenen duyuru hiç kaydedilmiyor. İstemcinin gönderdiği bir bayrağa
 * güvenseydik, filtreyi atlatmak isteyen bir istemci için kapı diye bir şey
 * kalmazdı. Panelde yazarken çalışan canlı kontrol aynı saf fonksiyonu
 * kullanıyor ama o yalnız önizleme.
 */
export const announcementCreateResult = z.object({
  id: uuid.nullable(),
  published: z.boolean(),
  kvkk: z.object({
    blocked: z.boolean(),
    score: z.number(),
    findings: z.array(kvkkFinding),
    /** Bireysel gönderim gerektiriyor mu (toplu kanal kapatılmalı). */
    requiresIndividual: z.boolean(),
  }),
  /** Acil durum override'ı kanalları genişlettiyse nihai liste. */
  channels: z.array(z.string()),
});

export type AnnouncementCreateResult = z.infer<typeof announcementCreateResult>;

/* ------------------------------------------------------------------ *
 * Uygulama içi bildirimler
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/panel/notifications` — kabuktaki bildirim merkezi.
 *
 * Yetki adı yok: kullanıcı yalnız **kendi** bildirimini görür ve işaretler,
 * sorgu `userId = ctx.userId` ile sınırlı. Ayrı bir izin adı üretmek yanlış
 * bir güvenlik hissi verirdi — kısıtlama izinde değil, sorgunun kendisinde.
 */
export const inAppNotificationRow = z.object({
  id: uuid,
  title: z.string(),
  body: z.string().nullable(),
  createdAt: dateTime,
  read: z.boolean(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
});

export const inAppNotificationList = z.object({
  items: z.array(inAppNotificationRow),
  unreadCount: z.number().int(),
});

export type InAppNotificationList = z.infer<typeof inAppNotificationList>;

/** Tek bildirim ya da tümü — `id` yoksa okunmamışların hepsi işaretlenir. */
export const notificationReadRequest = z.object({ id: uuid.nullish() });

export type NotificationReadRequest = z.infer<typeof notificationReadRequest>;
