import { getTranslations } from "next-intl/server";

import {
  activitySummaryResponse,
  balanceSheetResponse,
  incomeStatementResponse,
} from "@yonetim/contracts";
import { Card, CardBody, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { EditableNote } from "../editable-note";
import { parseRange, RangeForm, ReportsSubnav } from "../report-tools";
import { PdfButton } from "../pdf-button";
import { pdfHref } from "../pdf-route";

export const dynamic = "force-dynamic";

/**
 * Denetim kurulu raporu (KMK 41) — denetçinin yöneticinin hesaplarını
 * inceleyip kat malikleri kuruluna sunduğu rapor. Sayısal bölümler
 * sistemden (gelir-gider, bilanço, bütçe, alacak); tespit ve ibra önerisi
 * denetçinin kendi metni.
 */
export default async function AuditReportPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("report:read");
  const t = await getTranslations("app.reportsHub");
  const f = await formatters();
  const { from, to } = parseRange(await searchParams);
  const [income, sheet, a] = await Promise.all([
    apiGet(
      `/v1/panel/reports/accounting/income-statement?${toQuery({ from, to })}`,
      incomeStatementResponse,
    ),
    apiGet(
      `/v1/panel/reports/accounting/balance-sheet?${toQuery({ at: to })}`,
      balanceSheetResponse,
    ),
    apiGet(
      `/v1/panel/reports/accounting/activity?${toQuery({ from, to })}`,
      activitySummaryResponse,
    ),
  ]);
  const fromLabel = f.date(new Date(`${from}T12:00:00`));
  const toLabel = f.date(new Date(`${to}T12:00:00`));
  const line = (code: string) =>
    sheet.assets.concat(sheet.liabilities).find((l) => l.code === code)
      ?.amountMinor ?? 0;
  const cash = line("100") + line("102");

  const kv = (rows: [string, string][]) => (
    <table className={tc.table}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className={tc.tr}>
            <td className={tc.td}>{k}</td>
            <td className={tc.tdNum}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const checks = [
    t("checkBook"),
    t("checkDecisions"),
    t("checkVouchers"),
    t("checkBank"),
    t("checkCashCount"),
    t("checkBudget"),
  ];

  return (
    <>
      <PageHeader
        title={t("auditReportTitle")}
        description={t("auditReportHint")}
        action={
          <PdfButton
            href={pdfHref("/panel/raporlar/denetim-raporu", { from, to })}
            label={t("pdf")}
            title={t("pdfTitle")}
            withNotes
          />
        }
      />
      <ReportsSubnav active="auditReport" />
      <div className="mb-4">
        <RangeForm from={from} to={to} />
      </div>

      <Card>
        <CardBody className="space-y-6 text-sm">
          <header className="text-center">
            <h2 className="text-lg font-semibold text-fg">{ctx.tenantName}</h2>
            <p className="text-fg-muted">
              {t("auditDocTitle", { from: fromLabel, to: toLabel })}
            </p>
          </header>

          <p className="leading-relaxed text-fg">
            {t("auditIntro", { from: fromLabel, to: toLabel })}
          </p>

          <section>
            <h3 className="mb-2 font-semibold text-fg">1. {t("secChecked")}</h3>
            <ul className="space-y-1">
              {checks.map((c) => (
                <li key={c} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded border border-border-strong"
                  />
                  {c}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-fg">
              2. {t("secIncomeExpense")}
            </h3>
            <table className={tc.table}>
              <tbody>
                {income.income.map((r) => (
                  <tr key={r.code} className={tc.tr}>
                    <td className={tc.td}>{r.name}</td>
                    <td className={tc.tdNum}>{f.money(r.totalMinor)}</td>
                  </tr>
                ))}
                <tr className={`${tc.tr} font-semibold`}>
                  <td className={tc.td}>{t("totalIncome")}</td>
                  <td className={tc.tdNum}>
                    {f.money(income.totals.incomeMinor)}
                  </td>
                </tr>
                {income.expense.map((r) => (
                  <tr key={r.code} className={tc.tr}>
                    <td className={tc.td}>{r.name}</td>
                    <td className={tc.tdNum}>{f.money(r.totalMinor)}</td>
                  </tr>
                ))}
                <tr className={`${tc.tr} font-semibold`}>
                  <td className={tc.td}>{t("totalExpense")}</td>
                  <td className={tc.tdNum}>
                    {f.money(income.totals.expenseMinor)}
                  </td>
                </tr>
                <tr className="font-semibold">
                  <td className={tc.td}>{t("net")}</td>
                  <td className={tc.tdNum}>
                    {f.money(income.totals.netMinor)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-fg">
              3. {t("secPosition", { date: toLabel })}
            </h3>
            {kv([
              [t("cashAndBanks"), f.money(cash)],
              [t("receivables"), f.money(line("120"))],
              [t("staffAdvances"), f.money(line("196"))],
              [t("vendorPayables"), f.money(line("320"))],
              [t("staffPayables"), f.money(line("335"))],
              [t("totalAssets"), f.money(sheet.totals.assetsMinor)],
            ])}
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-fg">
              4. {t("secCollection")}
            </h3>
            {kv([
              [t("charged"), f.money(a.finance.chargedMinor)],
              [t("collected"), f.money(a.finance.collectedMinor)],
              [
                t("collectionRate"),
                a.finance.chargedMinor > 0
                  ? f.percent(a.finance.collectedMinor / a.finance.chargedMinor)
                  : "—",
              ],
              [
                t("overdueUnits"),
                `${a.finance.overdueUnits} / ${a.finance.unitCount}`,
              ],
              [t("legalOpen"), String(a.legal.open)],
            ])}
          </section>

          {a.budget ? (
            <section>
              <h3 className="mb-2 font-semibold text-fg">
                5. {t("secBudget", { name: a.budget.name })}
              </h3>
              {kv([
                [t("plannedToDate"), f.money(a.budget.plannedToDateMinor)],
                [t("actualToDate"), f.money(a.budget.actualToDateMinor)],
                [
                  t("budgetDeviation"),
                  f.money(
                    a.budget.actualToDateMinor - a.budget.plannedToDateMinor,
                  ),
                ],
              ])}
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 font-semibold text-fg">
              {a.budget ? 6 : 5}. {t("secFindings")}
            </h3>
            <EditableNote
              name="findings"
              placeholder={t("findingsPlaceholder")}
              minLines={6}
            />
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-fg">
              {a.budget ? 7 : 6}. {t("secConclusion")}
            </h3>
            <EditableNote
              name="conclusion"
              placeholder={t("conclusionPlaceholder")}
              minLines={3}
            />
          </section>

          <p className="text-xs text-fg-subtle">{t("syntheticNote")}</p>

          <div className="grid grid-cols-1 gap-8 pt-6 sm:grid-cols-3 print:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="border-t border-border-strong pt-2 text-center"
              >
                <div className="font-semibold text-fg">
                  {t("auditorN", { n })}
                </div>
                <div className="text-xs text-fg-subtle">
                  {t("nameSignature")}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
