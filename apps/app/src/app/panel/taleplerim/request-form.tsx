"use client";

import { useTranslations } from "next-intl";

import { Input, Select, Textarea } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { createMyRequest } from "./actions";

const CATEGORIES = [
  "asansor",
  "su",
  "elektrik",
  "dogalgaz",
  "ortak_alan",
  "guvenlik",
  "temizlik",
  "hasere",
  "diger",
] as const;

/** `critical` bilerek yok — gerekçesi `actions.ts` içinde. */
const PRIORITIES = ["low", "normal", "high"] as const;

/**
 * Sakinin talep açma formu.
 *
 * Yönetim formundaki daire, atama, maliyet ve durum alanları burada yok:
 * hiçbiri sakinin karar vereceği şey değil. Daireyi sunucu oturumdan çözüyor,
 * bu yüzden formda gizli bir `unitId` de bulunmuyor.
 */
export function MyRequestForm({ cancelHref }: { cancelHref: string }) {
  const t = useTranslations("app.myRequests");
  const tEnum = useTranslations("enum");

  return (
    <ActionForm action={createMyRequest} submitLabel={t("submit")} cancelHref={cancelHref}>
      <FormField name="title" label={t("field.title")} required>
        <Input name="title" required maxLength={200} placeholder={t("titlePlaceholder")} />
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField name="category" label={t("field.category")} required>
          <Select name="category" required defaultValue="diger">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tEnum(`requestCategory.${c}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField name="priority" label={t("field.priority")} hint={t("priorityHint")}>
          <Select name="priority" defaultValue="normal">
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {tEnum(`requestPriority.${p}`)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField name="description" label={t("field.description")} hint={t("descriptionHint")}>
        <Textarea name="description" rows={5} maxLength={4000} />
      </FormField>
    </ActionForm>
  );
}
