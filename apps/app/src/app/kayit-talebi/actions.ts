"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { accessRequestResult } from "@yonetim/contracts";

import { apiPost } from "@/lib/api/server";

/**
 * Sakin erişim talebi.
 *
 * Yanıt bilerek tek biçimli: site bulunamasa da, aynı talep zaten beklese de
 * kullanıcı aynı "iletildi" ekranını görüyor. Farklı mesaj vermek, formu
 * "bu sitede bu numara kayıtlı mı" sorusunun sorulabildiği bir yüzeye
 * çevirirdi.
 */
export interface AccessRequestState {
  status: "idle" | "sent" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

const schema = z.object({
  tenantSlug: z.string().trim().min(1).max(50),
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email().max(255).optional(),
  blockLabel: z.string().trim().max(60).optional(),
  unitLabel: z.string().trim().min(1).max(40),
  claimedRelation: z.enum(["owner", "tenant"]),
  note: z.string().trim().max(1000).optional(),
  acceptedTerms: z.literal("on"),
});

export async function submitAccessRequest(
  _previous: AccessRequestState,
  formData: FormData,
): Promise<AccessRequestState> {
  const t = await getTranslations("app.accessRequest");

  const parsed = schema.safeParse({
    tenantSlug: formData.get("tenantSlug"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    email: emptyToUndefined(formData.get("email")),
    blockLabel: emptyToUndefined(formData.get("blockLabel")),
    unitLabel: formData.get("unitLabel"),
    claimedRelation: formData.get("claimedRelation"),
    note: emptyToUndefined(formData.get("note")),
    acceptedTerms: formData.get("acceptedTerms"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      (fieldErrors[key] ??= []).push(
        key === "acceptedTerms" ? t("termsRequired") : t("invalidField"),
      );
    }
    return { status: "error", message: t("checkFields"), fieldErrors };
  }

  const { acceptedTerms: _terms, ...input } = parsed.data;

  await apiPost(
    "/v1/auth/access-request",
    { ...input, acceptedTerms: true },
    accessRequestResult,
  );

  return { status: "sent", message: t("sentBody") };
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? undefined : text;
}
