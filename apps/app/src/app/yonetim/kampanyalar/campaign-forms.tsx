"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Combobox, DateInput, Drawer, Input, Select } from "@yonetim/ui";

import { ActionButton } from "@/components/form/action-button";
import { ActionForm, FormField } from "@/components/form/action-form";

import { createPromoCode, setCampaignStatus, togglePromoCode } from "./actions";

function isoDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export function CreatePromoCodeButton({
  tenants,
  campaigns,
}: {
  tenants: Array<{ value: string; label: string }>;
  campaigns: Array<{ value: string; label: string }>;
}) {
  const t = useTranslations("app.platformCampaigns");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
      >
        <Plus aria-hidden className="h-4 w-4" />
        {t("newCode")}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t("newCode")}
        description={t("newCodeHint")}
        closeLabel={tCommon("action.close")}
        padded={false}
      >
        <ActionForm
          action={createPromoCode}
          submitLabel={tCommon("action.save")}
          onSuccess={() => setOpen(false)}
          layout="modal"
          onCancel={() => setOpen(false)}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField name="code" label={t("field.code")} hint={t("field.codeHint")} required>
              <Input name="code" minLength={3} maxLength={30} pattern="[A-Za-z0-9_-]+" className="uppercase" required />
            </FormField>
            <FormField name="discountType" label={t("field.discountType")} required>
              <Select name="discountType" defaultValue="percent" required>
                <option value="percent">{t("discountType.percent")}</option>
                <option value="amount">{t("discountType.amount")}</option>
              </Select>
            </FormField>
            <FormField name="discountValue" label={t("field.discountValue")} hint={t("field.discountValueHint")} required>
              <Input name="discountValue" inputMode="decimal" required />
            </FormField>
            <FormField name="usageLimit" label={t("field.usageLimit")} hint={t("field.usageLimitHint")}>
              <Input name="usageLimit" type="number" min={1} />
            </FormField>
            <FormField name="validFrom" label={t("field.validFrom")} required>
              <DateInput name="validFrom" defaultValue={isoDay()} required />
            </FormField>
            <FormField name="validUntil" label={t("field.validUntil")} required>
              <DateInput name="validUntil" defaultValue={isoDay(30)} required />
            </FormField>
            <div className="sm:col-span-2">
              <FormField name="restrictedToTenantId" label={t("field.restrictedTo")} hint={t("field.restrictedToHint")}>
                <Combobox
                  name="restrictedToTenantId"
                  options={tenants}
                  placeholder={t("field.anySite")}
                  searchPlaceholder={t("field.searchSite")}
                  emptyText={t("field.noSite")}
                />
              </FormField>
            </div>
            {campaigns.length > 0 ? (
              <div className="sm:col-span-2">
                <FormField name="campaignId" label={t("field.campaign")}>
                  <Select name="campaignId" defaultValue="">
                    <option value="">{t("field.noCampaign")}</option>
                    {campaigns.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            ) : null}
          </div>
        </ActionForm>
      </Drawer>
    </>
  );
}

/** Tek tıklık durum değişikliği — onay gerektirmeyen, geri alınabilir işlem. */
export function TogglePromoCode({ id, isActive }: { id: string; isActive: boolean }) {
  const t = useTranslations("app.platformCampaigns");
  return (
    <ActionButton
      action={togglePromoCode}
      fields={{ id, isActive: isActive ? "false" : "true" }}
      label={isActive ? t("deactivate") : t("activate")}
      tone={isActive ? "danger" : "primary"}
    />
  );
}

export function CampaignStatusButton({ id, status }: { id: string; status: string }) {
  const t = useTranslations("app.platformCampaigns");
  const next = status === "active" ? "paused" : "active";
  return (
    <ActionButton
      action={setCampaignStatus}
      fields={{ id, status: next }}
      label={next === "active" ? t("activate") : t("pause")}
      tone={next === "active" ? "primary" : "neutral"}
    />
  );
}
