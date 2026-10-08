"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Alert,
  Combobox,
  DateInput,
  FormSection,
  Input,
  MoneyInput,
  PeriodInput,
  RadioGroup,
  Select,
  Switch,
  Textarea,
  kurusToDisplay,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { createDebt } from "../actions";

/**
 * Tek borç girişi formu — GAP 4.1.3.
 *
 * İki karar burada açıkça sorulur, varsayılana gömülmez:
 *
 * 1. **Borç kime yazılacak?** Malik / kiracı / yarı yarıya / hisseye göre.
 *    Rakiplerde bu ayar ya yok ya gömülü; sonuç "kiracı ödemedi, malik
 *    bilmiyor" oluyordu. `split` ve `share` seçenekleri birden fazla borç
 *    kaydı üretir — cari hesaplar karışmaz.
 *
 * 2. **Taksit var mı?** Yonetimcell kullanıcısının "taksitlendirip kalan
 *    bakiyeye faiz yürütemiyorum" şikâyetinin karşılığı. Taksit seçilirse
 *    gecikme tazminatı otomatik kapanır: taksit anlaşması zaten gecikmenin
 *    çözümüdür, üstüne faiz yürütmek haksız olurdu.
 */
export interface DebtTypeOption {
  id: string;
  name: string;
  debtor: "occupant" | "owner";
}

export function DebtForm({
  units,
  debtTypes,
  presetUnitId,
  defaultPeriod,
  cancelHref,
  layout,
  onCancel,
  stayOnSuccess,
  onCreated,
}: {
  units: { id: string; number: string; blockName: string | null }[];
  /** Etkin borç türleri; borçlu kuralı ve gecikme türden gelir. */
  debtTypes: DebtTypeOption[];
  presetUnitId?: string;
  defaultPeriod: string;
  cancelHref?: string;
  /** `"modal"`: alanlar kayar, Vazgeç/Kaydet çubuğu çekmecenin altına sabitlenir. */
  layout?: "page" | "modal";
  onCancel?: () => void;
  /** Çekmecede: kayıt sonrası sayfa değiştirme. */
  stayOnSuccess?: boolean;
  /**
   * Oluşan **ilk** borcun kimliği.
   *
   * `createDebt` bir dizi döndürüyor çünkü "yarı yarıya" ve "hisseye göre"
   * yükümlülük seçenekleri birden fazla borç kaydı üretiyor. Çekmecenin
   * "detayı aç" bağlantısı için ilki yeterli — hepsini listelemek iki adımlı
   * bir başarı ekranını üç adıma çıkarırdı.
   */
  onCreated?: (id: string) => void;
}) {
  const t = useTranslations("app.debts");
  const tUnits = useTranslations("app.units");
  const tCommon = useTranslations("common");
  const tTypes = useTranslations("app.debtTypes");

  const [typeId, setTypeId] = useState(debtTypes[0]?.id ?? "");
  const selectedType = debtTypes.find((type) => type.id === typeId);
  const [amountKurus, setAmountKurus] = useState(0);
  const [installments, setInstallments] = useState(1);

  const perInstallment =
    installments > 1 ? Math.floor(amountKurus / installments) : amountKurus;

  return (
    <ActionForm
      action={createDebt}
      submitLabel={tCommon("action.create")}
      cancelHref={cancelHref}
      layout={layout}
      onCancel={onCancel}
      stayOnSuccess={stayOnSuccess}
      onSuccess={(state) => {
        const first = state.data?.ids?.[0];
        if (first) onCreated?.(first);
      }}
    >
      <FormSection
        title={t("sectionTarget")}
        description={t("sectionTargetHint")}
      >
        <FormField name="unitId" label={t("unit")} required>
          <Combobox
            name="unitId"
            options={units.map((unit) => ({
              value: unit.id,
              label: unit.blockName
                ? `${unit.blockName} / ${unit.number}`
                : unit.number,
            }))}
            defaultValues={presetUnitId ? [presetUnitId] : []}
            placeholder={t("selectUnit")}
            searchPlaceholder={t("searchUnit")}
            emptyText={t("noUnitFound")}
          />
        </FormField>

        <FormField
          name="debtTypeId"
          label={tTypes("field")}
          hint={tTypes("fieldHint")}
          required
        >
          <Select
            name="debtTypeId"
            value={typeId}
            onChange={(event) => setTypeId(event.target.value)}
            required
          >
            {debtTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} · {tTypes(`debtor.${type.debtor}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="sm:col-span-2">
          <FormField
            name="description"
            label={tUnits("debtDescription")}
            required
            hint={t("descriptionHint")}
          >
            <Input name="description" required maxLength={200} minLength={3} />
          </FormField>
        </div>
      </FormSection>

      <FormSection
        title={t("sectionAmount")}
        description={t("sectionAmountHint")}
      >
        <FormField name="amountKurus" label={tUnits("amount")} required>
          <MoneyInput
            name="amountKurus"
            onKurusChange={setAmountKurus}
            required
          />
        </FormField>

        <FormField name="dueDate" label={tUnits("dueDate")} required>
          <DateInput name="dueDate" defaultValue={defaultDueDate()} required />
        </FormField>

        <FormField
          name="period"
          label={tUnits("period")}
          hint={t("periodHint")}
        >
          <PeriodInput name="period" defaultValue={defaultPeriod} />
        </FormField>

        <FormField
          name="installmentCount"
          label={t("installmentCount")}
          hint={t("installmentHint")}
        >
          <Input
            name="installmentCount"
            type="number"
            inputMode="numeric"
            min={1}
            max={36}
            value={installments}
            onChange={(event) =>
              setInstallments(Math.max(1, Number(event.target.value) || 1))
            }
          />
        </FormField>

        {installments > 1 && amountKurus > 0 ? (
          <div className="sm:col-span-2">
            <Alert tone="info">
              {t("installmentPreview", {
                count: installments,
                amount: kurusToDisplay(perInstallment),
              })}
            </Alert>
          </div>
        ) : null}
      </FormSection>

      <FormSection
        title={t("sectionShare")}
        description={t("sectionShareHint")}
        columns={1}
      >
        <RadioGroup
          name="shareTarget"
          columns={2}
          defaultValue="rule"
          options={[
            {
              value: "rule",
              label: tTypes("ruleTarget"),
              description: tTypes("ruleTargetHint", {
                rule: selectedType
                  ? tTypes(`debtor.${selectedType.debtor}`)
                  : tTypes("debtor.occupant"),
              }),
            },
            {
              value: "occupant",
              label: tTypes("occupantTarget"),
              description: tTypes("occupantTargetHint"),
            },
            {
              value: "owner",
              label: t("shareOwner"),
              description: t("shareOwnerHint"),
            },
            {
              value: "tenant",
              label: t("shareTenant"),
              description: t("shareTenantHint"),
            },
            {
              value: "split",
              label: t("shareSplit"),
              description: t("shareSplitHint"),
            },
            {
              value: "share",
              label: t("shareByShare"),
              description: t("shareByShareHint"),
            },
          ]}
        />
      </FormSection>

      <FormSection title={t("sectionExtras")} columns={1}>
        <Switch
          name="lateFeeExempt"
          label={tUnits("lateFeeExempt")}
          description={t("lateFeeExemptFormHint")}
          defaultChecked={installments > 1}
        />
        <FormField name="notes" label={t("note")} hint={t("noteHint")}>
          <Textarea name="notes" rows={2} maxLength={1000} />
        </FormField>
      </FormSection>
    </ActionForm>
  );
}

/** Varsayılan vade: içinde bulunduğumuz ayın 10'u geçmişse gelecek ayın 10'u. */
function defaultDueDate(): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), 10);
  if (target.getTime() < now.getTime()) target.setMonth(target.getMonth() + 1);
  return target.toISOString().slice(0, 10);
}
