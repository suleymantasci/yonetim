"use client";

import { useTranslations } from "next-intl";

import { Select, Textarea } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";

import { createOwnKvkkRequest } from "./actions";

const TYPES = ["access", "rectification", "erasure", "objection", "portability"] as const;

/**
 * Sakinin KVKK md.11 başvurusu — uygulamadan, dilekçe yazmadan.
 * Kimlik oturumdan geliyor; başkası adına başvuru bu formdan açılamıyor.
 */
export function KvkkRequestForm() {
  const t = useTranslations("app.myProfile");
  const tEnum = useTranslations("enum");

  return (
    <ActionForm action={createOwnKvkkRequest} submitLabel={t("kvkkSubmit")} resetOnSuccess>
      <div className="space-y-3">
        <FormField name="type" label={t("kvkkType")} required>
          <Select name="type" defaultValue="access" required>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {tEnum(`kvkkRequestType.${type}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField name="detail" label={t("kvkkDetail")} hint={t("kvkkDetailHint")} required>
          <Textarea name="detail" rows={3} minLength={5} maxLength={2000} required />
        </FormField>
      </div>
    </ActionForm>
  );
}
