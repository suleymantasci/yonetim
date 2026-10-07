"use server";

import { z } from "zod";

import { hasPermission } from "@yonetim/auth/guard";
import { documentUploadUrlResult } from "@yonetim/contracts";

import { apiPost } from "@/lib/api/server";
import { requireContext } from "@/lib/context";

/**
 * Form eki yükleme — iki adım, dosya Server Action'dan **geçmiyor**.
 *
 * 1. `prepareAttachment`: imzalı yükleme adresi (Belgeler modülünün ucu).
 * 2. Tarayıcı dosyayı doğrudan depoya yazar.
 * 3. `finalizeAttachment`: Belgeler'de kayıt açar, `document:<id>` döner.
 *
 * DEPO YOKSA HATA YOK: `disabled` dönüyor ve form ek alanı boş olarak
 * kaydediliyor (vekil test ortamında R2 yok). Depo yapılandırıldığı anda
 * aynı kod hiçbir değişiklik olmadan çalışıyor. Yetkisi olmayan rol
 * (`document:write`) için de aynı: işini engellemek yerine eki atlıyoruz.
 */
export type PrepareResult =
  | { status: "ok"; key: string; uploadUrl: string }
  | { status: "disabled" }
  | { status: "error" };

const prepareSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().max(120),
  sizeBytes: z.number().int().positive(),
});

export async function prepareAttachment(input: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<PrepareResult> {
  const ctx = await requireContext().catch(() => null);
  if (!ctx || !hasPermission(ctx.roles, "document:write")) return { status: "disabled" };
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { status: "error" };

  try {
    const signed = await apiPost(
      "/v1/panel/documents/upload-url",
      parsed.data,
      documentUploadUrlResult,
    );
    return { status: "ok", key: signed.key, uploadUrl: signed.uploadUrl };
  } catch (error) {
    if (JSON.stringify(serializable(error)).includes("storage_not_configured")) {
      return { status: "disabled" };
    }
    console.error("[attachment:prepare]", error);
    return { status: "error" };
  }
}

const CATEGORIES = [
  "contract", "license", "meeting_minutes", "invoice", "maintenance_report",
  "management_plan", "insurance", "legal", "kvkk", "identity", "other",
] as const;

const finalizeSchema = z.object({
  key: z.string().trim().min(1).max(300),
  title: z.string().trim().min(1).max(200),
  category: z.enum(CATEGORIES),
});

/** Yüklenen nesne için belge kaydı; dönen değer forma yazılacak referans. */
export async function finalizeAttachment(input: {
  key: string;
  title: string;
  category: (typeof CATEGORIES)[number];
}): Promise<{ status: "ok"; ref: string } | { status: "error" }> {
  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return { status: "error" };
  try {
    const created = await apiPost(
      "/v1/panel/documents",
      {
        key: parsed.data.key,
        title: parsed.data.title,
        category: parsed.data.category,
        visibility: "managers",
        description: null,
        expiresAt: null,
      },
      z.object({ id: z.string().uuid() }),
    );
    return { status: "ok", ref: `document:${created.id}` };
  } catch (error) {
    console.error("[attachment:finalize]", error);
    return { status: "error" };
  }
}

function serializable(error: unknown): unknown {
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; details?: unknown; code?: unknown };
    return { message: e.message, details: e.details, code: e.code };
  }
  return String(error);
}
