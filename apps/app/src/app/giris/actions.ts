"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  RATE_LIMITS, consumeVerificationToken, createSession, generateOtp, issueVerificationToken,
  rateLimit, SESSION_COOKIE,
} from "@yonetim/auth";
import { siteConfig } from "@yonetim/config";
import { normalizePhone } from "@yonetim/core";
import { users, withBypassRls } from "@yonetim/db";
import { magicLinkEmail, sendEmail } from "@yonetim/emails";
import { sendSms } from "@yonetim/sms";

import { notificationTranslator } from "@/lib/notify";

export interface LoginState {
  ok: boolean;
  step: "identify" | "verify";
  channel?: "email" | "sms";
  identifier?: string;
  message?: string;
}

const identifySchema = z.object({
  identifier: z.string().min(5),
});

/**
 * Giriş adımı 1 — SPEC Bölüm 14.2 (magic link + SMS OTP, parolasız).
 * Kullanıcı numarası/e-postası doğrulanır, tek kullanımlık kod gönderilir.
 * Kullanıcı bulunmasa da aynı yanıt döner (kullanıcı sayımı sızmasın).
 */
export async function requestLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const t = await getTranslations("app.login");
  const parsed = identifySchema.safeParse({ identifier: String(formData.get("identifier") ?? "") });
  if (!parsed.success) {
    return { ok: false, step: "identify", message: t("invalidIdentifier") };
  }

  const raw = parsed.data.identifier.trim();
  const phone = normalizePhone(raw);
  const isEmail = raw.includes("@");
  const identifier = isEmail ? raw.toLowerCase() : phone;

  if (!identifier) {
    return { ok: false, step: "identify", message: t("invalidIdentifier") };
  }

  const limit = await rateLimit(RATE_LIMITS.login, identifier);
  if (!limit.allowed) {
    return {
      ok: false,
      step: "identify",
      message: t("tooManyAttempts"),
    };
  }

  const user = await withBypassRls("auth:lookup", async (tx) => {
    const rows = await tx
      .select({ id: users.id, email: users.email, phone: users.phone })
      .from(users)
      .where(isEmail ? eq(users.email, identifier) : eq(users.phone, identifier))
      .limit(1);
    return rows[0] ?? null;
  });

  if (user) {
    if (isEmail) {
      const { token } = await issueVerificationToken({
        identifier,
        purpose: "magic_link",
        ttlMinutes: 15,
        metadata: { userId: user.id },
      });
      const url = `${siteConfig.env.appUrl}/giris/dogrula?e=${encodeURIComponent(identifier)}&t=${token}`;
      const mail = magicLinkEmail(await notificationTranslator(), { url, expiresMinutes: 15 });
      await sendEmail({ to: identifier, subject: mail.subject, html: mail.html });
    } else {
      const code = generateOtp(6);
      await issueVerificationToken({
        identifier,
        purpose: "otp",
        ttlMinutes: 5,
        code,
        metadata: { userId: user.id },
      });
      await sendSms({
        to: identifier,
        body: t("smsBody", { brand: siteConfig.brand.name, code }),
        isOtp: true,
      });
    }
  }

  return {
    ok: true,
    step: "verify",
    channel: isEmail ? "email" : "sms",
    identifier,
    message: isEmail ? t("emailSent") : t("smsSent"),
  };
}

/** Giriş adımı 2 — SMS kodunu doğrular ve oturum açar. */
export async function verifyLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const t = await getTranslations("app.login");
  const identifier = String(formData.get("identifier") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("devam") ?? "/panel");

  if (!identifier || code.length < 4) {
    return { ok: false, step: "verify", identifier, message: t("codeIncomplete") };
  }

  const limit = await rateLimit(RATE_LIMITS.otp, identifier);
  if (!limit.allowed) {
    return { ok: false, step: "verify", identifier, message: t("tooManyCodeAttempts") };
  }

  const purpose = identifier.includes("@") ? "magic_link" : "otp";
  const result = await consumeVerificationToken({ identifier, token: code, purpose });
  if (!result.ok) {
    return { ok: false, step: "verify", identifier, message: t(`tokenError.${result.reason}`) };
  }

  const userId = String((result.metadata as { userId?: string }).userId ?? "");
  if (!userId) {
    return { ok: false, step: "verify", identifier, message: t("userNotFound") };
  }

  const { token, expiresAt } = await createSession({ userId, rememberMe: true });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  await withBypassRls("auth:touch-login", async (tx) => {
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  });

  redirect(next.startsWith("/") ? next : "/panel");
}

