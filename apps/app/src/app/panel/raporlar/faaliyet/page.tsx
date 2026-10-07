import { getTranslations } from "next-intl/server";

import { activitySummaryResponse } from "@yonetim/contracts";
import { Card, CardBody, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { apiGet, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { EditableNote } from "../editable-note";
import { parseRange, RangeForm, ReportsSubnav } from "../report-tools";

export const dynamic = "force-dynamic";

/**
 * Yönetim faaliyet raporu — genel kurula sunulan dönem özeti. Rakamlar
 * sistemden, değerlendirme metni yöneticinin (yazdırmadan önce doldurulur).
 */
export default async function ActivityReportPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("report:read");
  const t = await getTranslations("app.reportsHub");
  const f = await formatters();
  const { from, to } = parseRange(await searchParams);
  const a = await apiGet(
    `/v1/panel/reports/accounting/activity?${toQuery({ from, to })}`,
    activitySummaryResponse,
  );
  const fromLabel = f.date(new Date(`${from}T12:00:00`));
  const toLabel = f.date(new Date(`${to}T12:00:00`));
  const rate =
    a.finance.chargedMinor > 0
      ? a.finance.collectedMinor / a.finance.chargedMinor
      : 0;
  const net =
    a.finance.chargedMinor +
    a.finance.otherIncomeMinor -
    a.finance.expenseMinor;

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

  return (
    <>
      <PageHeader
        title={t("activityTitle")}
        description={t("activityHint")}
        action={<PrintButton label={t("print")} />}
      />
      <ReportsSubnav active="activity" />
      <div className="mb-4">
        <RangeForm from={from} to={to} />
      </div>

      <Card>
        <CardBody className="space-y-6 text-sm">
          <header className="text-center">
            <h2 className="text-lg font-semibold text-fg">{ctx.tenantName}</h2>
            <p className="text-fg-muted">
              {t("activityDocTitle", { from: fromLabel, to: toLabel })}
            </p>
          </header>

          <section>
            <h3 className="mb-2 font-semibold text-fg">1. {t("secFinance")}</h3>
            {kv([
              [t("charged"), f.money(a.finance.chargedMinor)],
              [t("collected"), f.money(a.finance.collectedMinor)],
              [t("collectionRate"), f.percent(rate)],
              [t("otherIncome"), f.money(a.finance.otherIncomeMinor)],
              [t("totalExpense"), f.money(a.finance.expenseMinor)],
              [t("accrualNet"), f.money(net)],
              [t("receivables"), f.money(a.finance.receivablesMinor)],
              [
                t("overdueUnits"),
                `${a.finance.overdueUnits} / ${a.finance.unitCount}`,
              ],
            ])}
          </section>

          {a.topExpenses.length > 0 ? (
            <section>
              <h3 className="mb-2 font-semibold text-fg">
                2. {t("secExpenses")}
              </h3>
              {kv(a.topExpenses.map((e) => [e.name, f.money(e.amountMinor)]))}
            </section>
          ) : null}

          {a.budget ? (
            <section>
              <h3 className="mb-2 font-semibold text-fg">
                3. {t("secBudget", { name: a.budget.name })}
              </h3>
              {kv([
                [t("plannedToDate"), f.money(a.budget.plannedToDateMinor)],
                [t("actualToDate"), f.money(a.budget.actualToDateMinor)],
                [
                  t("budgetUsage"),
                  a.budget.plannedToDateMinor > 0
                    ? f.percent(
                        a.budget.actualToDateMinor /
                          a.budget.plannedToDateMinor,
                      )
                    : "—",
                ],
              ])}
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 font-semibold text-fg">
              4. {t("secOperations")}
            </h3>
            {kv([
              [t("requestsOpened"), String(a.requests.opened)],
              [t("requestsResolved"), String(a.requests.resolved)],
              [t("requestsOpen"), String(a.requests.open)],
              [
                t("maintenanceDone"),
                `${a.maintenance.done} (${f.money(a.maintenance.costMinor)})`,
              ],
              [t("maintenanceOverdue"), String(a.maintenance.overdue)],
              [t("reservations"), String(a.reservations)],
              [t("announcements"), String(a.announcements)],
              [t("staffCount"), String(a.staffCount)],
            ])}
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-fg">
              5. {t("secMeetings")}
            </h3>
            {a.meetings.length === 0 ? (
              <p className="text-fg-subtle">{t("noMeetings")}</p>
            ) : (
              <table className={tc.table}>
                <tbody>
                  {a.meetings.map((m, i) => (
                    <tr key={i} className={tc.tr}>
                      <td className={tc.td}>{f.date(m.date)}</td>
                      <td className={tc.td}>{m.title}</td>
                      <td className={tc.tdNum}>
                        {t("decisionsCount", { count: m.decisions })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-fg">6. {t("secLegal")}</h3>
            {kv([
              [t("legalOpened"), String(a.legal.opened)],
              [t("legalClosed"), String(a.legal.closed)],
              [t("legalOpen"), String(a.legal.open)],
            ])}
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-fg">
              7. {t("secAssessment")}
            </h3>
            <EditableNote
              placeholder={t("assessmentPlaceholder")}
              minLines={5}
            />
          </section>

          <div className="grid grid-cols-1 gap-8 pt-6 sm:grid-cols-2 print:grid-cols-2">
            <div />
            <div className="border-t border-border-strong pt-2 text-center">
              <div className="font-semibold text-fg">{t("manager")}</div>
              <div className="text-xs text-fg-subtle">{t("nameSignature")}</div>
            </div>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
