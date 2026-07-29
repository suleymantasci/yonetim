"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { setupTenantResult } from "@yonetim/contracts";
import { AppError } from "@yonetim/core";

import { apiPost } from "@/lib/api/server";

/**
 * İlk site kurulumu.
 *
 * `requireContext()` sitesi olmayan kullanıcıyı zaten `/kurulum`'a
 * yönlendiriyordu ama ne sayfa ne uç vardı: üyeliği kaldırılan ya da kaydı
 * yarım kalan kullanıcı 404 görüyordu.
 *
 * `runAction` KULLANILAMAZ: o yardımcı `requirePermission()` → `requireContext()`
 * çağırıyor ve bu kullanıcının hiçbir sitede rolü yok — `requireContext()` onu
 * tekrar `/kurulum`'a yönlendirir, yani sonsuz döngü. Kapı zaten uçta: oturum
 * yoksa 401.
 */
export interface SetupState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

const schema = z.object({
  propertyName: z.string().trim().min(2).max(200),
  propertyType: z.enum([
    "apartment", "site", "residence", "plaza", "avm", "office", "vakif", "dernek",
  ]),
  city: z.string().trim().max(60).optional(),
  unitCount: z.coerce.number().int().min(1).max(10_000),
  generateUnits: z.boolean(),
});

export async function createFirstTenant(
  _previous: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const t = await getTranslations("app.setup");

  const parsed = schema.safeParse({
    propertyName: formData.get("propertyName"),
    propertyType: formData.get("propertyType"),
    city: emptyToUndefined(formData.get("city")),
    unitCount: formData.get("unitCount"),
    generateUnits: formData.get("generateUnits") === "on",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (fieldErrors[String(issue.path[0] ?? "form")] ??= []).push(t("invalidField"));
    }
    return { status: "error", message: t("checkFields"), fieldErrors };
  }

  try {
    await apiPost(
      "/v1/auth/setup",
      {
        propertyName: parsed.data.propertyName,
        propertyType: parsed.data.propertyType,
        city: parsed.data.city ?? null,
        unitCount: parsed.data.unitCount,
        generateUnits: parsed.data.generateUnits,
      },
      setupTenantResult,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "unauthorized") {
      redirect("/giris?devam=/kurulum");
    }
    throw error;
  }

  // Yeni site oturuma bağlandı; kabuk yeniden çözülmeli.
  revalidatePath("/panel", "layout");
  redirect("/panel");
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? undefined : text;
}
