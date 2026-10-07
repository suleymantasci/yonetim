"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  demoRequestCreateResult,
  demoStatusResult,
  type DemoStatusResult,
} from "@yonetim/contracts";
import { AppError } from "@yonetim/core";

import { apiPost } from "@/lib/api/server";

/**
 * Demo hesabı — talep formu, onay ve durum.
 *
 * Oturum yok (ziyaretçi), bu yüzden `runAction` değil doğrudan `apiPost`.
 * Bütün kurallar (IP sınırı, eşzamanlı demo sınırı, geçici e-posta) API'de;
 * burada yalnız alan biçimi denetleniyor ve hata kodu Türkçe metne çevriliyor.
 */
export interface DemoRequestState {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
  fieldErrors?: Record<string, string[]>;
  values?: Record<string, string>;
  attempt?: number;
}

const schema = z.object({
  fullName: z.string().trim().min(3).max(160),
  phone: z.string().trim().min(10).max(20),
  email: z.string().trim().toLowerCase().email().max(255),
  kind: z.enum(["manager", "company"]),
  consent: z.literal("on"),
  website: z.string().max(200).optional(),
});

const ECHO = ["fullName", "phone", "email", "kind", "consent"] as const;

export async function requestDemo(previous: DemoRequestState, formData: FormData): Promise<DemoRequestState> {
  const t = await getTranslations("app.demo");
  const values: Record<string, string> = {};
  for (const key of ECHO) {
    const value = formData.get(key);
    if (typeof value === "string") values[key] = value;
  }
  const echo = { values, attempt: (previous.attempt ?? 0) + 1 };

  const parsed = schema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    kind: formData.get("kind"),
    consent: formData.get("consent"),
    website: (formData.get("website") as string | null) ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      const message =
        key === "consent" ? t("consentRequired") : key === "email" ? t("invalidEmail") : key === "phone" ? t("invalidPhone") : t("invalidField");
      (fieldErrors[key] ??= []).push(message);
    }
    return { status: "error", message: t("checkFields"), fieldErrors, ...echo };
  }

  try {
    await apiPost(
      "/v1/demo-requests",
      {
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        email: parsed.data.email,
        kind: parsed.data.kind,
        consent: true,
        website: parsed.data.website,
      },
      demoRequestCreateResult,
    );
    return { status: "sent", email: parsed.data.email };
  } catch (error) {
    const code = error instanceof AppError ? error.message : "";
    const known: Record<string, { message: string; field?: string }> = {
      invalid_phone: { message: t("invalidPhone"), field: "phone" },
      invalid_email: { message: t("invalidEmail"), field: "email" },
      disposable_email: { message: t("disposableEmail"), field: "email" },
      demo_ip_limit: { message: t("ipLimit") },
      demo_capacity: { message: t("capacity") },
      demo_disabled: { message: t("disabled") },
      mail_failed: { message: t("mailFailed") },
    };
    const hit = known[code];
    if (hit) {
      return {
        status: "error",
        message: hit.message,
        fieldErrors: hit.field ? { [hit.field]: [hit.message] } : undefined,
        ...echo,
      };
    }
    if (error instanceof AppError && error.code === "rate_limited") {
      return { status: "error", message: t("ipLimit"), ...echo };
    }
    return { status: "error", message: t("generic"), ...echo };
  }
}

export type DemoViewState =
  | { kind: "status"; data: DemoStatusResult }
  | { kind: "error"; code: "invalid" | "expired" | "capacity" | "generic" };

function toViewError(error: unknown): DemoViewState {
  const code = error instanceof AppError ? error.message : "";
  if (code === "demo_link_invalid") return { kind: "error", code: "invalid" };
  if (code === "demo_link_expired") return { kind: "error", code: "expired" };
  if (code === "demo_capacity") return { kind: "error", code: "capacity" };
  return { kind: "error", code: "generic" };
}

const tokenSchema = z.string().trim().min(20).max(200);

/** Onay bağlantısı — kurulumu başlatır (ya da mevcut durumu döner). */
export async function confirmDemo(token: string): Promise<DemoViewState> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { kind: "error", code: "invalid" };
  try {
    const data = await apiPost("/v1/demo-requests/confirm", { token: parsed.data }, demoStatusResult);
    return { kind: "status", data };
  } catch (error) {
    return toViewError(error);
  }
}

/** Hazırlanıyor ekranının yoklaması. */
export async function demoStatus(token: string): Promise<DemoViewState> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { kind: "error", code: "invalid" };
  try {
    const data = await apiPost("/v1/demo-requests/status", { token: parsed.data }, demoStatusResult);
    return { kind: "status", data };
  } catch (error) {
    return toViewError(error);
  }
}
