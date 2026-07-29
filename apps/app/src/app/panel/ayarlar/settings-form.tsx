"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert, FormSection, Input, Switch, Textarea } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveSettings } from "./actions";

export interface SettingsFormDefaults {
  name: string;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  addressLine: string | null;
  postalCode: string | null;
  duesDueDayOfMonth: number;
  lateFeeEnabled: boolean;
  lateFeeMonthlyPct: string;
  kvkkContactEmail: string | null;
  invoiceTitle: string | null;
  invoiceTaxNumber: string | null;
  invoiceTaxOffice: string | null;
  invoiceAddress: string | null;
  whatsappOptInRequired: boolean;
}

/**
 * Site ayarları formu.
 *
 * GECİKME ORANI ÜST SINIRLI (%5): KMK md.20 aylık %5'i aşan gecikme
 * tazminatına izin vermiyor. Sınırı forma bırakmak, kanuna aykırı bir oranın
 * kaydedilip aylarca uygulanabilmesi demekti; hata sakinin itirazıyla ortaya
 * çıkardı.
 *
 * VADE GÜNÜ EN FAZLA 28: 29–31 arası bir gün, kısa aylarda kayar ve "vade
 * hangi gün" sorusu aya göre değişen bir cevaba dönüşürdü.
 *
 * SİTE ADRESİ (`slug`), DAİRE SAYISI VE ABONELİK ALANLARI **YOK**: ilki
 * basılmış her bağlantıyı kırar, ikincisi `units` tablosundan türeyen bir
 * sayı (elle girilse aidat dağıtımı hangi sayıyı kullandığını söyleyemezdi),
 * üçüncüsü faturalandırmanın sonucu.
 */
export function SettingsForm({
  defaults,
  submitLabel,
}: {
  defaults: SettingsFormDefaults;
  submitLabel: string;
}) {
  const t = useTranslations("app.settings");

  const [lateFeeEnabled, setLateFeeEnabled] = useState(defaults.lateFeeEnabled);

  return (
    <ActionForm action={saveSettings} submitLabel={submitLabel} stayOnSuccess>
      <FormSection
        title={t("propertyInfo")}
        description={t("propertyInfoHint")}
      >
        <div className="sm:col-span-2">
          <FormField name="name" label={t("propertyName")} required>
            <Input
              name="name"
              defaultValue={defaults.name}
              required
              minLength={2}
              maxLength={200}
            />
          </FormField>
        </div>

        <FormField name="city" label={t("city")}>
          <Input name="city" defaultValue={defaults.city ?? ""} maxLength={60} />
        </FormField>

        <FormField name="district" label={t("district")}>
          <Input
            name="district"
            defaultValue={defaults.district ?? ""}
            maxLength={60}
          />
        </FormField>

        <FormField name="neighborhood" label={t("neighborhood")}>
          <Input
            name="neighborhood"
            defaultValue={defaults.neighborhood ?? ""}
            maxLength={120}
          />
        </FormField>

        <FormField name="postalCode" label={t("postalCode")}>
          <Input
            name="postalCode"
            defaultValue={defaults.postalCode ?? ""}
            maxLength={10}
          />
        </FormField>

        <div className="sm:col-span-2">
          <FormField
            name="addressLine"
            label={t("addressLine")}
            hint={t("addressLineHint")}
          >
            <Textarea
              name="addressLine"
              defaultValue={defaults.addressLine ?? ""}
              rows={2}
              maxLength={500}
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection title={t("duesRules")} description={t("duesRulesHint")}>
        <FormField
          name="duesDueDayOfMonth"
          label={t("dueDay")}
          hint={t("dueDayHint")}
          required
        >
          <Input
            name="duesDueDayOfMonth"
            type="number"
            min={1}
            max={28}
            defaultValue={String(defaults.duesDueDayOfMonth)}
            required
          />
        </FormField>

        <FormField
          name="lateFeeMonthlyPct"
          label={t("lateFeePct")}
          hint={t("lateFeePctHint")}
        >
          <Input
            name="lateFeeMonthlyPct"
            type="number"
            step="0.01"
            min={0}
            max={5}
            defaultValue={defaults.lateFeeMonthlyPct}
            disabled={!lateFeeEnabled}
          />
        </FormField>

        <div className="sm:col-span-2">
          <Switch
            name="lateFeeEnabled"
            label={t("lateFeeEnabled")}
            description={t("lateFeeEnabledHint")}
            checked={lateFeeEnabled}
            onCheckedChange={setLateFeeEnabled}
          />
        </div>

        <div className="sm:col-span-2">
          <Alert tone="info">{t("lateFeeLegalNotice")}</Alert>
        </div>
      </FormSection>

      <FormSection title={t("invoiceInfo")} description={t("invoiceInfoHint")}>
        <FormField name="invoiceTitle" label={t("invoiceTitle")}>
          <Input
            name="invoiceTitle"
            defaultValue={defaults.invoiceTitle ?? ""}
            maxLength={200}
          />
        </FormField>

        <FormField
          name="invoiceTaxNumber"
          label={t("invoiceTaxNumber")}
          hint={t("invoiceTaxNumberHint")}
        >
          <Input
            name="invoiceTaxNumber"
            defaultValue={defaults.invoiceTaxNumber ?? ""}
            maxLength={11}
            inputMode="numeric"
          />
        </FormField>

        <FormField name="invoiceTaxOffice" label={t("invoiceTaxOffice")}>
          <Input
            name="invoiceTaxOffice"
            defaultValue={defaults.invoiceTaxOffice ?? ""}
            maxLength={100}
          />
        </FormField>

        <div className="sm:col-span-2">
          <FormField name="invoiceAddress" label={t("invoiceAddress")}>
            <Textarea
              name="invoiceAddress"
              defaultValue={defaults.invoiceAddress ?? ""}
              rows={2}
              maxLength={500}
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection
        title={t("kvkkSection")}
        description={t("kvkkSectionHint")}
        columns={1}
      >
        <FormField
          name="kvkkContactEmail"
          label={t("kvkkContactEmail")}
          hint={t("kvkkContactEmailHint")}
        >
          <Input
            name="kvkkContactEmail"
            type="email"
            defaultValue={defaults.kvkkContactEmail ?? ""}
            maxLength={255}
          />
        </FormField>

        <Switch
          name="whatsappOptInRequired"
          label={t("whatsappOptInRequired")}
          description={t("whatsappOptInRequiredHint")}
          defaultChecked={defaults.whatsappOptInRequired}
        />
      </FormSection>
    </ActionForm>
  );
}
