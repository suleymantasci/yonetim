"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Alert, Card, CardBody, Field, Input } from "@yonetim/ui";

import { requestLoginCode, verifyLoginCode, type LoginState } from "@/app/giris/actions";

const INITIAL: LoginState = { ok: false, step: "identify" };

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("app.login");
  const tCommon = useTranslations("common");

  const [identifyState, identifyAction, identifying] = useActionState(requestLoginCode, INITIAL);
  const [verifyState, verifyAction, verifying] = useActionState(verifyLoginCode, {
    ok: false,
    step: "verify" as const,
  });

  const showVerify = identifyState.step === "verify" && identifyState.ok;

  return (
    <Card>
      <CardBody className="space-y-4">
        {!showVerify ? (
          <form action={identifyAction} className="space-y-4">
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
