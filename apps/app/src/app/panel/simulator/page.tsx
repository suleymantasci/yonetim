import { getTranslations } from "next-intl/server";

import { currentPeriod, tlToKurus } from "@yonetim/core";
import { simulate } from "@yonetim/dues";
import {
  Alert, Card, CardBody, CardHeader, Field, Input, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { getDashboardSummary } from "@/lib/queries";

/**
 * Bütçe / Aidat Simülatörü — SPEC Bölüm 3.4 (VURUCU ÖZELLİK).
 * Tüm hesap deterministiktir; form GET ile çalışır, sonuç sunucuda hesaplanır.
 */
export const dynamic = "force-dynamic";

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("dues:simulate");
  const params = await searchParams;
  const summary = await getDashboardSummary(ctx);
  const t = await getTranslations("app.simulator");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  // Form doldurulmadıysa sitenin gerçek verisinden başlangıç değeri türetilir.
  const accruedTl = Math.round(summary.accruedThisMonthKurus / 100);
  const expenseTl = Math.round(summary.expenseThisMonthKurus / 100);
  const monthlyDuesTl = num(params.aidat) ?? (accruedTl > 0 ? accruedTl : 30_000);
  const monthlyExpenseTl = num(params.gider) ?? (expenseTl > 0 ? expenseTl : 28_000);
  const increasePct = num(params.artis) ?? 20;
  const openingTl = num(params.kasa) ?? 0;
  const collectionPct =
    num(params.tahsilat) ??
    Math.round((summary.collectionRate > 0 ? summary.collectionRate : 0.85) * 100);
  const inflationPct = num(params.enflasyon) ?? 35;
  const extraTl = num(params.ek) ?? 0;
  const extraMonth = num(params.ekay) ?? 6;

  const result = simulate({
    startPeriod: currentPeriod(),
    months: 12,
    unitCount: Math.max(1, summary.unitCount),
    currentMonthlyDuesKurus: tlToKurus(monthlyDuesTl),
    increasePct,
    monthlyExpenseKurus: tlToKurus(monthlyExpenseTl),
    expenseInflationAnnualPct: inflationPct,
    openingBalanceKurus: tlToKurus(openingTl),
    collectionRate: collectionPct / 100,
    extraItems:
      extraTl > 0
        ? [{ month: extraMonth, label: "extra", amountKurus: tlToKurus(extraTl), spreadMonths: 1 }]
        : [],
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <form className="mb-6 grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-4">
        <Field label={t("monthlyDues")}>
          <Input name="aidat" type="number" defaultValue={monthlyDuesTl} min={0} />
        </Field>
        <Field label={t("increasePct")}>
          <Input name="artis" type="number" defaultValue={increasePct} min={0} max={300} />
        </Field>
        <Field label={t("monthlyExpense")}>
          <Input name="gider" type="number" defaultValue={monthlyExpenseTl} min={0} />
        </Field>
        <Field label={t("inflation")}>
          <Input name="enflasyon" type="number" defaultValue={inflationPct} min={0} max={200} />
        </Field>
        <Field label={t("openingBalance")}>
          <Input name="kasa" type="number" defaultValue={openingTl} />
        </Field>
        <Field label={t("collectionRate")} hint={t("collectionRateHint")}>
          <Input name="tahsilat" type="number" defaultValue={collectionPct} min={30} max={100} />
        </Field>
        <Field label={t("extraExpense")} hint={t("extraExpenseHint")}>
          <Input name="ek" type="number" defaultValue={extraTl} min={0} />
        </Field>
        <Field label={t("extraMonth")}>
          <Input name="ekay" type="number" defaultValue={extraMonth} min={1} max={12} />
        </Field>
        <div className="flex items-end">
          <button className="h-10 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
            {tCommon("action.calculate")}
          </button>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("endingBalance")}
          value={f.money(result.summary.endingBalanceKurus)}
          tone={result.summary.endingBalanceKurus >= 0 ? "success" : "danger"}
        />
        <Stat
          label={t("minBalance")}
          value={f.money(result.summary.minBalanceKurus)}
          hint={f.period(result.summary.minBalanceMonth)}
          tone={result.summary.minBalanceKurus >= 0 ? "neutral" : "danger"}
        />
        <Stat
          label={t("perUnitMonthly")}
          value={f.money(result.summary.newPerUnitMonthlyKurus)}
          hint={t("perUnitPrevious", { amount: f.money(result.summary.oldPerUnitMonthlyKurus) })}
        />
        <Stat
          label={t("requiredIncrease")}
          value={`${result.summary.requiredIncreasePct}%`}
          hint={t("requiredIncreaseHint")}
          tone={result.summary.requiredIncreasePct > increasePct ? "warning" : "success"}
        />
      </div>

      {result.warnings.length > 0 ? (
        <div className="mt-4 space-y-2">
          {result.warnings.map((w) => (
            <Alert key={w.code} tone="warning">
              {t(`warning.${w.code}`, {
                ...w.params,
                ...(w.params?.month ? { month: f.period(String(w.params.month)) } : {}),
              })}
            </Alert>
          ))}
        </div>
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title={t("cashFlowTitle")}
          description={t("cashFlowDescription", {
            rate: Math.round(result.summary.estimatedCollectionRate * 100),
          })}
        />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table} style={{ minWidth: 720 }}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>{t("period")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("accrued")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("expectedCollection")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("expense")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("net")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("balance")}</th>
                </tr>
              </thead>
              <tbody>
                {result.months.map((m) => (
                  <tr key={m.periodKey} className={tc.tr}>
                    <td className={tc.td}>{f.period(m.periodKey)}</td>
                    <td className={tc.tdNum}>{f.money(m.accruedDuesKurus)}</td>
                    <td className={tc.tdNum}>{f.money(m.expectedCollectionKurus)}</td>
                    <td className={tc.tdNum}>{f.money(m.expenseKurus + m.extraExpenseKurus)}</td>
                    <td className={`${tc.tdNum} ${m.netKurus < 0 ? "text-danger-fg" : ""}`}>
                      {f.money(m.netKurus)}
                    </td>
                    <td
                      className={`${tc.tdNum} font-semibold ${
                        m.closingBalanceKurus < 0 ? "text-danger-fg" : ""
                      }`}
                    >
                      {f.money(m.closingBalanceKurus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}

function num(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
