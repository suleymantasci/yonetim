"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { mergePeoplePreview, type MergePeoplePreview } from "@yonetim/contracts";

import { apiGet, apiPost, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { reasonMessage } from "@/lib/form";

export async function previewMerge(
  source: string,
  target: string,
): Promise<{ ok: true; data: MergePeoplePreview } | { ok: false; message: string }> {
  await requirePermission("resident:write");
  const t = await getTranslations("app.dataTools");
  try {
    return { ok: true, data: await apiGet(`/v1/panel/data-tools/merge/preview?${toQuery({ source, target })}`, mergePeoplePreview) };
  } catch (error) {
    return { ok: false, message: (await reasonMessage(error)) ?? t("mergeFailed") };
  }
}

export async function mergePeople(source: string, target: string, reason: string): Promise<{ ok: boolean; message: string }> {
  await requirePermission("resident:write");
  const t = await getTranslations("app.dataTools");
  if (reason.trim().length < 10) return { ok: false, message: t("reasonShort") };
  try {
    const r = await apiPost("/v1/panel/data-tools/merge", { source, target, reason }, z.object({ moved: z.number() }));
    return { ok: true, message: t("merged", { count: r.moved }) };
  } catch (error) {
    return { ok: false, message: (await reasonMessage(error)) ?? t("mergeFailed") };
  }
}
