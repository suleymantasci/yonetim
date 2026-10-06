"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "@/components/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Card, CardBody, Field, Input, PhoneInput, Select, Textarea } from "@yonetim/ui";

import { submitAccessRequest, type AccessRequestState } from "./actions";

/**
 * Sakin erişim talebi formu.
 *
 * Bu form **üyelik açmıyor**, bir beyan kaydı bırakıyor. Daire numarası ve
 * kimlik doğrulaması yöneticinin işi; otomatik onay "3. daire" yazan herkesi
 * o dairenin sakini yapardı ve o kişi sitenin duyurularını, karar defterini
 * ve toplantı tutanaklarını okurdu.
 */
export function AccessRequestForm({
  tenantSlug,
  tenantName,
}: {
  tenantSlug: string;
  tenantName?: string;
}) {
  const t = useTranslations("app.accessRequest");
  const tEnum = useTranslations("enum");
  const [state, formAction] = useActionState<AccessRequestState, FormData>(
    submitAccessRequest,
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <Card>
        <CardBody className="space-y-4 text-center">
          <CheckCircle2 aria-hidden className="mx-auto h-10 w-10 text-success-fg" />
          <div>
            <h2 className="font-heading text-lg font-bold text-fg">{t("sentTitle")}</h2>
            <p className="mt-1 text-sm text-fg-muted">{state.message}</p>
          </div>
          <Link href="/giris" className="text-sm font-medium text-primary hover:underline">
            {t("backToLogin")}
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

          {/*
            Slug landing sayfasından geliyor. Kullanıcı düzenleyebilse bile
            zararsız: sunucu tanımadığı slug'da da aynı yanıtı döndürüyor.
          */}
          {tenantSlug ? (
            <input type="hidden" name="tenantSlug" value={tenantSlug} />
          ) : (
            <Field label={t("field.property")} hint={t("propertyHint")} required>
              <Input name="tenantSlug" required maxLength={50} />
            </Field>
          )}

          {tenantName ? (
            <Alert tone="info">{t("applyingTo", { property: tenantName })}</Alert>
          ) : null}

          <Field label={t("field.fullName")} error={state.fieldErrors?.fullName?.[0]} required>
            <Input name="fullName" required maxLength={160} autoComplete="name" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("field.phone")} hint={t("phoneHint")} error={state.fieldErrors?.phone?.[0]} required>
              <PhoneInput name="phone" required />
            </Field>
            <Field label={t("field.email")}>
              <Input name="email" type="email" maxLength={255} autoComplete="email" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("field.block")}>
              <Input name="blockLabel" maxLength={60} placeholder={t("blockPlaceholder")} />
            </Field>
            <Field label={t("field.unit")} error={state.fieldErrors?.unitLabel?.[0]} required>
              <Input name="unitLabel" required maxLength={40} placeholder="12" />
            </Field>
            <Field label={t("field.relation")}>
              <Select name="claimedRelation" defaultValue="tenant">
                <option value="owner">{tEnum("ownership.owner")}</option>
                <option value="tenant">{tEnum("ownership.tenant")}</option>
              </Select>
            </Field>
          </div>

          <Field label={t("field.note")} hint={t("noteHint")}>
            <Textarea name="note" rows={3} maxLength={1000} />
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
        </form>
      </CardBody>
    </Card>
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
