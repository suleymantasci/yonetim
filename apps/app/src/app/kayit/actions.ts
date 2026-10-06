"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { signupStartResult } from "@yonetim/contracts";
import { AppError } from "@yonetim/core";

import { apiPost } from "@/lib/api/server";

/**
 * Site / yönetim firması kaydı.
 *
 * `runAction` kullanılmıyor: o yardımcı oturum ve izin bekliyor, burada ikisi
 * de yok — kayıt olan kişinin tanımı gereği hesabı yok.
 *
 * Kayıt **oturum açmıyor**: sunucu doğrulama kodu gönderiyor, kullanıcı
 * `/giris/dogrula` ekranında kodu girerek içeri giriyor. Doğrulamasız site
 * açılabilseydi, başkasının e-postasıyla site açıp o kişiyi kilitlemek
 * mümkün olurdu.
 */
export interface SignupState {
  status: "idle" | "sent" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  channel?: "email" | "sms";
  identifier?: string;
  /**
   * Gönderilen değerler (parola hariç). React 19 başarısız/başarılı her
   * eylemden sonra uncontrolled formu sıfırlıyor; hata alan kullanıcı tüm
   * alanları yeniden yazmak zorunda kalıyordu. Parola bilerek geri
   * doldurulmuyor.
   */
  values?: Record<string, string>;
  /** Form her hatada bu değerle yeniden bağlanıyor ki `defaultValue` güncel olsun. */
  attempt?: number;
}

const schema = z.object({
  propertyName: z.string().trim().min(2).max(200),
  propertyType: z.enum([
    "apartment", "site", "residence", "plaza", "avm", "office", "vakif", "dernek",
  ]),
  city: z.string().trim().max(60).optional(),
  unitCount: z.coerce.number().int().min(1).max(10_000),
  companyName: z.string().trim().max(200).optional(),
  fullName: z.string().trim().min(2).max(160),
  identifier: z.string().trim().min(5).max(160),
  // Uzunluk burada, güç kuralı sunucuda: "büyük harf içermeli" gibi kuralların
  // kopyası panelde de dursaydı, ikisinden biri er ya da geç geride kalır ve
  // kullanıcı formu geçip sunucuda reddedilirdi.
  password: z.string().min(10).max(200),
  campaign: z.string().trim().max(60).optional(),
  migrationSource: z.string().trim().max(60).optional(),
  acceptedTerms: z.literal("on"),
});

export async function startSignup(
  previous: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const t = await getTranslations("app.signup");
  const echo = {
    values: echoValues(formData),
    attempt: (previous.attempt ?? 0) + 1,
  };

  const parsed = schema.safeParse({
    propertyName: formData.get("propertyName"),
    propertyType: formData.get("propertyType"),
    city: emptyToUndefined(formData.get("city")),
    unitCount: formData.get("unitCount"),
    // Yönetim firması seçili değilse ad gönderilmiyor: boş string sunucuya
    // "firma kaydı" sinyali verirdi.
    companyName:
      formData.get("accountType") === "company"
        ? emptyToUndefined(formData.get("companyName"))
        : undefined,
    fullName: formData.get("fullName"),
    identifier: formData.get("identifier"),
    password: formData.get("password"),
    campaign: emptyToUndefined(formData.get("campaign")),
    migrationSource: emptyToUndefined(formData.get("migrationSource")),
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
    return { status: "error", message: t("checkFields"), fieldErrors, ...echo };
  }

  const { acceptedTerms: _terms, ...input } = parsed.data;

  try {
    const result = await apiPost(
      "/v1/auth/signup",
      { ...input, acceptedTerms: true, locale: await getLocale() },
      signupStartResult,
    );
    return {
      status: "sent",
      channel: result.channel,
      identifier: result.identifier,
      message: result.channel === "email" ? t("emailSent") : t("smsSent"),
    };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "rate_limited") {
        return { status: "error", message: t("tooManyAttempts"), ...echo };
      }
      if (error.code === "validation") {
        // Güç kuralı yalnız sunucuda: reddi alan alanın altında göstermek,
        // kullanıcıya "hangi alan" sorusunu sordurmamak için.
        if (error.message === "weak_password") {
          return {
            status: "error",
            message: t("checkFields"),
            fieldErrors: { password: [t("weakPassword")] },
            ...echo,
          };
        }
        return { status: "error", message: t("invalidIdentifier"), ...echo };
      }
    }
    throw error;
  }
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? undefined : text;
}

const ECHO_FIELDS = [
  "accountType", "companyName", "propertyName", "propertyType", "city",
  "unitCount", "fullName", "identifier", "acceptedTerms",
] as const;

function echoValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ECHO_FIELDS) {
    const value = formData.get(key);
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
