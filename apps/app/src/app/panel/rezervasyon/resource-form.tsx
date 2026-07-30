"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Alert,
  FormSection,
  Input,
  MoneyInput,
  Select,
  Switch,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveResource } from "./actions";

// Anahtarlar `enum.resourceKind` sözlüğüyle birebir; sözleşme de aynı kümeyi
// kullanıyor (`RESOURCE_KINDS`).
const KINDS = [
  "salon",
  "misafir_odasi",
  "spor",
  "havuz",
  "otopark",
  "teras",
  "bahce",
  "diger",
] as const;

const FEE_UNITS = ["hour", "day", "booking"] as const;

export interface ResourceFormDefaults {
  id: string;
  name: string;
  kind: string;
  capacity: number | null;
  feeKurus: number;
  feeUnit: string;
  depositKurus: number;
  requiresApproval: boolean;
  maxHoursPerBooking: number;
  maxBookingsPerMonth: number;
  openHour: number;
  closeHour: number;
  rulesText: string | null;
  isActive: boolean;
}

/**
 * Tesis tanım formu — rezervasyon modülünün **girişi**.
 *
 * Bu form olmadan modül çalışmıyordu: `resources` tablosunun yazma yolu hiç
 * yazılmamıştı ve rezervasyon ekranı yalnız boş bir liste gösterebiliyordu.
 *
 * ÜCRET BİRİMİ ÜÇ SEÇENEKLİ ("saat / gün / rezervasyon başına") çünkü bazı
 * tesisler süreye bakmaksızın tek ücret alıyor. Hepsini saatliğe zorlamak,
 * iki saatlik bir toplantıyı dört saatlikten ucuz göstermek gibi yanlış bir
 * sinyal verirdi.
 *
 * "ONAY GEREKİYOR" varsayılan olarak **açık**: kapalıyken her talep anında
 * onaylanmış sayılıyor ve yönetici o saati geri alamıyor. Açık olması,
 * yöneticinin kontrolü bilinçli olarak bırakmasını gerektiriyor.
 */
export function ResourceForm({
  defaults,
  cancelHref,
  submitLabel,
  stayOnSuccess,
  onSaved,
  onCreated,
  layout,
  onCancel,
}: {
  defaults?: ResourceFormDefaults;
  cancelHref?: string;
  submitLabel: string;
  stayOnSuccess?: boolean;
  onSaved?: () => void;
  onCreated?: (id: string) => void;
  layout?: "page" | "modal";
  onCancel?: () => void;
}) {
  const t = useTranslations("app.reservations");
  const tEnum = useTranslations("enum");

  const [feeUnit, setFeeUnit] = useState(defaults?.feeUnit ?? "hour");

  return (
    <ActionForm
      action={saveResource}
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
        title={t("resourceSection")}
        description={t("resourceSectionHint")}
      >
        <FormField name="name" label={t("resourceName")} required>
          <Input
            name="name"
            defaultValue={defaults?.name}
            required
            minLength={2}
            maxLength={120}
            placeholder={t("resourceNamePlaceholder")}
          />
        </FormField>

        <FormField name="kind" label={t("resourceKind")} required>
          <Select
            name="kind"
            defaultValue={defaults?.kind ?? "salon"}
            required
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {tEnum(`resourceKind.${kind}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          name="capacity"
          label={t("capacityLabel")}
          hint={t("capacityHint")}
        >
          <Input
            name="capacity"
            type="number"
            min={0}
            max={10000}
            defaultValue={String(defaults?.capacity ?? 0)}
          />
        </FormField>

        <div className="sm:col-span-2">
          <Switch
            name="isActive"
            label={t("resourceActive")}
            description={t("resourceActiveHint")}
            defaultChecked={defaults?.isActive ?? true}
          />
        </div>
      </FormSection>

      <FormSection title={t("feeSection")} description={t("feeSectionHint")}>
        <FormField name="feeKurus" label={t("fee")}>
          <MoneyInput
            name="feeKurus"
            defaultKurus={defaults?.feeKurus ?? 0}
          />
        </FormField>

        <FormField name="feeUnit" label={t("feeUnit")} required>
          <Select
            name="feeUnit"
            value={feeUnit}
            onChange={(event) => setFeeUnit(event.target.value)}
            required
          >
            {FEE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t(`feeUnitOption.${unit}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          name="depositKurus"
          label={t("deposit")}
          hint={t("depositHint")}
        >
          <MoneyInput
            name="depositKurus"
            defaultKurus={defaults?.depositKurus ?? 0}
          />
        </FormField>

        <div className="sm:col-span-2">
          <Alert tone="info">{t(`feeUnitNotice.${feeUnit}`)}</Alert>
        </div>
      </FormSection>

      <FormSection title={t("rulesSection")} description={t("rulesSectionHint")}>
        <FormField name="openHour" label={t("openHour")} required>
          <Input
            name="openHour"
            type="number"
            min={0}
            max={23}
            defaultValue={String(defaults?.openHour ?? 8)}
            required
          />
        </FormField>

        <FormField name="closeHour" label={t("closeHour")} required>
          <Input
            name="closeHour"
            type="number"
            min={1}
            max={24}
            defaultValue={String(defaults?.closeHour ?? 23)}
            required
          />
        </FormField>

        <FormField
          name="maxHoursPerBooking"
          label={t("maxHours")}
          hint={t("maxHoursHint")}
          required
        >
          <Input
            name="maxHoursPerBooking"
            type="number"
            min={1}
            max={24}
            defaultValue={String(defaults?.maxHoursPerBooking ?? 4)}
            required
          />
        </FormField>

        <FormField
          name="maxBookingsPerMonth"
          label={t("maxBookings")}
          hint={t("maxBookingsHint")}
          required
        >
          <Input
            name="maxBookingsPerMonth"
            type="number"
            min={1}
            max={100}
            defaultValue={String(defaults?.maxBookingsPerMonth ?? 4)}
            required
          />
        </FormField>

        <div className="sm:col-span-2">
          <Switch
            name="requiresApproval"
            label={t("requiresApproval")}
            description={t("requiresApprovalHint")}
            defaultChecked={defaults?.requiresApproval ?? true}
          />
        </div>

        <div className="sm:col-span-2">
          <FormField
            name="rulesText"
            label={t("rulesText")}
            hint={t("rulesTextHint")}
          >
            <Textarea
              name="rulesText"
              defaultValue={defaults?.rulesText ?? ""}
              rows={4}
              maxLength={4000}
            />
          </FormField>
        </div>
      </FormSection>
    </ActionForm>
  );
}
