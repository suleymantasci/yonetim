"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { webLoginRequestResult, webLoginSession } from "@yonetim/contracts";
import { AppError } from "@yonetim/core";

import { apiPost } from "@/lib/api/server";
import { setSessionCookie } from "@/lib/session-cookie";

/**
 * Parolasız giriş — SPEC Bölüm 14.2 (magic link + SMS OTP).
 *
 * Kod üretimi, gönderimi ve oturum açma `apps/api`'de: oturumun tek otoritesi
 * orası (MIMARI-PLAN §8.1). Burada kalan iş sunum — form durumu, çeviri ve
 * çerezin yazılması.
 */
export interface LoginState {
  ok: boolean;
  step: "identify" | "verify";
  channel?: "email" | "sms";
  identifier?: string;
  message?: string;
}

const identifySchema = z.object({ identifier: z.string().min(5) });

export async function requestLoginCode(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const t = await getTranslations("app.login");
  const parsed = identifySchema.safeParse({
    identifier: String(formData.get("identifier") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, step: "identify", message: t("invalidIdentifier") };
  }

  let result;
  try {
    result = await apiPost(
      "/v1/auth/web/request",
      { identifier: parsed.data.identifier.trim(), locale: await getLocale() },
      webLoginRequestResult,
    );
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "rate_limited") {
        return { ok: false, step: "identify", message: t("tooManyAttempts") };
      }
      if (error.code === "validation") {
        return { ok: false, step: "identify", message: t("invalidIdentifier") };
      }
    }
    throw error;
  }

  return {
    ok: true,
    step: "verify",
    channel: result.channel,
    identifier: result.identifier,
    message: result.channel === "email" ? t("emailSent") : t("smsSent"),
  };
}

/** Giriş adımı 2 — kodu doğrular ve oturumu açar. */
export async function verifyLoginCode(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const t = await getTranslations("app.login");
  const identifier = String(formData.get("identifier") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("devam") ?? "/panel");

  if (!identifier || code.length < 4) {
    return { ok: false, step: "verify", identifier, message: t("codeIncomplete") };
  }

  let session;
  try {
    session = await apiPost(
      "/v1/auth/web/verify",
      { identifier, token: code },
      webLoginSession,
    );
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "rate_limited") {
        return {
          ok: false,
          step: "verify",
          identifier,
          message: t("tooManyCodeAttempts"),
        };
      }
      // Sunucu **kod** döndürüyor, metin değil: mesaj burada, kullanıcının
      // dilinde üretiliyor (SPEC 4.2).
      const reason = reasonOf(error.details);
      if (reason) {
        return {
          ok: false,
          step: "verify",
          identifier,
          message:
            reason === "userNotFound"
              ? t("userNotFound")
              : t(`tokenError.${reason}`),
        };
      }
    }
    throw error;
  }

  await setSessionCookie(session.sessionToken, session.expiresAt);

  // Açık yönlendirme koruması: yalnız kendi origin'imizdeki göreli adresler.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/panel");
}

function reasonOf(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const reason = (details as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}
