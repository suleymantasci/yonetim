"use server";

import { getTranslations } from "next-intl/server";

import {
  bulkNoticePreview,
  bulkNoticeQuery,
  bulkNoticeResult,
  bulkNoticeSend,
  type BulkNoticePreview,
  type BulkNoticeResult,
} from "@yonetim/contracts";

import { apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { reasonMessage } from "@/lib/form";

export async function previewNotice(
  input: unknown,
): Promise<{ ok: true; data: BulkNoticePreview } | { ok: false; message: string }> {
  await requirePermission("announcement:write");
  const t = await getTranslations("app.bulkNotice");
  const parsed = bulkNoticeQuery.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  try {
    return { ok: true, data: await apiPost("/v1/panel/notices/preview", parsed.data, bulkNoticePreview) };
  } catch (error) {
    return { ok: false, message: (await reasonMessage(error)) ?? t("failed") };
  }
}

export async function sendNotice(
  input: unknown,
): Promise<{ ok: true; data: BulkNoticeResult; message: string } | { ok: false; message: string }> {
  await requirePermission("announcement:write");
  const t = await getTranslations("app.bulkNotice");
  const parsed = bulkNoticeSend.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  try {
    const data = await apiPost("/v1/panel/notices/send", parsed.data, bulkNoticeResult);
    return {
      ok: true,
      data,
      message: t("sent", { recipients: data.recipients, inApp: data.inApp, email: data.emailSent }),
    };
  } catch (error) {
    return { ok: false, message: (await reasonMessage(error)) ?? t("failed") };
  }
}
