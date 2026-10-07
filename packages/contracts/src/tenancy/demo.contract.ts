import { z } from "zod";

import { dateTime, uuid } from "../_shared/fields";

/**
 * Demo hesabı — landing'deki "Demo hesap iste" akışı ve platform ekranı.
 *
 * Akış: talep → onay e-postası (tek kullanımlık bağlantı) → bağlantı
 * tıklanınca worker demo siteyi üretir → giriş bilgileri e-postayla ve onay
 * ekranında → 24 saat sonra site bütün verisiyle silinir.
 */
export const DEMO_KINDS = ["manager", "company"] as const;
export const demoKind = z.enum(DEMO_KINDS);
export type DemoKind = z.infer<typeof demoKind>;

export const DEMO_STATUSES = [
  "pending",
  "provisioning",
  "ready",
  "failed",
  "purged",
  "cancelled",
] as const;
export const demoStatus = z.enum(DEMO_STATUSES);
export type DemoStatus = z.infer<typeof demoStatus>;

/** `POST /v1/demo-requests` */
export const demoRequestCreate = z.object({
  fullName: z.string().trim().min(3).max(160),
  phone: z.string().trim().min(10).max(20),
  email: z.string().trim().toLowerCase().email().max(255),
  kind: demoKind,
  /** KVKK aydınlatma + iletişim rızası — zorunlu. */
  consent: z.literal(true),
  /**
   * Bal küpü: ekranda görünmeyen alan. Dolu gelirse istek botun; yanıt yine
   * "gönderildi" döner ama hiçbir şey yapılmaz.
   */
  website: z.string().max(200).optional(),
});
export type DemoRequestCreate = z.infer<typeof demoRequestCreate>;

export const demoRequestCreateResult = z.object({
  status: z.literal("sent"),
});
export type DemoRequestCreateResult = z.infer<typeof demoRequestCreateResult>;

/** `POST /v1/demo-requests/confirm` ve `/status` — token gövdede (URL'de/log'da kalmasın). */
export const demoTokenBody = z.object({
  token: z.string().trim().min(20).max(200),
});
export type DemoTokenBody = z.infer<typeof demoTokenBody>;

export const demoStatusResult = z.object({
  status: demoStatus,
  kind: demoKind,
  fullName: z.string(),
  /** Hazırsa giriş bilgileri — yalnız onay bağlantısını elinde tutana. */
  loginEmail: z.string().nullable(),
  password: z.string().nullable(),
  expiresAt: dateTime.nullable(),
  sites: z.array(z.string()),
  /** Kullanıcıya gösterilebilir hata kodu (`failed`). */
  error: z.string().nullable(),
});
export type DemoStatusResult = z.infer<typeof demoStatusResult>;

/* ------------------------------------------------------------------ *
 * Platform (süper admin) — `/v1/panel/platform/demo-requests`
 * ------------------------------------------------------------------ */

export const platformDemoRow = z.object({
  id: uuid,
  code: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  kind: demoKind,
  status: demoStatus,
  ip: z.string().nullable(),
  loginEmail: z.string().nullable(),
  siteCount: z.number().int(),
  createdAt: dateTime,
  confirmedAt: dateTime.nullable(),
  readyAt: dateTime.nullable(),
  expiresAt: dateTime.nullable(),
  reminderSentAt: dateTime.nullable(),
  purgedAt: dateTime.nullable(),
  error: z.string().nullable(),
});
export type PlatformDemoRow = z.infer<typeof platformDemoRow>;

export const platformDemoList = z.object({
  rows: z.array(platformDemoRow),
  totals: z.object({
    live: z.number().int(),
    pending: z.number().int(),
    last7Days: z.number().int(),
    converted: z.number().int(),
  }),
  limits: z.object({
    maxLive: z.number().int(),
    perIpPerDay: z.number().int(),
    ttlHours: z.number().int(),
  }),
});
export type PlatformDemoList = z.infer<typeof platformDemoList>;

/** Elle silme — demo kodu yazılarak onaylanır (yanlış satırı silmeye karşı). */
export const platformDemoPurge = z.object({
  confirmCode: z.string().trim().min(4).max(12),
});
export type PlatformDemoPurge = z.infer<typeof platformDemoPurge>;

export const platformDemoPurgeResult = z.object({
  id: uuid,
  status: demoStatus,
  purgedTenants: z.number().int(),
});
export type PlatformDemoPurgeResult = z.infer<typeof platformDemoPurgeResult>;
