"use client";

import { useTranslations } from "next-intl";

import { Textarea } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { addMyRequestComment } from "./actions";

/**
 * Talebe yorum ekleme.
 *
 * `resetOnSuccess`: aynı ekranda seri yazışma yapılıyor; gönderilen metnin
 * kutuda kalması "gitti mi gitmedi mi" belirsizliği yaratıyordu.
 */
export function CommentForm({ requestId }: { requestId: string }) {
  const t = useTranslations("app.myRequests");

  return (
    <ActionForm action={addMyRequestComment} submitLabel={t("sendComment")} resetOnSuccess>
      <input type="hidden" name="id" value={requestId} />
      <FormField name="body" label={t("commentLabel")} required>
        <Textarea name="body" rows={3} required maxLength={4000} placeholder={t("commentPlaceholder")} />
      </FormField>
    </ActionForm>
  );
}
