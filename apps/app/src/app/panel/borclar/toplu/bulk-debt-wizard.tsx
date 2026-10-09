"use client";

import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  Alert,
  CheckboxGroup,
  FormSection,
  Input,
  MoneyInput,
  PeriodInput,
  RadioGroup,
  Select,
  Spinner,
  Switch,
  tableClasses as tc,
  kurusToDisplay,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import {
  createBulkDebts,
  previewBulkDebts,
  type BulkDebtPreview,
} from "../actions";
import type { DebtTypeOption } from "../yeni/debt-form";

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
/**
 * Bir aidat planından taşınan başlangıç değerleri.
 *
 * NEDEN KOPYALANIYOR, BAĞLANMIYOR: sihirbaz **tek seferlik** bir
 * borçlandırma yapıyor; plana bağlanmış olsaydı üretilen borçlar planın
 * dönemsel koşusuyla karışır ve `dues_runs` idempotanslığı iki farklı
 * kaynaktan gelen aynı dönemi ayırt edemezdi. Plan burada bir **şablon**:
 * alanları doldurur, sonra bağı kopar. Planın kendisini çalıştırmak için
 * plan ekranındaki "şimdi çalıştır" var (PROJE-DURUMU §5.4).
 */
export interface BulkDebtPreset {
  planName: string;
  formula: string;
  amountKurus: number;
  dueDay: number;
  blockIds: string[];
}

export function BulkDebtWizard({
  blocks,
  debtTypes,
  defaultPeriod,
  cancelHref,
  preset,
}: {
  blocks: { id: string; name: string }[];
  debtTypes: DebtTypeOption[];
  defaultPeriod: string;
  cancelHref: string;
  preset?: BulkDebtPreset;
}) {
  const t = useTranslations("app.debts");
  const tUnits = useTranslations("app.units");
  const tCommon = useTranslations("common");
  const tTypes = useTranslations("app.debtTypes");

  const [description, setDescription] = useState(preset?.planName ?? "");
  const [debtTypeId, setDebtTypeId] = useState(debtTypes[0]?.id ?? "");
  const selectedType = debtTypes.find((type) => type.id === debtTypeId);
  const [dueDay, setDueDay] = useState(preset?.dueDay ?? 10);
  const [formula, setFormula] = useState(preset?.formula ?? "equal");
  const [amountKurus, setAmountKurus] = useState(preset?.amountKurus ?? 0);
  const [shareTarget, setShareTarget] = useState("rule");
  const [skipExisting, setSkipExisting] = useState(true);
  /** Satır düzeltmeleri — önizlemede tutar, hariç tut, borçlu. */
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const formWrap = useRef<HTMLDivElement>(null);

  const [preview, setPreview] = useState<{
    rows: BulkDebtPreview[];
    totalKurus: number;
    periods: string[];
    error?: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  /** Ana alanlardan biri değişince önizleme ve satır düzeltmeleri geçersiz. */
  function invalidate() {
    invalidate();
    setOverrides({});
  }

  function overrideList(map: Record<string, Override>) {
    return Object.entries(map)
      .map(([unitId, o]) => ({ unitId, ...o }))
      .filter((o) => o.amountMinor !== undefined || o.excluded || o.target);
  }

  /**
   * Önizleme **formdaki** değerlerle: dönem, bitiş dönemi, bloklar ve
   * anahtarlar doğrudan formdan okunuyor — ekranda görülen, kaydedilenle aynı.
   */
  function runPreview(nextOverrides: Record<string, Override> = overrides) {
    const form = formWrap.current?.querySelector("form");
    if (!form) return;
    const fd = new FormData(form);
    startTransition(async () => {
      const result = await previewBulkDebts({
        description: description || "önizleme",
        debtTypeId,
        period: String(fd.get("period") ?? ""),
        untilPeriod: String(fd.get("untilPeriod") ?? ""),
        dueDay,
        formula: formula as
          "equal" | "land_share" | "area" | "person_count" | "custom",
        amountKurus,
        shareTarget: shareTarget as
          | "rule"
          | "occupant"
          | "owner"
          | "tenant"
          | "split"
          | "share",
        blockIds: fd.getAll("blockIds").map(String),
        unitTypes: [],
        skipExisting,
        lateFeeExempt: fd.get("lateFeeExempt") === "on",
        overrides: overrideList(nextOverrides),
      });
      setPreview(result);
    });
  }

  function setOverride(unitId: string, patch: Partial<Override>, refresh = true) {
    const next = { ...overrides, [unitId]: { ...overrides[unitId], ...patch } };
    setOverrides(next);
    if (refresh) runPreview(next);
  }

  const canSubmit =
    preview !== null && !preview.error && preview.rows.length > 0;
  const skippedCount =
    preview?.rows.filter(
      (row) => row.excluded || row.debtorError || (skipExisting && row.alreadyExists),
    ).length ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        {preset ? (
          <div className="mb-4">
            <Alert tone="info" title={t("presetTitle", { plan: preset.planName })}>
              {t("presetBody")}
            </Alert>
          </div>
        ) : null}
        <div
          ref={formWrap}
          onChange={(event) => {
            // Açıklama metni önizlemeyi değiştirmez; diğer her alan değiştirir.
            const name = (event.target as HTMLInputElement).name;
            if (name && name !== "description" && name !== "overrides") invalidate();
          }}
          className="rounded-lg border border-border bg-surface p-4 sm:p-6"
        >
          <ActionForm
            action={createBulkDebts}
            submitLabel={t("bulkSubmit")}
            cancelHref={cancelHref}
            footer={
              <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                <button
                  type="button"
                  onClick={() => runPreview()}
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
            <FormSection
              title={t("sectionWhat")}
              description={t("sectionWhatHint")}
            >
              <div className="sm:col-span-2">
                <FormField
                  name="description"
                  label={tUnits("debtDescription")}
                  required
                >
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

              <FormField
                name="debtTypeId"
                label={tTypes("field")}
                hint={tTypes("fieldHint")}
                required
              >
                <Select
                  name="debtTypeId"
                  value={debtTypeId}
                  onChange={(event) => {
                    setDebtTypeId(event.target.value);
                    invalidate();
                  }}
                  required
                >
                  {debtTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} · {tTypes(`debtor.${type.debtor}`)}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField name="period" label={tUnits("period")} required>
                <PeriodInput name="period" defaultValue={defaultPeriod} required />
              </FormField>

              <FormField
                name="untilPeriod"
                label={t("untilPeriod")}
                hint={t("untilPeriodHint")}
              >
                <PeriodInput name="untilPeriod" />
              </FormField>
              <input
                type="hidden"
                name="overrides"
                value={JSON.stringify(overrideList(overrides))}
              />

              <FormField
                name="dueDay"
                label={t("dueDay")}
                hint={t("dueDayHint")}
                required
              >
                <Input
                  name="dueDay"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={28}
                  value={dueDay}
                  onChange={(event) =>
                    setDueDay(Number(event.target.value) || 10)
                  }
                  required
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
                onChange={(value) => {
                  setFormula(value);
                  invalidate();
                }}
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
                ]}
              />

              <FormField
                name="amountKurus"
                label={
                  formula === "equal" ? t("amountPerUnit") : t("amountPool")
                }
                hint={
                  formula === "equal"
                    ? t("amountPerUnitHint")
                    : t("amountPoolHint")
                }
                required
              >
                <MoneyInput
                  name="amountKurus"
                  onKurusChange={(value) => {
                    setAmountKurus(value);
                    invalidate();
                  }}
                  required
                />
              </FormField>
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
                    options={blocks.map((block) => ({
                      value: block.id,
                      label: block.name,
                    }))}
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
                  invalidate();
                }}
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
            <h3 className="text-base font-semibold text-fg">
              {t("previewTitle")}
            </h3>
            <p className="mt-0.5 text-sm text-fg-muted">{t("previewHint")}</p>
          </div>

          {preview === null ? (
            <p className="p-6 text-center text-sm text-fg-subtle">
              {t("previewEmpty")}
            </p>
          ) : preview.error ? (
            <div className="p-4">
              <Alert tone="warning">{preview.error}</Alert>
            </div>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 border-b border-border p-4 text-sm">
                <div>
                  <dt className="text-xs text-fg-subtle">
                    {t("previewUnitCount")}
                  </dt>
                  <dd className="text-lg font-bold tabular-nums text-fg">
                    {preview.rows.length - skippedCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">
                    {t("previewTotal")}
                  </dt>
                  <dd className="text-lg font-bold tabular-nums text-fg">
                    {kurusToDisplay(preview.totalKurus)} ₺
                  </dd>
                </div>
              </dl>

              {preview.periods.length > 1 ? (
                <div className="p-4 pb-0">
                  <Alert tone="info">
                    {t("previewPeriods", {
                      count: preview.periods.length,
                      from: preview.periods[0] ?? "",
                      to: preview.periods.at(-1) ?? "",
                    })}
                  </Alert>
                </div>
              ) : null}
              {skippedCount > 0 ? (
                <div className="p-4 pb-0">
                  <Alert tone="info">
                    {t("previewSkipped", { count: skippedCount })}
                  </Alert>
                </div>
              ) : null}
              <p className="px-4 pt-3 text-xs text-fg-subtle">{t("previewEditHint")}</p>

              <div className={`${tc.wrapper} max-h-[32rem] overflow-y-auto`}>
                <table className={tc.table}>
                  <thead className={`${tc.thead} sticky top-0 z-10 bg-surface`}>
                    <tr>
                      <th scope="col" className={tc.th}>
                        <span className="sr-only">{t("rowInclude")}</span>
                      </th>
                      <th scope="col" className={tc.th}>
                        {tUnits("number")}
                      </th>
                      <th scope="col" className={tc.th}>
                        {t("rowDebtor")}
                      </th>
                      <th scope="col" className={`${tc.th} text-right`}>
                        {tUnits("amount")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => {
                      const label = row.blockName
                        ? `${row.blockName}/${row.unitNumber}`
                        : row.unitNumber;
                      const skipped = skipExisting && row.alreadyExists;
                      const off = row.excluded || skipped || Boolean(row.debtorError);
                      const o = overrides[row.unitId];
                      return (
                        <tr
                          key={row.unitId}
                          className={`${tc.tr} ${off ? "bg-subtle" : ""}`}
                        >
                          <td className={`${tc.td} w-8`}>
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              aria-label={t("rowIncludeUnit", { unit: label })}
                              checked={!(o?.excluded ?? row.excluded)}
                              disabled={pending}
                              onChange={(e) =>
                                setOverride(row.unitId, { excluded: !e.target.checked })
                              }
                            />
                          </td>
                          <td className={`${tc.td} ${off ? "text-fg-subtle" : ""}`}>
                            {label}
                            {row.exempt ? (
                              <span className="block text-xs text-warning-fg">
                                {tUnits("duesExempt")}
                              </span>
                            ) : null}
                            {skipped ? (
                              <span className="block text-xs text-info-fg">
                                {t("existsBadge")}
                              </span>
                            ) : null}
                          </td>
                          <td className={tc.td}>
                            <Select
                              aria-label={t("rowDebtorUnit", { unit: label })}
                              value={o?.target ?? ""}
                              disabled={pending || (o?.excluded ?? row.excluded)}
                              onChange={(e) =>
                                setOverride(row.unitId, {
                                  target: (e.target.value || undefined) as Override["target"],
                                })
                              }
                              className="h-8 min-w-[8rem] text-xs"
                            >
                              <option value="">{t("rowDebtorDefault")}</option>
                              <option value="owner" disabled={!row.hasOwner}>
                                {t("shareOwner")}
                              </option>
                              <option value="tenant" disabled={!row.hasTenant}>
                                {t("shareTenant")}
                              </option>
                              <option value="split" disabled={!row.hasOwner || !row.hasTenant}>
                                {t("shareSplit")}
                              </option>
                              <option value="share" disabled={!row.hasOwner}>
                                {t("shareByShare")}
                              </option>
                            </Select>
                            <span
                              className={`mt-0.5 block text-xs ${row.debtorError ? "text-danger-fg" : "text-fg-subtle"}`}
                            >
                              {row.debtorError
                                ? t(`debtorError.${row.debtorError.split(":")[1] ?? "other"}`)
                                : row.debtorNames.join(", ") || "—"}
                            </span>
                          </td>
                          <td className={`${tc.td} w-32`}>
                            <RowAmount
                              unitLabel={label}
                              kurus={row.amountKurus}
                              formulaKurus={row.formulaKurus}
                              disabled={pending || (o?.excluded ?? row.excluded)}
                              onCommit={(value) =>
                                setOverride(row.unitId, {
                                  amountMinor: value === row.formulaKurus ? undefined : value,
                                })
                              }
                            />
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

interface Override {
  amountMinor?: number;
  excluded?: boolean;
  target?: "owner" | "tenant" | "split" | "share";
}

/**
 * Satır tutarı — yazarken yerel, odak çıkınca (ya da Enter) önizleme
 * sunucuda yeniden hesaplanır; toplam ve atlananlar hep sunucudan.
 */
function RowAmount({
  unitLabel,
  kurus,
  formulaKurus,
  disabled,
  onCommit,
}: {
  unitLabel: string;
  kurus: number;
  formulaKurus: number;
  disabled: boolean;
  onCommit: (kurus: number) => void;
}) {
  const t = useTranslations("app.debts");
  const [text, setText] = useState(kurusToDisplay(kurus));
  useEffect(() => setText(kurusToDisplay(kurus)), [kurus]);
  const commit = () => {
    const value = Math.round(Number(text.replace(/\./g, "").replace(",", ".")) * 100);
    if (Number.isFinite(value) && value >= 0 && value !== kurus) onCommit(value);
    else setText(kurusToDisplay(kurus));
  };
  return (
    <>
      <Input
        aria-label={t("rowAmountUnit", { unit: unitLabel })}
        value={text}
        inputMode="decimal"
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className="h-8 text-right text-sm tabular-nums"
      />
      {kurus !== formulaKurus ? (
        <span className="mt-0.5 block text-right text-xs text-warning-fg">
          {t("rowAmountChanged", { amount: kurusToDisplay(formulaKurus) })}
        </span>
      ) : null}
    </>
  );
}
