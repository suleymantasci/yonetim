"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import {
  BUDGET_FORMULAS,
  BUDGET_STAFF_KEY,
  monthsBetween,
} from "@yonetim/contracts";
import {
  FormSection,
  Input,
  MoneyInput,
  PeriodInput,
  Select,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveBudget } from "./actions";

export interface BudgetFormLine {
  key: string;
  label: string;
  source: string;
  plannedMinor: number;
}

export interface BudgetFormDefaults {
  id?: string;
  name: string;
  startPeriod: string;
  endPeriod: string;
  formula: string;
  mixEqualPct: number;
  reservePct: number;
  notes: string | null;
  lines: BudgetFormLine[];
}

let seq = 0;
const newKey = () => `l${Date.now().toString(36)}${(seq += 1)}`;

/**
 * İşletme projesi formu. Kalemler aynı adlı alan dizileri olarak gönderiliyor
 * (`lineLabel`, `lineSource`, `lineAmount`); satır ekleyip silmek yalnız
 * istemci durumunu değiştiriyor. Toplam, yedek ve aylık avans canlı
 * hesaplanıyor — sunucu aynı formülü uyguluyor (`toRow`).
 */
export function BudgetForm({
  defaults,
  categories,
  submitLabel,
  cancelHref,
}: {
  defaults: BudgetFormDefaults;
  categories: { id: string; name: string }[];
  submitLabel: string;
  cancelHref: string;
}) {
  const t = useTranslations("app.budget");
  const [lines, setLines] = useState<BudgetFormLine[]>(defaults.lines);
  const [formula, setFormula] = useState(defaults.formula);
  const [reserve, setReserve] = useState(String(defaults.reservePct));
  const [start, setStart] = useState(defaults.startPeriod);
  const [end, setEnd] = useState(defaults.endPeriod);

  const sum = lines.reduce((s, l) => s + l.plannedMinor, 0);
  const reservePct = Math.max(0, Number(reserve.replace(",", ".")) || 0);
  const total = Math.round(sum * (1 + reservePct / 100));
  const monthCount = useMemo(
    () =>
      /^\d{4}-\d{2}$/.test(start) && /^\d{4}-\d{2}$/.test(end) && start <= end
        ? monthsBetween(start, end)
        : 0,
    [start, end],
  );
  const money = (kurus: number) =>
    new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
    }).format(kurus / 100);

  const update = (key: string, patch: Partial<BudgetFormLine>) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );

  return (
    <ActionForm
      action={saveBudget}
      submitLabel={submitLabel}
      cancelHref={cancelHref}
    >
      {defaults.id ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : null}

      <FormSection
        title={t("sectionGeneral")}
        description={t("sectionGeneralHint")}
      >
        <div className="sm:col-span-2">
          <FormField name="name" label={t("name")} required>
            <Input
              name="name"
              defaultValue={defaults.name}
              minLength={3}
              maxLength={160}
              required
            />
          </FormField>
        </div>
        <FormField name="startPeriod" label={t("startPeriod")} required>
          <span
            onChange={(e) => setStart((e.target as HTMLInputElement).value)}
          >
            <PeriodInput
              name="startPeriod"
              defaultValue={defaults.startPeriod}
              required
            />
          </span>
        </FormField>
        <FormField
          name="endPeriod"
          label={t("endPeriod")}
          hint={t("endPeriodHint")}
          required
        >
          <span onChange={(e) => setEnd((e.target as HTMLInputElement).value)}>
            <PeriodInput
              name="endPeriod"
              defaultValue={defaults.endPeriod}
              required
            />
          </span>
        </FormField>
        <FormField
          name="formula"
          label={t("formula")}
          hint={t("formulaHint")}
          required
        >
          <Select
            name="formula"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            required
          >
            {BUDGET_FORMULAS.map((f) => (
              <option key={f} value={f}>
                {t(`formulaOption.${f}`)}
              </option>
            ))}
          </Select>
        </FormField>
        {formula === "mixed" ? (
          <FormField
            name="mixEqualPct"
            label={t("mixEqualPct")}
            hint={t("mixEqualPctHint")}
            required
          >
            <Input
              name="mixEqualPct"
              type="number"
              min={0}
              max={100}
              defaultValue={defaults.mixEqualPct}
              required
            />
          </FormField>
        ) : (
          <input
            type="hidden"
            name="mixEqualPct"
            value={defaults.mixEqualPct}
          />
        )}
        <FormField
          name="reservePct"
          label={t("reservePct")}
          hint={t("reservePctHint")}
        >
          <Input
            name="reservePct"
            inputMode="decimal"
            value={reserve}
            onChange={(e) => setReserve(e.target.value)}
            maxLength={5}
          />
        </FormField>
      </FormSection>

      <FormSection
        title={t("sectionLines")}
        description={t("sectionLinesHint")}
      >
        <div className="space-y-3 sm:col-span-2">
          {lines.map((line, i) => (
            <div
              key={line.key}
              className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_12rem_10rem_auto] sm:items-end sm:border-0 sm:p-0"
            >
              <label className="text-xs text-fg-subtle">
                <span className={i === 0 ? "" : "sm:sr-only"}>
                  {t("lineLabel")}
                </span>
                <Input
                  name="lineLabel"
                  value={line.label}
                  onChange={(e) => update(line.key, { label: e.target.value })}
                  maxLength={160}
                  className="mt-0.5"
                />
              </label>
              <label className="text-xs text-fg-subtle">
                <span className={i === 0 ? "" : "sm:sr-only"}>
                  {t("lineSource")}
                </span>
                <Select
                  name="lineSource"
                  value={line.source}
                  onChange={(e) => update(line.key, { source: e.target.value })}
                  className="mt-0.5"
                >
                  <option value="">{t("sourceNone")}</option>
                  <option value={BUDGET_STAFF_KEY}>{t("sourceStaff")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-xs text-fg-subtle">
                <span className={i === 0 ? "" : "sm:sr-only"}>
                  {t("linePlanned")}
                </span>
                <div className="mt-0.5">
                  <MoneyInput
                    name="lineAmount"
                    defaultKurus={line.plannedMinor}
                    onKurusChange={(kurus) =>
                      update(line.key, { plannedMinor: kurus })
                    }
                  />
                </div>
              </label>
              <button
                type="button"
                onClick={() =>
                  setLines((prev) => prev.filter((l) => l.key !== line.key))
                }
                aria-label={t("removeLine")}
                className="inline-flex h-10 w-10 items-center justify-center justify-self-end rounded-lg text-fg-subtle hover:bg-hover hover:text-danger-fg"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                { key: newKey(), label: "", source: "", plannedMinor: 0 },
              ])
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
          >
            <Plus aria-hidden className="h-4 w-4" />
            {t("addLine")}
          </button>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-surface-sunken p-3 text-sm sm:grid-cols-4">
            <dt className="text-fg-subtle">{t("linesTotal")}</dt>
            <dd className="text-right tabular-nums text-fg sm:text-left">
              {money(sum)}
            </dd>
            <dt className="text-fg-subtle">{t("reserve")}</dt>
            <dd className="text-right tabular-nums text-fg sm:text-left">
              {money(total - sum)}
            </dd>
            <dt className="font-semibold text-fg">{t("grandTotal")}</dt>
            <dd className="text-right font-semibold tabular-nums text-fg sm:text-left">
              {money(total)}
            </dd>
            <dt className="font-semibold text-fg">
              {t("monthly", { months: monthCount })}
            </dt>
            <dd className="text-right font-semibold tabular-nums text-fg sm:text-left">
              {monthCount > 0 ? money(Math.round(total / monthCount)) : "—"}
            </dd>
          </dl>
        </div>
      </FormSection>

      <FormSection title={t("sectionNotes")}>
        <div className="sm:col-span-2">
          <FormField name="notes" label={t("notes")}>
            <Textarea
              name="notes"
              rows={3}
              defaultValue={defaults.notes ?? ""}
              maxLength={2000}
            />
          </FormField>
        </div>
      </FormSection>
    </ActionForm>
  );
}
