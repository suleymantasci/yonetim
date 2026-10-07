"use client";

import { Building2, MailCheck, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Card, CardBody, Field, Input, cn } from "@yonetim/ui";

import Link from "@/components/link";

import { requestDemo, type DemoRequestState } from "./actions";

/**
 * Demo talep formu.
 *
 * `website` alanı bal küpü: ekran okuyucudan ve klavyeden gizli, insan onu
 * hiç görmüyor. Dolu gelen istek sunucuda sessizce yutuluyor.
 */
export function DemoForm({ initialKind }: { initialKind: "manager" | "company" }) {
  const t = useTranslations("app.demo");
  const [state, formAction] = useActionState<DemoRequestState, FormData>(requestDemo, { status: "idle" });
  const v = state.values ?? {};
  const [kind, setKind] = useState<"manager" | "company">((v.kind as "manager" | "company") || initialKind);

  if (state.status === "sent") {
    return (
      <Card>
        <CardBody className="space-y-4 text-center">
          <MailCheck aria-hidden className="mx-auto h-10 w-10 text-success-fg" />
          <div>
            <h2 className="font-heading text-lg font-bold text-fg">{t("sentTitle")}</h2>
            <p className="mt-2 text-sm text-fg-muted">{t("sentBody", { email: state.email ?? "" })}</p>
            <p className="mt-2 text-xs text-fg-subtle">{t("sentSpam")}</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <form key={state.attempt ?? 0} action={formAction} className="space-y-5" noValidate>
          {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}

          <input type="hidden" name="kind" value={kind} />
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Web sitesi
              <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-fg">{t("kindLabel")}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <KindOption
                selected={kind === "manager"}
                onSelect={() => setKind("manager")}
                icon={<Building2 aria-hidden className="h-5 w-5" />}
                title={t("kindManager")}
                description={t("kindManagerHint")}
              />
              <KindOption
                selected={kind === "company"}
                onSelect={() => setKind("company")}
                icon={<Users aria-hidden className="h-5 w-5" />}
                title={t("kindCompany")}
                description={t("kindCompanyHint")}
              />
            </div>
          </fieldset>

          <Field label={t("field.fullName")} error={state.fieldErrors?.fullName?.[0]}>
            <Input name="fullName" required minLength={3} maxLength={160} autoComplete="name" defaultValue={v.fullName} />
          </Field>
          <Field label={t("field.email")} hint={t("emailHint")} error={state.fieldErrors?.email?.[0]}>
            <Input name="email" type="email" required maxLength={255} autoComplete="email" inputMode="email" defaultValue={v.email} />
          </Field>
          <Field label={t("field.phone")} hint={t("phoneHint")} error={state.fieldErrors?.phone?.[0]}>
            <Input name="phone" type="tel" required maxLength={20} autoComplete="tel" inputMode="tel" placeholder="05xx xxx xx xx" defaultValue={v.phone} />
          </Field>

          <label className="flex items-start gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              name="consent"
              required
              defaultChecked={v.consent === "on"}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong"
            />
            <span>
              {t("consent")}
              {state.fieldErrors?.consent ? (
                <span className="mt-1 block text-danger-fg">{state.fieldErrors.consent[0]}</span>
              ) : null}
            </span>
          </label>

          <SubmitButton label={t("submit")} />

          <p className="text-center text-sm text-fg-subtle">
            {t("haveAccount")}{" "}
            <Link href="/giris" className="font-medium text-primary hover:underline">
              {t("login")}
            </Link>
            {" · "}
            {t("signupInstead")}{" "}
            <Link href="/kayit" className="font-medium text-primary hover:underline">
              {t("signup")}
            </Link>
          </p>
        </form>
      </CardBody>
    </Card>
  );
}

function KindOption({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5 text-fg" : "border-border text-fg-muted hover:bg-hover",
      )}
    >
      <span className={cn("flex items-center gap-2 font-medium", selected && "text-primary")}>
        {icon}
        {title}
      </span>
      <span className="mt-1 block text-xs text-fg-subtle">{description}</span>
    </button>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
    >
      {label}
    </button>
  );
}
