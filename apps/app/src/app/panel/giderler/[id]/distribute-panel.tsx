"use client";

import { Eye, Split } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import {
  Alert, CheckboxGroup, Drawer, Input, PeriodInput, RadioGroup, Spinner, Switch,
  tableClasses as tc, kurusToDisplay,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { distributeExpense, previewDistribution } from "../actions";

/**
 * Gider → daire dağıtım paneli — GAP 4.1.4.
 *
 * Önizleme zorunlu tutuluyor (buton önizleme alınmadan pasif): dağıtım
 * geri alınamaz bir işlem — sakinlere borç yazar. Yanlış formülle 120 daireye
 * borç yazmanın telafisi tek tek iptal etmektir.
 *
 * Formül varsayılanı kategoriden gelir; yönetici bu gider için farklı bir
 * formül seçebilir (örn. kategori "eşit" ama bu fatura sayaç bazlı).
 */
export function DistributePanel({
  expenseId,
  categoryDistribution,
  amountKurus,
  vatKurus,
  blocks,
  defaultPeriod,
  labels,
}: {
  expenseId: string;
  categoryDistribution: string | null;
  amountKurus: number;
  vatKurus: number;
  blocks: { id: string; name: string }[];
  defaultPeriod: string;
  labels: {
    action: string;
    title: string;
    hint: string;
    formula: string;
    formulaHint: string;
    formulaOptions: { value: string; label: string; description: string }[];
    period: string;
    periodHint: string;
    dueDay: string;
    dueDayHint: string;
    scope: string;
    scopeHint: string;
    excludeVat: string;
    excludeVatHint: string;
    preview: string;
    previewRequired: string;
    previewEmpty: string;
    previewTotal: string;
    previewUnits: string;
    unit: string;
    amount: string;
    exempt: string;
    submit: string;
    cancel: string;
    irreversible: string;
  };
}) {
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [formula, setFormula] = useState(categoryDistribution ?? "equal");
  const [blockIds] = useState<string[]>([]);
  const [excludeVat, setExcludeVat] = useState(false);
  const [preview, setPreview] = useState<{
    rows: { unitNumber: string; amountKurus: number; exempt: boolean }[];
    totalKurus: number;
    error?: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function runPreview() {
    startTransition(async () => {
      const result = await previewDistribution({ expenseId, formula, blockIds, excludeVat });
      setPreview(result);
    });
  }

  const poolKurus = excludeVat ? amountKurus - vatKurus : amountKurus;
  const canSubmit = preview !== null && preview.rows.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
      >
        <Split aria-hidden className="h-4 w-4" />
        {labels.action}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={labels.title}
        description={labels.hint}
        closeLabel={labels.cancel}
        size="xl"
      >
        <ActionForm
          action={distributeExpense}
          submitLabel={labels.submit}
          onSuccess={() => setOpen(false)}
          footer={null}
        >
          <input type="hidden" name="expenseId" value={expenseId} />

          <div className="space-y-5">
            <Alert tone="warning">{labels.irreversible}</Alert>

            <FormField name="formula" label={labels.formula} hint={labels.formulaHint} required>
              <RadioGroup
                name="formula"
                columns={2}
                defaultValue={formula}
                onChange={(value) => {
                  setFormula(value);
                  setPreview(null);
                }}
                options={labels.formulaOptions}
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="period" label={labels.period} hint={labels.periodHint}>
                <PeriodInput name="period" defaultValue={defaultPeriod} />
              </FormField>
              <FormField name="dueDay" label={labels.dueDay} hint={labels.dueDayHint} required>
                <Input
                  name="dueDay"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={28}
                  defaultValue={10}
                  required
                />
              </FormField>
            </div>

            {blocks.length > 0 ? (
              <FormField name="blockIds" label={labels.scope} hint={labels.scopeHint}>
                <CheckboxGroup
                  name="blockIds"
                  columns={3}
                  options={blocks.map((block) => ({ value: block.id, label: block.name }))}
                />
              </FormField>
            ) : null}

            <Switch
              name="excludeVat"
              label={labels.excludeVat}
              description={labels.excludeVatHint}
              checked={excludeVat}
              onCheckedChange={(next) => {
                setExcludeVat(next);
                setPreview(null);
              }}
            />

            <div className="rounded-lg border border-border bg-surface-sunken p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-fg-muted">{labels.previewTotal}</span>
                <span className="font-semibold tabular-nums text-fg">
                  {kurusToDisplay(poolKurus)} ₺
                </span>
              </div>
              <button
                type="button"
                onClick={runPreview}
                disabled={pending}
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover disabled:opacity-50"
              >
                {pending ? (
                  <Spinner label={tCommon("state.processing")} />
                ) : (
                  <Eye aria-hidden className="h-4 w-4" />
                )}
                {labels.preview}
              </button>
            </div>

            {preview === null ? (
              <p className="text-center text-sm text-fg-subtle">{labels.previewEmpty}</p>
            ) : (
              <>
                {preview.error ? <Alert tone="warning">{preview.error}</Alert> : null}
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                    {labels.previewUnits}
                  </p>
                  <div className={`${tc.wrapper} max-h-72 overflow-y-auto rounded-lg border border-border`}>
                    <table className={tc.table}>
                      <thead className={`${tc.thead} sticky top-0 bg-surface`}>
                        <tr>
                          <th scope="col" className={tc.th}>{labels.unit}</th>
                          <th scope="col" className={`${tc.th} text-right`}>{labels.amount}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row) => (
                          <tr
                            key={row.unitNumber}
                            className={`${tc.tr} ${row.exempt ? "opacity-45" : ""}`}
                          >
                            <td className={tc.td}>
                              {row.unitNumber}
                              {row.exempt ? (
                                <span className="ml-1 text-xs text-warning-fg">
                                  {labels.exempt}
                                </span>
                              ) : null}
                            </td>
                            <td className={tc.tdNum}>{kurusToDisplay(row.amountKurus)} ₺</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
            >
              {labels.cancel}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              title={canSubmit ? undefined : labels.previewRequired}
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
            >
              {labels.submit}
            </button>
          </div>
        </ActionForm>
      </Drawer>
    </>
  );
}
