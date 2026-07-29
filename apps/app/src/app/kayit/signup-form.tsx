"use client";

import { Building2, CheckCircle2, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Card, CardBody, Field, Input, Select, cn } from "@yonetim/ui";

import { startSignup, type SignupState } from "./actions";

const PROPERTY_TYPES = [
  "apartment", "site", "residence", "plaza", "avm", "office", "vakif", "dernek",
] as const;

/**
 * Site / yönetim firması kayıt formu.
 *
 * HESAP TÜRÜ İKİ SEÇENEK: tek site yöneten bir kişi ile 20 site yöneten bir
 * firma aynı akıştan geçemez — firmanın `companies` kaydına ve `company_admin`
 * rolüne ihtiyacı var, tek siteli yöneticinin ise yok. Seçim en başta
 * soruluyor çünkü sonradan dönüştürmek üyelik rollerini elle değiştirmek
 * demek.
 *
 * Başarıda form **oturum açmıyor**, "kodu gönderdik" ekranına dönüyor: kayıt
 * ile doğrulama arasına giren bu adım, başkasının adresiyle site açılmasını
 * engelleyen tek şey.
 */
export function SignupForm({
  campaign,
  migrationSource,
}: {
  campaign?: string;
  migrationSource?: string;
}) {
  const t = useTranslations("app.signup");
  const tEnum = useTranslations("enum");
  const [accountType, setAccountType] = useState<"property" | "company">("property");
  const [state, formAction] = useActionState<SignupState, FormData>(startSignup, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <Card>
        <CardBody className="space-y-4 text-center">
          <CheckCircle2 aria-hidden className="mx-auto h-10 w-10 text-success-fg" />
          <div>
            <h2 className="font-heading text-lg font-bold text-fg">{t("sentTitle")}</h2>
            <p className="mt-1 text-sm text-fg-muted">{state.message}</p>
          </div>
          <Link
            href={`/giris?devam=${encodeURIComponent("/kurulum")}`}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            {t("continueToLogin")}
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="space-y-5">
          {state.status === "error" && state.message ? (
            <Alert tone="danger">{state.message}</Alert>
          ) : null}

          <input type="hidden" name="accountType" value={accountType} />
          {campaign ? <input type="hidden" name="campaign" value={campaign} /> : null}
          {migrationSource ? (
            <input type="hidden" name="migrationSource" value={migrationSource} />
          ) : null}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-fg">
              {t("accountType")}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <AccountTypeOption
                selected={accountType === "property"}
                onSelect={() => setAccountType("property")}
                icon={<Building2 aria-hidden className="h-5 w-5" />}
                title={t("typeProperty")}
                description={t("typePropertyHint")}
              />
              <AccountTypeOption
                selected={accountType === "company"}
                onSelect={() => setAccountType("company")}
                icon={<Users aria-hidden className="h-5 w-5" />}
                title={t("typeCompany")}
                description={t("typeCompanyHint")}
              />
            </div>
          </fieldset>

          {accountType === "company" ? (
            <Field label={t("field.companyName")} error={state.fieldErrors?.companyName?.[0]}>
              <Input name="companyName" required maxLength={200} />
            </Field>
          ) : null}

          <Field label={t("field.propertyName")} error={state.fieldErrors?.propertyName?.[0]}>
            <Input name="propertyName" required maxLength={200} placeholder={t("propertyPlaceholder")} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("field.propertyType")}>
              <Select name="propertyType" defaultValue="apartment">
                {PROPERTY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {tEnum(`tenantType.${type}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("field.unitCount")} error={state.fieldErrors?.unitCount?.[0]}>
              <Input name="unitCount" type="number" min={1} max={10000} defaultValue={24} required />
            </Field>
            <Field label={t("field.city")}>
              <Input name="city" maxLength={60} />
            </Field>
          </div>

          <hr className="border-border" />

          <Field label={t("field.fullName")} error={state.fieldErrors?.fullName?.[0]}>
            <Input name="fullName" required maxLength={160} autoComplete="name" />
          </Field>

          <Field
            label={t("field.identifier")}
            hint={t("identifierHint")}
            error={state.fieldErrors?.identifier?.[0]}
          >
            <Input name="identifier" required maxLength={160} autoComplete="username" />
          </Field>

          <label className="flex items-start gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              name="acceptedTerms"
              required
              className="mt-0.5 h-4 w-4 rounded border-border-strong"
            />
            <span>
              {t("terms")}
              {state.fieldErrors?.acceptedTerms ? (
                <span className="mt-1 block text-danger-fg">
                  {state.fieldErrors.acceptedTerms[0]}
                </span>
              ) : null}
            </span>
          </label>

          <SubmitButton label={t("submit")} />

          <p className="text-center text-sm text-fg-subtle">
            {t("haveAccount")}{" "}
            <Link href="/giris" className="font-medium text-primary hover:underline">
              {t("login")}
            </Link>
          </p>
        </form>
      </CardBody>
    </Card>
  );
}

function AccountTypeOption({
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
        selected
          ? "border-primary bg-primary/5 text-fg"
          : "border-border text-fg-muted hover:bg-hover",
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
      className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
    >
      {label}
    </button>
  );
}
