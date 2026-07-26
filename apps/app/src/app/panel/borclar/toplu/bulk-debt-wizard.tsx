"use client";

import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import {
  Alert, CheckboxGroup, FormSection, Input, MoneyInput, PeriodInput, RadioGroup, Select,
  Spinner, Switch, tableClasses as tc, kurusToDisplay,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { createBulkDebts, previewBulkDebts, type BulkDebtPreview } from "../actions";

/**
 * Toplu borçlandırma sihirbazı — GAP 4.1.3 ("önizleme, onay, çalıştırma").
 *
 * ÖNİZLEME ZORUNLU AKIŞ PARÇASI: "Kaydet" düğmesi, önizleme alınmadan
 * pasif kalır. Gerekçe: 120 daireye yanlış formülle borç yazmanın geri dönüşü
 * tek tek iptal etmektir. Önizleme sunucudaki **aynı** dağıtım fonksiyonunu
 * çağırır (`distributeDues`), yani ekranda görülen tutar kaydedilecek tutardır
 * — ayrı bir istemci hesabı yok.
 *
 * "Zaten var olanları atla" varsayılan açık: aynı dönem için ikinci kez
 * çalıştırmak en sık yapılan hata ve çift borç en pahalı sonuç.
 */
export function BulkDebtWizard({
  blocks,
  defaultPeriod,
  cancelHref,
}: {
  blocks: { id: string; name: string }[];
  defaultPeriod: string;
  cancelHref: string;
}) {
  const t = useTranslations("app.debts");
  const tUnits = useTranslations("app.units");
  const tCommon = useTranslations("common");
  const tEnum = useTranslations("enum");

  type DebtKind = "dues" | "utility" | "extra" | "penalty";
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<DebtKind>("dues");
  const [period, setPeriod] = useState(defaultPeriod);
  const [dueDay, setDueDay] = useState(10);
  const [formula, setFormula] = useState("equal");
  const [amountKurus, setAmountKurus] = useState(0);
  const [shareTarget, setShareTarget] = useState("owner");
  const [blockIds, setBlockIds] = useState<string[]>([]);
  const [skipExisting, setSkipExisting] = useState(true);

  const [preview, setPreview] = useState<{
    rows: BulkDebtPreview[];
    totalKurus: number;
    error?: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function runPreview() {
    startTransition(async () => {
      const result = await previewBulkDebts({
        description: description || "önizleme",
        kind,
        period,
        dueDay,
        formula: formula as "equal" | "land_share" | "area" | "person_count" | "custom",
        amountKurus,
        shareTarget: shareTarget as "owner" | "tenant" | "split" | "share",
        blockIds,
        unitTypes: [],
        skipExisting,
        lateFeeExempt: false,
      });
      setPreview(result);
    });
  }

  const canSubmit = preview !== null && !preview.error && preview.rows.length > 0;
  const skippedCount = preview?.rows.filter((row) => skipExisting && row.alreadyExists).length ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-6">
          <ActionForm
            action={createBulkDebts}
            submitLabel={t("bulkSubmit")}
            cancelHref={cancelHref}
            footer={
              <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                <button
                  type="button"
                  onClick={runPreview}
                  disabled={pending || amountKurus <= 0}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold text-fg hover:bg-hover disabled:opacity-50"
                >
                  {pending ? (
                    <Spinner label={tCommon("state.processing")} />
                  ) : (
                    <Eye aria-hidden className="h-4 w-4" />
                  )}
                  {t("previewAction")}
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  title={canSubmit ? undefined : t("previewRequired")}
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
                >
                  {t("bulkSubmit")}
                </button>
              </div>
            }
          >
            <FormSection title={t("sectionWhat")} description={t("sectionWhatHint")}>
              <div className="sm:col-span-2">
                <FormField name="description" label={tUnits("debtDescription")} required>
                  <Input
                    name="description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder={t("bulkDescriptionPlaceholder")}
                  />
                </FormField>
              </div>

              <FormField name="kind" label={t("kind")} required>
                <Select
                  name="kind"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as DebtKind)}
                  required
                >
                  {(["dues", "utility", "extra", "penalty"] as const).map((value) => (
                    <option key={value} value={value}>
                      {tEnum(`debtKind.${value}`)}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField name="period" label={tUnits("period")} required>
                <PeriodInput
                  name="period"
                  defaultValue={period}
                  required
                />
              </FormField>

              <FormField name="dueDay" label={t("dueDay")} hint={t("dueDayHint")} required>
                <Input
                  name="dueDay"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={28}
                  value={dueDay}
                  onChange={(event) => setDueDay(Number(event.target.value) || 10)}
                  required
                />
              </FormField>
            </FormSection>

            <FormSection title={t("sectionFormula")} description={t("sectionFormulaHint")} columns={1}>
              <RadioGroup
                name="formula"
                columns={2}
                defaultValue={formula}
                onChange={(value) => {
                  setFormula(value);
                  setPreview(null);
                }}
                options={[
                  { value: "equal", label: t("formulaEqual"), description: t("formulaEqualHint") },
                  {
                    value: "land_share",
                    label: t("formulaLandShare"),
                    description: t("formulaLandShareHint"),
                  },
                  { value: "area", label: t("formulaArea"), description: t("formulaAreaHint") },
                  {
                    value: "person_count",
                    label: t("formulaPerson"),
                    description: t("formulaPersonHint"),
                  },
                ]}
              />

              <FormField
                name="amountKurus"
                label={formula === "equal" ? t("amountPerUnit") : t("amountPool")}
                hint={formula === "equal" ? t("amountPerUnitHint") : t("amountPoolHint")}
                required
              >
                <MoneyInput
                  name="amountKurus"
                  onKurusChange={(value) => {
                    setAmountKurus(value);
                    setPreview(null);
                  }}
                  required
                />
              </FormField>
            </FormSection>

            <FormSection title={t("sectionScope")} description={t("sectionScopeHint")} columns={1}>
              {blocks.length > 0 ? (
                <FormField name="blockIds" label={tUnits("block")} hint={t("blockScopeHint")}>
                  <CheckboxGroup
                    name="blockIds"
                    columns={3}
                    options={blocks.map((block) => ({ value: block.id, label: block.name }))}
                  />
                </FormField>
              ) : null}

              <RadioGroup
                name="shareTarget"
                legend={t("sectionShare")}
                columns={2}
                defaultValue={shareTarget}
                onChange={(value) => {
                  setShareTarget(value);
                  setPreview(null);
                }}
                options={[
                  { value: "owner", label: t("shareOwner"), description: t("shareOwnerHint") },
                  { value: "tenant", label: t("shareTenant"), description: t("shareTenantHint") },
                  { value: "split", label: t("shareSplit"), description: t("shareSplitHint") },
                  { value: "share", label: t("shareByShare"), description: t("shareByShareHint") },
                ]}
              />

              <Switch
                name="skipExisting"
                label={t("skipExisting")}
                description={t("skipExistingHint")}
                checked={skipExisting}
                onCheckedChange={setSkipExisting}
              />
              <Switch
                name="lateFeeExempt"
                label={tUnits("lateFeeExempt")}
                description={t("bulkLateFeeExemptHint")}
              />
            </FormSection>
          </ActionForm>
        </div>
      </div>

      {/* Önizleme sütunu */}
      <div className="lg:col-span-2">
        <div className="sticky top-20 rounded-lg border border-border bg-surface">
          <div className="border-b border-border p-4">
            <h3 className="text-base font-semibold text-fg">{t("previewTitle")}</h3>
            <p className="mt-0.5 text-sm text-fg-muted">{t("previewHint")}</p>
          </div>

          {preview === null ? (
            <p className="p-6 text-center text-sm text-fg-subtle">{t("previewEmpty")}</p>
          ) : preview.error ? (
            <div className="p-4">
              <Alert tone="warning">{preview.error}</Alert>
            </div>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 border-b border-border p-4 text-sm">
                <div>
                  <dt className="text-xs text-fg-subtle">{t("previewUnitCount")}</dt>
                  <dd className="text-lg font-bold tabular-nums text-fg">
                    {preview.rows.length - skippedCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">{t("previewTotal")}</dt>
                  <dd className="text-lg font-bold tabular-nums text-fg">
                    {kurusToDisplay(preview.totalKurus)} ₺
                  </dd>
                </div>
              </dl>

              {skippedCount > 0 ? (
                <div className="p-4 pb-0">
                  <Alert tone="info">{t("previewSkipped", { count: skippedCount })}</Alert>
                </div>
              ) : null}

              <div className={`${tc.wrapper} max-h-96 overflow-y-auto`}>
                <table className={tc.table}>
                  <thead className={`${tc.thead} sticky top-0 bg-surface`}>
                    <tr>
                      <th scope="col" className={tc.th}>{tUnits("number")}</th>
                      <th scope="col" className={`${tc.th} text-right`}>{tUnits("amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => {
                      const skipped = skipExisting && row.alreadyExists;
                      return (
                        <tr
                          key={row.unitId}
                          className={`${tc.tr} ${skipped || row.exempt ? "opacity-45" : ""}`}
                        >
                          <td className={tc.td}>
                            {row.blockName ? `${row.blockName}/${row.unitNumber}` : row.unitNumber}
                            {row.exempt ? (
                              <span className="ml-1 text-xs text-warning-fg">
                                {tUnits("duesExempt")}
                              </span>
                            ) : null}
                            {skipped ? (
                              <span className="ml-1 text-xs text-info-fg">{t("existsBadge")}</span>
                            ) : null}
                          </td>
                          <td className={tc.tdNum}>
                            {skipped ? "—" : `${kurusToDisplay(row.amountKurus)} ₺`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
