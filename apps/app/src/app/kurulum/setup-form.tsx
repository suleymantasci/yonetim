"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Checkbox, Field, Input, Select } from "@yonetim/ui";

import { TR_CITIES } from "@/lib/tr-cities";

import { createFirstTenant, type SetupState } from "./actions";

type SetupAction = (previous: SetupState, formData: FormData) => Promise<SetupState>;

const PROPERTY_TYPES = [
  "apartment", "site", "residence", "plaza", "avm", "office", "vakif", "dernek",
] as const;

export function SetupForm({ action = createFirstTenant }: { action?: SetupAction }) {
  const t = useTranslations("app.setup");
  const tEnum = useTranslations("enum");
  const [state, formAction] = useActionState<SetupState, FormData>(action, {
    status: "idle",
  });

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "error" && state.message ? (
        <Alert tone="danger">{state.message}</Alert>
      ) : null}

      <Field label={t("field.propertyName")} error={state.fieldErrors?.propertyName?.[0]} required>
        <Input name="propertyName" required maxLength={200} />
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
        <Field label={t("field.unitCount")} error={state.fieldErrors?.unitCount?.[0]} required>
          <Input name="unitCount" type="number" min={1} max={10000} defaultValue={24} required />
        </Field>
        <Field label={t("field.city")}>
          <Select name="city" defaultValue="">
            <option value="">{t("field.cityPlaceholder")}</option>
            {TR_CITIES.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/*
        Otomatik birim üretimi opsiyonel: "1"…"N" numaralandırması çoğu
        apartmanda doğru ama blok yapısı olan sitelerde değil. Varsayılan
        açık, çünkü boş bir panelde ilk iş zaten birim eklemek.
      */}
      <Checkbox
        name="generateUnits"
        defaultChecked
        label={t("generateUnits")}
        description={t("generateUnitsHint")}
      />

      <SubmitButton label={t("submit")} />
    </form>
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
