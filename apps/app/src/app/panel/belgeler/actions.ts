"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  documentDownloadResult,
  documentUploadUrlResult,
} from "@yonetim/contracts";

import { apiDelete, apiGet, apiPost } from "@/lib/api/server";
import { okState, optionalText, requiredText, runAction, uuidField, type ActionState } from "@/lib/form";

/**
 * Belge yükleme köprüsü — PROJE-DURUMU §5.5.
 *
 * DOSYANIN KENDİSİ BURADAN GEÇMİYOR. Server action'a bir `File` verilse
 * Next.js onu sunucuya taşır, sunucu da R2'ye yeniden yükler: her yükleme iki
 * kat bant genişliği ve Node sürecinde onlarca megabaytlık bir tampon. Bunun
 * yerine tarayıcı imzalı adrese doğrudan yazıyor; bu dosyadaki iki eylem
 * yalnız **adresi** ve **kaydı** üretiyor.
 */
const uploadUrlSchema = z.object({
  fileName: requiredText(1, 255),
  contentType: requiredText(1, 120),
  sizeBytes: z.coerce.number().int().positive(),
});

export async function requestUploadUrl(
  _previous: ActionState<{ key: string; uploadUrl: string }>,
  formData: FormData,
): Promise<ActionState<{ key: string; uploadUrl: string }>> {
  return runAction(
    {
      permission: "document:write",
      schema: uploadUrlSchema,
      meta: { action: "document_upload_url", resource: "document" },
    },
    formData,
    async ({ input }) => {
      const result = await apiPost(
        "/v1/panel/documents/upload-url",
        input,
        documentUploadUrlResult,
      );
      return okState("", { data: { key: result.key, uploadUrl: result.uploadUrl } });
    },
  );
}

const createSchema = z.object({
  key: requiredText(1, 300),
  title: requiredText(1, 200),
  description: optionalText(2000),
  category: z.enum([
    "contract", "license", "meeting_minutes", "invoice", "maintenance_report",
    "management_plan", "insurance", "legal", "kvkk", "identity", "other",
  ]),
  visibility: z.enum(["managers", "owners", "residents"]),
  // Boş bırakılabilir: her belgenin son kullanma tarihi yok. Sigorta poliçesi
  // ve ruhsatın var, yönetim planının yok.
  expiresAt: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.date().optional(),
  ),
});

export async function createDocument(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "document:write",
      schema: createSchema,
      meta: { action: "document_created", resource: "document" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.documents");

      await apiPost(
        "/v1/panel/documents",
        {
          key: input.key,
          title: input.title,
          description: input.description ?? null,
          category: input.category,
          visibility: input.visibility,
          expiresAt: input.expiresAt ?? null,
        },
        z.object({ id: z.string().uuid() }),
      );

      return okState(t("uploaded"));
    },
  );
}

/**
 * İndirme adresi — her tıklamada yeniden imzalanıyor.
 *
 * Adres listeyle birlikte gönderilseydi sayfa kaynağında onlarca imzalı bağlantı
 * dururdu; dakikalar sonra hepsi ölü, ama o dakikalar içinde paylaşılabilir.
 */
export async function documentDownloadUrl(
  _previous: ActionState<{ url: string }>,
  formData: FormData,
): Promise<ActionState<{ url: string }>> {
  return runAction(
    {
      permission: "document:read",
      schema: z.object({ id: uuidField }),
      meta: { action: "document_download", resource: "document" },
    },
    formData,
    async ({ input }) => {
      /*
       * `apiGet` render içi `cache()`'li; burada sorun değil çünkü her
       * eylem çağrısı yeni bir istek bağlamı. Aynı render içinde iki kez
       * indirilmiyor zaten.
       */
      const result = await apiGet(
        `/v1/panel/documents/${input.id}/download`,
        documentDownloadResult,
      );
      return okState("", { data: { url: result.url } });
    },
  );
}

export async function removeDocument(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "document:write",
      schema: z.object({ id: uuidField }),
      meta: { action: "document_deleted", resource: "document" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.documents");
      await apiDelete(`/v1/panel/documents/${input.id}`);
      return okState(t("removed"));
    },
  );
}
