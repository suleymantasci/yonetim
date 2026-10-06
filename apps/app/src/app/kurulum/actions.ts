"use server";

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
  return submitSetup(formData, "/panel");
}

/**
 * Zaten sitesi olan yöneticinin ikinci/üçüncü sitesi (`/panel/portfoy/yeni`).
 * Aynı uç, aynı doğrulama; fark yalnız dönüş adresi. Deneme süresini yeni
 * site uzatmıyor — o kural API'de (`SignupService.trialEndFor`).
 */
export async function createAnotherTenant(
  _previous: SetupState,
  formData: FormData,
): Promise<SetupState> {
  return submitSetup(formData, "/panel/portfoy");
}

async function submitSetup(formData: FormData, returnTo: string): Promise<SetupState> {
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
        // Sözleşme `city`i `optional()` tanımlıyor, `null` kabul etmiyor: boş şehir
        // alanı hiç gönderilmeli (null göndermek 422 verip siteyi açtırmıyordu).
        ...(parsed.data.city ? { city: parsed.data.city } : {}),
        unitCount: parsed.data.unitCount,
        generateUnits: parsed.data.generateUnits,
      },
      setupTenantResult,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "unauthorized") {
      redirect("/giris?devam=/kurulum");
    }
    // Doğrulama/yetki hatası form içinde gösterilir; hata ekranı kullanıcıyı
    // formu yeniden doldurmaya zorluyordu.
    if (error instanceof AppError && (error.code === "validation" || error.code === "forbidden")) {
      return { status: "error", message: error.message };
    }
    throw error;
  }

  // Yeni site oturuma bağlandı; kabuk yeniden çözülmeli.
  redirect(returnTo);
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? undefined : text;
}
