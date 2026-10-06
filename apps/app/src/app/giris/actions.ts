"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  webLoginRequestResult,
  webLoginSession,
  webPasswordLoginResult,
} from "@yonetim/contracts";
import { AppError } from "@yonetim/core";

import { apiPost } from "@/lib/api/server";
import { setSessionCookie } from "@/lib/session-cookie";

/**
 * Giriş — SPEC Bölüm 14.2.
 *
 * İKİ AKIŞ VAR:
 *  1. **Parola** (`signIn`) — normal giriş. Sunucu `AUTH_OTP_ENABLED`
 *     kapalıysa oturumu hemen açıyor, açıksa kod istiyor (`verifyLoginOtp`).
 *  2. **Parolasız** (`requestLoginCode` + `verifyLoginCode`) — "parolamı
 *     bilmiyorum" kurtarması ve kayıt doğrulaması.
 *
 * İKİNCİ ADIMIN GEREKİP GEREKMEDİĞİNE BURASI KARAR VERMİYOR: yanıttaki
 * `status` alanına bakılıyor. Ayarı panele de okutmak, oturumun açılıp
 * açılmayacağını iki sürecin aynı değişkeni aynı anda doğru okumasına
 * bağlardı.
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

/** Parolalı giriş formunun durumu. */
export interface PasswordLoginState {
  ok: boolean;
  /** `password`: parola bekleniyor. `otp`: parola doğru, kod bekleniyor. */
  step: "password" | "otp";
  channel?: "email" | "sms";
  identifier?: string;
  message?: string;
}

const identifySchema = z.object({ identifier: z.string().min(5) });

const passwordSchema = z.object({
  identifier: z.string().trim().min(5).max(160),
  password: z.string().min(1).max(200),
});

/**
 * Adım 1 — parola.
 *
 * Başarıda ya doğrudan `/panel`'e gidiliyor ya da kod ekranına dönülüyor.
 * `redirect` bilerek `try` bloğunun **dışında**: Next yönlendirmeyi bir hata
 * fırlatarak yapıyor, `try` içinde olsaydı kendi `catch`'imiz onu yakalar ve
 * yönlendirme sessizce yutulurdu.
 */
export async function signIn(
  _prev: PasswordLoginState,
  formData: FormData,
): Promise<PasswordLoginState> {
  const t = await getTranslations("app.login");
  const next = String(formData.get("devam") ?? "/panel");

  const parsed = passwordSchema.safeParse({
    identifier: String(formData.get("identifier") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, step: "password", message: t("credentialsIncomplete") };
  }

  let result;
  try {
    result = await apiPost(
      "/v1/auth/web/password",
      {
        identifier: parsed.data.identifier,
        password: parsed.data.password,
        locale: await getLocale(),
      },
      webPasswordLoginResult,
    );
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "unauthorized") {
        // Kimlik yok, parola yok ve parola yanlış — üçü de burada aynı mesaj.
        // Ayırmak, giriş ekranını "bu e-posta kayıtlı mı" sorgusuna
        // çevirirdi.
        return { ok: false, step: "password", message: t("invalidCredentials") };
      }
      if (error.code === "rate_limited") {
        return { ok: false, step: "password", message: t("tooManyAttempts") };
      }
      if (error.code === "validation") {
        return { ok: false, step: "password", message: t("invalidIdentifier") };
      }
      // Kod gönderilemediyse giriş yarıda kalıyor: kullanıcıyı hiç gelmeyecek
      // bir kodu bekleten ekrana göndermektense söylemek doğru.
      if (error.code === "integration_unavailable") {
        return { ok: false, step: "password", message: t("codeNotSent") };
      }
    }
    throw error;
  }

  if (result.status === "session" && result.session) {
    await setSessionCookie(result.session.sessionToken, result.session.expiresAt);
    redirect(safeNext(next));
  }

  return {
    ok: true,
    step: "otp",
    channel: result.channel ?? undefined,
    identifier: result.identifier,
    message: result.channel === "email" ? t("otpEmailSent") : t("otpSmsSent"),
  };
}

/** Adım 2 — parolanın ardından gelen kod. */
export async function verifyLoginOtp(
  _prev: PasswordLoginState,
  formData: FormData,
): Promise<PasswordLoginState> {
  const t = await getTranslations("app.login");
  const identifier = String(formData.get("identifier") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("devam") ?? "/panel");

  if (!identifier || !/^\d{6}$/.test(code)) {
    return { ok: false, step: "otp", identifier, message: t("codeIncomplete") };
  }

  let session;
  try {
    session = await apiPost(
      "/v1/auth/web/password/otp",
      { identifier, code },
      webLoginSession,
    );
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "rate_limited") {
        return {
          ok: false,
          step: "otp",
          identifier,
          message: t("tooManyCodeAttempts"),
        };
      }
      const reason = reasonOf(error.details);
      if (reason) {
        return {
          ok: false,
          step: "otp",
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
  redirect(safeNext(next));
}

/* ------------------------------------------------------------------ *
 * Parolasız akış — kurtarma ve kayıt doğrulaması
 * ------------------------------------------------------------------ */

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

/** Kurtarma adımı 2 — kodu doğrular ve oturumu açar. */
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
  redirect(safeNext(next));
}

/** Açık yönlendirme koruması: yalnız kendi origin'imizdeki göreli adresler. */
function safeNext(next: string): string {
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/panel";
  }
  // Oturum/API uçları gezinme hedefi değil (eski bağlantılarda `devam` olarak kalmış olabilir).
  return next.startsWith("/api/") ? "/panel" : next;
}

function reasonOf(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const reason = (details as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}
