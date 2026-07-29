"use client";

import { useTranslations } from "next-intl";

import { Textarea } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { sendMessageToManagement } from "./actions";

export function MessageForm() {
  const t = useTranslations("app.myMessages");

  return (
    <ActionForm action={sendMessageToManagement} submitLabel={t("send")} resetOnSuccess>
      <FormField name="body" label={t("newMessage")} required>
        <Textarea name="body" rows={3} required maxLength={2000} placeholder={t("placeholder")} />
      </FormField>
    </ActionForm>
  );
}
