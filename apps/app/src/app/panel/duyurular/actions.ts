"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { announcements, withTenant } from "@yonetim/db";
import { filterContent, requiresIndividualDelivery, type FindingSeverity } from "@yonetim/kvkk";

import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/context";

/**
 * Duyuru oluşturma — SPEC Bölüm 6.4 (KVKK filtresi zorunlu).
 *
 * Doğrulama hataları ve bulgular **anahtar** olarak döner; metne çevirme
 * sunucuda `getTranslations` ile yapılır, böylece kullanıcının dili korunur.
 */
const schema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(10).max(4000),
  audience: z.enum(["all", "owners", "tenants", "block", "units", "new_residents"]),
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

  if (data.isUrgent) {
    // Acil durum override tüm kanalları açar (Bölüm 6.4).
    const set = new Set(data.channels);
    for (const c of ["whatsapp", "sms", "email", "in_app"] as const) set.add(c);
    data.channels = [...set] as typeof data.channels;
  }

  const filtered = filterContent(`${data.title}\n${data.body}`);
  const kvkk = {
    blocked: filtered.blocked,
    score: filtered.score,
    findings: filtered.findings.map((f) => ({
      severity: f.severity,
      code: f.code,
      match: f.match,
    })),
    requiresIndividual: requiresIndividualDelivery(filtered),
  };

  if (filtered.blocked) {
    await audit(ctx, {
      action: "announcement_blocked_kvkk",
      resource: "announcement",
      reason: filtered.findings.map((f) => f.code).join(","),
    });
    return { ok: false, message: t("blockedMessage"), kvkk };
  }

  const [created] = await withTenant(
    ctx.tenantId,
    async (tx) =>
      tx
        .insert(announcements)
        .values({
          tenantId: ctx.tenantId,
          title: data.title,
          body: data.body,
          audience: data.audience,
          channels: data.channels,
          isUrgent: data.isUrgent,
          publishedAt: data.publish ? new Date() : null,
          kvkkFlagged: filtered.findings.length > 0,
          kvkkFindings: kvkk.findings,
          createdBy: ctx.userId,
        })
        .returning({ id: announcements.id }),
    { userId: ctx.userId },
  );

  await audit(ctx, {
    action: data.publish ? "announcement_published" : "announcement_drafted",
    resource: "announcement",
    resourceId: created?.id,
  });

  revalidatePath("/panel/duyurular");

  return {
    ok: true,
    message: data.publish
      ? t("publishedMessage", { channels: data.channels.join(", ") })
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
