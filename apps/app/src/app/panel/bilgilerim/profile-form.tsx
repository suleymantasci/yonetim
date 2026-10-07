"use client";

import { useTranslations } from "next-intl";

import { Input, PhoneInput } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { updateMyProfile } from "./actions";

export interface ProfileDefaults {
  firstName: string;
  lastName: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

export function ProfileForm({ defaults }: { defaults: ProfileDefaults }) {
  const t = useTranslations("app.myProfile");

  return (
    <ActionForm action={updateMyProfile} submitLabel={t("save")} inlineSuccess>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField name="firstName" label={t("field.firstName")} required>
          <Input name="firstName" required defaultValue={defaults.firstName} maxLength={80} />
        </FormField>
        <FormField name="lastName" label={t("field.lastName")} required>
          <Input name="lastName" required defaultValue={defaults.lastName} maxLength={80} />
        </FormField>
      </div>

      <FormField name="email" label={t("field.email")} hint={t("emailHint")}>
        <Input name="email" type="email" defaultValue={defaults.email} maxLength={255} />
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField name="emergencyContactName" label={t("field.emergencyName")}>
          <Input
            name="emergencyContactName"
            defaultValue={defaults.emergencyContactName}
            maxLength={120}
          />
        </FormField>
        <FormField name="emergencyContactPhone" label={t("field.emergencyPhone")}>
          <PhoneInput name="emergencyContactPhone" defaultValue={defaults.emergencyContactPhone} />
        </FormField>
      </div>
    </ActionForm>
  );
}
