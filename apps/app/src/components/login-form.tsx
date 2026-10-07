"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Alert, Card, CardBody, Field, Input } from "@yonetim/ui";

import {
  requestLoginCode,
  signIn,
  verifyLoginCode,
  verifyLoginOtp,
  type LoginState,
  type PasswordLoginState,
} from "@/app/giris/actions";

const PASSWORD_INITIAL: PasswordLoginState = { ok: false, step: "password" };
const RECOVERY_INITIAL: LoginState = { ok: false, step: "identify" };

/**
 * Giriş formu — parola ile.
 *
 * İKİNCİ ADIMIN ÇIKIP ÇIKMAYACAĞINI SUNUCU SÖYLÜYOR: `state.step === "otp"`
 * yalnızca API `otp_required` döndüğünde oluşuyor. Ayarı burada okumak
 * (`NEXT_PUBLIC_...`) mümkündü ama o, oturumun açılıp açılmayacağını iki ayrı
 * sürecin aynı değişkeni doğru okumasına bağlardı.
 *
 * "Parolamı bilmiyorum" akışı parolasız giriş uçlarını kullanıyor ve
 * kaldırılmadı: ilk parolayı belirlemenin ve unutulanı kurtarmanın başka yolu
 * yok.
 */
export function LoginForm({
  next,
  defaultIdentifier,
}: {
  next: string;
  defaultIdentifier?: string;
}) {
  const t = useTranslations("app.login");
  const tCommon = useTranslations("common");
  const [mode, setMode] = useState<"password" | "recovery">("password");

  const [loginState, loginAction, loggingIn] = useActionState(signIn, PASSWORD_INITIAL);
  const [otpState, otpAction, verifyingOtp] = useActionState(verifyLoginOtp, {
    ok: false,
    step: "otp" as const,
  });

  const [identifyState, identifyAction, identifying] = useActionState(
    requestLoginCode,
    RECOVERY_INITIAL,
  );
  const [verifyState, verifyAction, verifying] = useActionState(verifyLoginCode, {
    ok: false,
    step: "verify" as const,
  });

  const awaitingOtp = loginState.step === "otp" && loginState.ok;
  const awaitingRecoveryCode = identifyState.step === "verify" && identifyState.ok;

  if (mode === "recovery") {
    return (
      <Card>
        <CardBody className="space-y-4">
          {!awaitingRecoveryCode ? (
            <form action={identifyAction} className="space-y-4">
              <p className="text-sm text-fg-muted">{t("recoveryIntro")}</p>
              <Field label={t("identifierLabel")} hint={t("identifierHint")} required>
                <Input
                  name="identifier"
                  autoComplete="username"
                  placeholder={t("identifierPlaceholder")}
                  required
                />
              </Field>
              {identifyState.message && !identifyState.ok ? (
                <Alert tone="danger">{identifyState.message}</Alert>
              ) : null}
              <button
                disabled={identifying}
                className="h-11 w-full rounded-lg bg-primary font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
              >
                {identifying ? tCommon("state.sending") : t("sendCode")}
              </button>
              <LinkButton onClick={() => setMode("password")} label={t("backToPassword")} />
            </form>
          ) : (
            <form action={verifyAction} className="space-y-4">
              <Alert tone="success">{identifyState.message}</Alert>
              <input type="hidden" name="identifier" value={identifyState.identifier} />
              <input type="hidden" name="devam" value={next} />
              <Field label={t("codeLabel")} required>
                <Input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={t("codePlaceholder")}
                  required
                />
              </Field>
              {verifyState.message ? <Alert tone="danger">{verifyState.message}</Alert> : null}
              <button
                disabled={verifying}
                className="h-11 w-full rounded-lg bg-primary font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
              >
                {verifying ? t("verifying") : tCommon("action.login")}
              </button>
              {identifyState.channel === "email" ? (
                <p className="text-center text-xs text-fg-subtle">{t("magicLinkHint")}</p>
              ) : null}
            </form>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        {!awaitingOtp ? (
          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="devam" value={next} />
            <Field label={t("identifierLabel")} hint={t("identifierHint")} required>
              <Input
                name="identifier"
                autoComplete="username"
                placeholder={t("identifierPlaceholder")}
                defaultValue={defaultIdentifier}
                required
              />
            </Field>
            <Field label={t("passwordLabel")} required>
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            {loginState.message && !loginState.ok ? (
              <Alert tone="danger">{loginState.message}</Alert>
            ) : null}
            <button
              disabled={loggingIn}
              className="h-11 w-full rounded-lg bg-primary font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
            >
              {loggingIn ? t("verifying") : tCommon("action.login")}
            </button>
            <LinkButton onClick={() => setMode("recovery")} label={t("forgotPassword")} />
          </form>
        ) : (
          <form action={otpAction} className="space-y-4">
            <Alert tone="success">{loginState.message}</Alert>
            <input type="hidden" name="identifier" value={loginState.identifier} />
            <input type="hidden" name="devam" value={next} />
            <Field label={t("codeLabel")} required>
              <Input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t("codePlaceholder")}
                required
              />
            </Field>
            {otpState.message ? <Alert tone="danger">{otpState.message}</Alert> : null}
            <button
              disabled={verifyingOtp}
              className="h-11 w-full rounded-lg bg-primary font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
            >
              {verifyingOtp ? t("verifying") : tCommon("action.login")}
            </button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Form içinde `type="button"`: varsayılan `submit` olsaydı "parolamı
 * bilmiyorum" bağlantısı formu gönderirdi.
 */
function LinkButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-center text-sm text-fg-subtle underline hover:text-fg"
    >
      {label}
    </button>
  );
}
