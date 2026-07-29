"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { announcementCreateResult } from "@yonetim/contracts";
import { filterContent, type FindingSeverity } from "@yonetim/kvkk";

import { apiPost } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";

/**
 * Duyuru oluşturma — SPEC Bölüm 6.4 (KVKK filtresi zorunlu).
 *
 * Doğrulama hataları ve bulgular **anahtar** olarak döner; metne çevirme
 * sunucuda `getTranslations` ile yapılır, böylece kullanıcının dili korunur.
 *
 * KVKK filtresi artık `apps/api`'de **kapı**: engellenen duyuru hiç
 * kaydedilmiyor. Buradaki şema yalnız formu doğruluyor.
 */
const schema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(10).max(4000),
  audience: z.enum([
    "all",
    "owners",
    "tenants",
    "block",
    "units",
    "new_residents",
  ]),
  channels: z.array(z.enum(["whatsapp", "sms", "email", "in_app"])).min(1),
  isUrgent: z.boolean().default(false),
  publish: z.boolean().default(true),
});

export interface AnnouncementFinding {
  severity: FindingSeverity;
  /** `kvkk.finding.<code>` altındaki mesaj/öneri çiftinin kodu. */
  code: string;
  match: string;
}

export interface AnnouncementState {
  ok: boolean;
  message?: string;
  /** Alan → çevrilmiş hata mesajları. */
  fieldErrors?: Record<string, string[]>;
  kvkk?: {
    blocked: boolean;
    score: number;
    findings: AnnouncementFinding[];
    requiresIndividual: boolean;
  };
}

export async function createAnnouncement(
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  const ctx = await requirePermission("announcement:write");
  const t = await getTranslations("app.announcements");

  const parsed = schema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    audience: formData.get("audience") ?? "all",
    channels: formData.getAll("channels"),
    isUrgent: formData.get("isUrgent") === "on",
    publish: formData.get("publish") !== "off",
  });

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string[]> = {};
    if (flat.title) fieldErrors.title = [t("titleTooShort")];
    if (flat.body) fieldErrors.body = [t("bodyTooShort")];
    if (flat.channels) fieldErrors.channels = [t("channelRequired")];
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;

  /*
   * Acil bayrağı ayrı yetki: sakinin kanal tercihini geçersiz kılıp tüm
   * kanalları açıyor. Sunucu da reddediyor; buradaki kontrol ham 403 yerine
   * anlaşılır bir mesaj vermek için — formu doldurmuş kullanıcıya "bilinmeyen
   * hata" demek, neyi düzelteceğini söylememek olurdu.
   */
  if (data.isUrgent && !can(ctx, "announcement:send_urgent")) {
    return { ok: false, message: t("urgentForbidden") };
  }

  const result = await apiPost(
    "/v1/panel/communication/announcements",
    {
      title: data.title,
      body: data.body,
      audience: data.audience,
      channels: data.channels,
      isUrgent: data.isUrgent,
      publish: data.publish,
    },
    announcementCreateResult,
  );

  const kvkk = {
    blocked: result.kvkk.blocked,
    score: result.kvkk.score,
    findings: result.kvkk.findings as AnnouncementFinding[],
    requiresIndividual: result.kvkk.requiresIndividual,
  };

  if (result.kvkk.blocked) {
    return { ok: false, message: t("blockedMessage"), kvkk };
  }

  revalidatePath("/panel/duyurular");

  return {
    ok: true,
    message: result.published
      ? // Nihai kanal listesi sunucudan: acil duyuruda override tüm kanalları
        // açtığı için formda seçilenle gönderilen ayrışabiliyor.
        t("publishedMessage", { channels: result.channels.join(", ") })
      : t("draftMessage"),
    kvkk,
  };
}

/** Yazarken canlı KVKK kontrolü (gönderim yapmadan). */
export async function checkAnnouncementKvkk(text: string): Promise<{
  blocked: boolean;
  score: number;
  findings: AnnouncementFinding[];
  redacted: string;
}> {
  await requirePermission("announcement:write");
  const result = filterContent(text);
  return {
    blocked: result.blocked,
    score: result.score,
    findings: result.findings.map((f) => ({
      severity: f.severity,
      code: f.code,
      match: f.match,
    })),
    redacted: result.redacted,
  };
}
