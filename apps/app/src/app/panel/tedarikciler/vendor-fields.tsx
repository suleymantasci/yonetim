import { getTranslations } from "next-intl/server";

import { Input, Switch, Textarea } from "@yonetim/ui";
import type { VendorRow } from "@yonetim/contracts";

import { FormField } from "@/components/form/action-form";

/** Tedarikçi kartı alanları — yeni ve düzenle çekmecesinde aynı. */
export async function VendorFields({ defaults }: { defaults?: VendorRow }) {
  const t = await getTranslations("app.vendors");
  return (
    <>
      <FormField name="name" label={t("name")} required>
        <Input name="name" defaultValue={defaults?.name} minLength={2} maxLength={160} required />
      </FormField>
      <FormField name="category" label={t("category")} hint={t("categoryHint")} required>
        <Input name="category" defaultValue={defaults?.category} maxLength={60} required />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="taxNumber" label={t("taxNumber")} hint={t("taxNumberHint")}>
          <Input name="taxNumber" inputMode="numeric" defaultValue={defaults?.taxNumber ?? ""} maxLength={11} />
        </FormField>
        <FormField name="taxOffice" label={t("taxOffice")}>
          <Input name="taxOffice" defaultValue={defaults?.taxOffice ?? ""} maxLength={80} />
        </FormField>
        <FormField name="contactName" label={t("contactName")}>
          <Input name="contactName" defaultValue={defaults?.contactName ?? ""} maxLength={120} />
        </FormField>
        <FormField name="phone" label={t("phone")}>
          <Input name="phone" type="tel" defaultValue={defaults?.phone ?? ""} maxLength={20} />
        </FormField>
      </div>
      <FormField name="email" label={t("email")}>
        <Input name="email" type="email" defaultValue={defaults?.email ?? ""} maxLength={200} />
      </FormField>
      <FormField name="iban" label={t("iban")} hint={t("ibanHint")}>
        <Input name="iban" defaultValue={defaults?.iban ?? ""} maxLength={40} placeholder="TR00 0000 …" />
      </FormField>
      <FormField name="address" label={t("address")}>
        <Textarea name="address" rows={2} defaultValue={defaults?.address ?? ""} maxLength={500} />
      </FormField>
      <FormField name="notes" label={t("notes")}>
        <Textarea name="notes" rows={2} defaultValue={defaults?.notes ?? ""} maxLength={2000} />
      </FormField>
      <Switch name="isActive" label={t("isActive")} description={t("isActiveHint")} defaultChecked={defaults?.isActive ?? true} />
    </>
  );
}
