"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Alert,
  CheckboxGroup,
  FormSection,
  Input,
  MoneyInput,
  PeriodInput,
  RadioGroup,
  Select,
  Switch,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveDuesPlan } from "./actions";

/**
 * Aidat planı formu — GAP 4.1.3.
 *
 * Formül seçimi tutar alanını değiştirir: `equal` "birim başı tutar" ister,
 * diğerleri "dağıtılacak havuz". Aynı alanı iki anlamda kullanmak, yöneticinin
 * 1.500 TL'yi "her daireye" mi "toplam" mı girdiğini belirsiz bırakıyordu —
 * bu belirsizlik en pahalı hata türü.
 */
export function DuesPlanForm({
  blocks,
  defaults,
  defaultStartPeriod,
  cancelHref,
  submitLabel,
  layout,
  onCancel,
  stayOnSuccess,
  onSaved,
}: {
  blocks: { id: string; name: string }[];
  defaults?: {
    id: string;
    name: string;
    period: string;
    formula: string;
    baseAmountKurus: number;
    totalAmountKurus: number;
    mixEqualPct: number;
    dueDayOfMonth: number;
    lateFeeMonthlyPct: string;
    lateFeeDailyMode: boolean;
    startPeriod: string;
    endPeriod: string | null;
    blockIds: string[];
    unitTypes: string[];
    isActive: boolean;
    notes: string | null;
  };
  defaultStartPeriod: string;
  cancelHref?: string;
  submitLabel: string;
  /** `"modal"`: alanlar kayar, Vazgeç/Kaydet çubuğu çekmecenin altına sabitlenir. */
  layout?: "page" | "modal";
  onCancel?: () => void;
  /** Çekmecede: kayıt sonrası sayfa değiştirme. */
  stayOnSuccess?: boolean;
  onSaved?: () => void;
}) {
  const t = useTranslations("app.duesPlans");
  const tUnits = useTranslations("app.units");
  const tEnum = useTranslations("enum");
  const [formula, setFormula] = useState(defaults?.formula ?? "equal");

  const isEqual = formula === "equal";
  const isMixed = formula === "mixed";

  return (
    <ActionForm
      action={saveDuesPlan}
      submitLabel={submitLabel}
      cancelHref={cancelHref}
      layout={layout}
      onCancel={onCancel}
      stayOnSuccess={stayOnSuccess}
      onSuccess={onSaved}
    >
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <FormSection
        title={t("sectionBasics")}
        description={t("sectionBasicsHint")}
      >
        <div className="sm:col-span-2">
          <FormField
            name="name"
            label={t("planName")}
            required
            hint={t("planNameHint")}
          >
            <Input
              name="name"
              defaultValue={defaults?.name}
              required
              minLength={3}
              maxLength={120}
            />
          </FormField>
        </div>

        <FormField name="period" label={t("period")} required>
          <Select
            name="period"
            defaultValue={defaults?.period ?? "monthly"}
            required
          >
            {(
              [
                "monthly",
                "quarterly",
                "semiannual",
                "yearly",
                "one_time",
              ] as const
            ).map((value) => (
              <option key={value} value={value}>
                {tEnum(`duesPeriod.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          name="dueDayOfMonth"
          label={t("dueDay")}
          hint={t("dueDayHint")}
          required
        >
          <Input
            name="dueDayOfMonth"
            type="number"
            inputMode="numeric"
            min={1}
            max={28}
            defaultValue={defaults?.dueDayOfMonth ?? 10}
            required
          />
        </FormField>

        <FormField name="startPeriod" label={t("startPeriod")} required>
          <PeriodInput
            name="startPeriod"
            defaultValue={defaults?.startPeriod ?? defaultStartPeriod}
            required
          />
        </FormField>

        <FormField
          name="endPeriod"
          label={t("endPeriod")}
          hint={t("endPeriodHint")}
        >
          <PeriodInput
            name="endPeriod"
            defaultValue={defaults?.endPeriod ?? undefined}
          />
        </FormField>
      </FormSection>

      <FormSection
        title={t("sectionFormula")}
        description={t("sectionFormulaHint")}
        columns={1}
      >
        <RadioGroup
          name="formula"
          columns={2}
          defaultValue={formula}
          onChange={setFormula}
          options={[
            {
              value: "equal",
              label: t("formulaEqual"),
              description: t("formulaEqualHint"),
            },
            {
              value: "land_share",
              label: t("formulaLandShare"),
              description: t("formulaLandShareHint"),
            },
            {
              value: "area",
              label: t("formulaArea"),
              description: t("formulaAreaHint"),
            },
            {
              value: "person_count",
              label: t("formulaPerson"),
              description: t("formulaPersonHint"),
            },
            {
              value: "meter",
              label: t("formulaMeter"),
              description: t("formulaMeterHint"),
            },
            {
              value: "mixed",
              label: t("formulaMixed"),
              description: t("formulaMixedHint"),
            },
          ]}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* İki tutar alanı da forma gönderilir; sunucu formüle göre olanı kullanır.
              Gizlemek yerine pasifleştirmek, yöneticinin ne değiştiğini görmesini sağlıyor. */}
          <FormField
            name="baseAmountKurus"
            label={t("baseAmount")}
            hint={isEqual ? t("baseAmountHint") : t("baseAmountDisabled")}
          >
            <MoneyInput
              name="baseAmountKurus"
              defaultKurus={defaults?.baseAmountKurus ?? 0}
              disabled={!isEqual}
            />
          </FormField>

          <FormField
            name="totalAmountKurus"
            label={t("totalAmount")}
            hint={isEqual ? t("totalAmountDisabled") : t("totalAmountHint")}
          >
            <MoneyInput
              name="totalAmountKurus"
              defaultKurus={defaults?.totalAmountKurus ?? 0}
              disabled={isEqual}
            />
          </FormField>
        </div>

        {isMixed ? (
          <FormField
            name="mixEqualPct"
            label={t("mixEqualPct")}
            hint={t("mixEqualPctHint")}
          >
            <Input
              name="mixEqualPct"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              defaultValue={defaults?.mixEqualPct ?? 50}
            />
          </FormField>
        ) : (
          <input
            type="hidden"
            name="mixEqualPct"
            value={defaults?.mixEqualPct ?? 50}
          />
        )}

        {formula === "meter" ? (
          <Alert tone="info">{t("meterNotice")}</Alert>
        ) : null}
      </FormSection>

      <FormSection
        title={t("sectionLateFee")}
        description={t("sectionLateFeeHint")}
        columns={1}
      >
        <FormField
          name="lateFeeMonthlyPct"
          label={t("lateFeePct")}
          hint={t("lateFeePctHint")}
        >
          <Input
            name="lateFeeMonthlyPct"
            inputMode="decimal"
            defaultValue={defaults?.lateFeeMonthlyPct ?? "5"}
            placeholder="5"
          />
        </FormField>
        <Switch
          name="lateFeeDailyMode"
          label={t("lateFeeDaily")}
          description={t("lateFeeDailyHint")}
          defaultChecked={defaults?.lateFeeDailyMode}
        />
        <Alert tone="warning">{t("lateFeeLegalNotice")}</Alert>
      </FormSection>

      <FormSection
        title={t("sectionScope")}
        description={t("sectionScopeHint")}
        columns={1}
      >
        {blocks.length > 0 ? (
          <FormField
            name="blockIds"
            label={tUnits("block")}
            hint={t("blockScopeHint")}
          >
            <CheckboxGroup
              name="blockIds"
              columns={3}
              defaultValues={defaults?.blockIds ?? []}
              options={blocks.map((block) => ({
                value: block.id,
                label: block.name,
              }))}
            />
          </FormField>
        ) : null}

        <FormField
          name="unitTypes"
          label={tUnits("type")}
          hint={t("unitTypeScopeHint")}
        >
          <CheckboxGroup
            name="unitTypes"
            columns={3}
            defaultValues={defaults?.unitTypes ?? []}
            options={(
              ["flat", "shop", "office", "depot", "garage", "villa"] as const
            ).map((type) => ({
              value: type,
              label: tEnum(`unitType.${type}`),
            }))}
          />
        </FormField>

        <Switch
          name="isActive"
          label={t("isActive")}
          description={t("isActiveHint")}
          defaultChecked={defaults?.isActive ?? true}
        />

        <FormField name="notes" label={t("notes")} hint={t("notesHint")}>
          <Textarea
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={defaults?.notes ?? ""}
          />
        </FormField>
      </FormSection>
    </ActionForm>
  );
}
