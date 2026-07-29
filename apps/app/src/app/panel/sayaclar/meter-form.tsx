"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert, FormSection, Input, MoneyInput, Select, Switch } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveMeter } from "./actions";

const METER_TYPES = [
  "water",
  "hot_water",
  "gas",
  "electric",
  "heat_calorimeter",
] as const;

export interface MeterFormDefaults {
  id: string;
  unitId: string | null;
  type: string;
  serialNo: string | null;
  isCommon: boolean;
  unitPriceKurus: number;
  initialValue: string;
  hasReadings: boolean;
}

/**
 * Sayaç tanım formu.
 *
 * ORTAK ALAN ↔ DAİRE BİRBİRİNİ DIŞLIYOR: "ortak" işaretlenince daire seçimi
 * gizleniyor. İkisi birden dolu olsaydı aynı m³ hem ortak gidere hem tek
 * daireye yazılır, iki kez faturalanırdı. Kural sunucuda da uygulanıyor;
 * buradaki gizleme yalnız yanlış girişi baştan önlemek için.
 *
 * TAKILIŞ ENDEKSİ OKUMA GİRİLDİKTEN SONRA KİLİTLİ. Değişebilseydi ilk dönemin
 * tüketimi geriye dönük değişir ve faturası çoktan kesilmiş bir tutar sessizce
 * başka bir şeye dönüşürdü. Alan devre dışı bırakılıp sebebi yazılıyor —
 * gizlemek "böyle bir alan yok" izlenimi verirdi.
 */
export function MeterForm({
  defaults,
  units,
  cancelHref,
  submitLabel,
  stayOnSuccess,
  onSaved,
  onCreated,
  layout,
  onCancel,
}: {
  defaults?: MeterFormDefaults;
  units: { id: string; number: string; blockName: string | null }[];
  cancelHref?: string;
  submitLabel: string;
  stayOnSuccess?: boolean;
  onSaved?: () => void;
  onCreated?: (id: string) => void;
  layout?: "page" | "modal";
  onCancel?: () => void;
}) {
  const t = useTranslations("app.meters");
  const tEnum = useTranslations("enum");

  const [isCommon, setIsCommon] = useState(defaults?.isCommon ?? false);
  const locked = defaults?.hasReadings ?? false;

  return (
    <ActionForm
      action={saveMeter}
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

      <FormSection title={t("sectionMeter")} description={t("sectionMeterHint")}>
        <FormField name="type" label={t("type")} required>
          <Select name="type" defaultValue={defaults?.type ?? "water"} required>
            {METER_TYPES.map((type) => (
              <option key={type} value={type}>
                {tEnum(`meterType.${type}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          name="serialNo"
          label={t("serialNo")}
          hint={t("serialNoHint")}
        >
          <Input
            name="serialNo"
            defaultValue={defaults?.serialNo ?? ""}
            maxLength={60}
          />
        </FormField>

        <div className="sm:col-span-2">
          <Switch
            name="isCommon"
            label={t("isCommon")}
            description={t("isCommonHint")}
            checked={isCommon}
            onCheckedChange={setIsCommon}
          />
        </div>

        {!isCommon ? (
          <FormField name="unitId" label={t("unit")} required>
            <Select name="unitId" defaultValue={defaults?.unitId ?? ""} required>
              <option value="">{t("unitPlaceholder")}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.blockName ? `${u.blockName} / ${u.number}` : u.number}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
      </FormSection>

      <FormSection
        title={t("sectionBilling")}
        description={t("sectionBillingHint")}
      >
        <FormField
          name="unitPriceKurus"
          label={t("unitPrice")}
          hint={t("unitPriceHint")}
        >
          <MoneyInput
            name="unitPriceKurus"
            defaultKurus={defaults?.unitPriceKurus ?? 0}
          />
        </FormField>

        <FormField
          name="initialValue"
          label={t("initialValue")}
          hint={t("initialValueHint")}
        >
          {/*
            Kilitliyken alan devre dışı **ve** değer gizli girdiyle taşınıyor:
            devre dışı girdiler gönderilmiyor ve alan boş gitseydi sunucu
            "başlangıç değiştirilmek isteniyor" sanıp 400 dönerdi. Gizlemek
            yerine devre dışı göstermek, "böyle bir alan yok" izlenimini de
            önlüyor — alan var, değiştirilemiyor ve sebebi altında yazıyor.
          */}
          <Input
            name={locked ? undefined : "initialValue"}
            type="number"
            step="0.001"
            min={0}
            defaultValue={defaults?.initialValue ?? "0"}
            disabled={locked}
          />
        </FormField>
        {locked ? (
          <input
            type="hidden"
            name="initialValue"
            value={defaults?.initialValue ?? "0"}
          />
        ) : null}

        {locked ? (
          <div className="sm:col-span-2">
            <Alert tone="info">{t("initialValueLocked")}</Alert>
          </div>
        ) : null}
      </FormSection>
    </ActionForm>
  );
}
