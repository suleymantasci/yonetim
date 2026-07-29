"use client";

import { useTranslations } from "next-intl";

import { Alert, FormSection, Input, Select, Switch } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveBankAccount } from "./actions";

const PURPOSES = [
  "dues",
  "expense",
  "reserve",
  "project",
  "deposit",
  "other",
] as const;

export interface BankAccountFormDefaults {
  id: string;
  bankName: string;
  ibanMasked: string;
  accountName: string | null;
  purpose: string;
  isActive: boolean;
  hasPayments: boolean;
}

/**
 * Banka hesabı formu.
 *
 * IBAN DÜZENLEMEDE **YENİDEN GİRİLİYOR**: okuma uçları yalnız maskeli kopyayı
 * döndürüyor (§9.1) ve maskeyle doldurulmuş bir alan kaydedildiğinde maske
 * gerçek IBAN'ın yerine yazılırdı. Bu yüzden alan boş açılıyor, mevcut maske
 * ipucu olarak gösteriliyor ve zorunlu: hesabı düzenleyen kişi IBAN'ı elinde
 * bulundurmalı.
 *
 * BAKİYE ALANI YOK: bakiye banka entegrasyonundan gelen bir gerçek. Elle
 * girilebilseydi ekrandaki rakam ekstreyle çelişebilir ve hangisinin doğru
 * olduğu belirsizleşirdi.
 */
export function BankAccountForm({
  defaults,
  cancelHref,
  submitLabel,
  stayOnSuccess,
  onSaved,
  onCreated,
  layout,
  onCancel,
}: {
  defaults?: BankAccountFormDefaults;
  cancelHref?: string;
  submitLabel: string;
  stayOnSuccess?: boolean;
  onSaved?: () => void;
  onCreated?: (id: string) => void;
  layout?: "page" | "modal";
  onCancel?: () => void;
}) {
  const t = useTranslations("app.bank");

  return (
    <ActionForm
      action={saveBankAccount}
      submitLabel={submitLabel}
      cancelHref={cancelHref}
      stayOnSuccess={stayOnSuccess}
      layout={layout}
      onCancel={onCancel}
      onSuccess={(state) => {
        if (state.data?.id) onCreated?.(state.data.id);
        onSaved?.();
      }}
    >
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <FormSection
        title={t("accountSection")}
        description={t("accountSectionHint")}
      >
        <FormField name="bankName" label={t("bankName")} required>
          <Input
            name="bankName"
            defaultValue={defaults?.bankName}
            required
            minLength={2}
            maxLength={80}
            placeholder={t("bankNamePlaceholder")}
          />
        </FormField>

        <FormField
          name="accountName"
          label={t("accountName")}
          hint={t("accountNameHint")}
        >
          <Input
            name="accountName"
            defaultValue={defaults?.accountName ?? ""}
            maxLength={160}
          />
        </FormField>

        <div className="sm:col-span-2">
          <FormField name="iban" label={t("iban")} hint={t("ibanHint")} required>
            <Input
              name="iban"
              required
              maxLength={34}
              placeholder={defaults ? defaults.ibanMasked : "TR…"}
            />
          </FormField>
        </div>

        {defaults ? (
          <div className="sm:col-span-2">
            <Alert tone="info">
              {t("ibanReentryNotice", { iban: defaults.ibanMasked })}
            </Alert>
          </div>
        ) : null}

        <FormField
          name="purpose"
          label={t("purpose")}
          hint={t("purposeHint")}
          required
        >
          <Select
            name="purpose"
            defaultValue={defaults?.purpose ?? "dues"}
            required
          >
            {PURPOSES.map((purpose) => (
              <option key={purpose} value={purpose}>
                {t(`purposeOption.${purpose}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="sm:col-span-2">
          <Switch
            name="isActive"
            label={t("accountActive")}
            description={t("accountActiveHint")}
            defaultChecked={defaults?.isActive ?? true}
          />
        </div>

        {defaults?.hasPayments ? (
          <div className="sm:col-span-2">
            <Alert tone="warning">{t("accountHasPayments")}</Alert>
          </div>
        ) : null}
      </FormSection>
    </ActionForm>
  );
}
