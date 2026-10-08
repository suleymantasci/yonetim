import { getTranslations } from "next-intl/server";

import { incomeStatementResponse } from "@yonetim/contracts";
import {
  Card,
  CardBody,
  CardHeader,
  Stat,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { parseRange, RangeForm, ReportsSubnav } from "../report-tools";
import { PdfButton } from "../pdf-button";
import { pdfHref } from "../pdf-route";

export const dynamic = "force-dynamic";

/** Dönemsel gelir-gider tablosu — aylık sütunlar, tahakkuk esaslı. */
export default async function IncomeStatementPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("report:read");
  const t = await getTranslations("app.reportsHub");
  const f = await formatters();
  const { from, to } = parseRange(await searchParams);
  const data = await apiGet(
    `/v1/panel/reports/accounting/income-statement?${toQuery({ from, to })}`,
    incomeStatementResponse,
  );
  const cell = (v: number) => (v === 0 ? "—" : f.money(v));

  const section = (
    title: string,
    rows: typeof data.income,
    totals: number[],
    total: number,
  ) => (
    <>
      <tr className="bg-surface-sunken">
        <th
          scope="rowgroup"
          colSpan={data.months.length + 2}
          className={`${tc.th} text-left`}
        >
          {title}
        </th>
      </tr>
      {rows.map((r) => (
        <tr key={r.code} className={tc.tr}>
          <td className={`${tc.td} whitespace-nowrap`}>
            <span className="text-fg-subtle tabular-nums">{r.code}</span>{" "}
            {r.name}
          </td>
          {r.byMonth.map((v, i) => (
            <td key={data.months[i]} className={tc.tdNum}>
              {cell(v)}
            </td>
          ))}
          <td className={`${tc.tdNum} font-semibold`}>
            {f.money(r.totalMinor)}
          </td>
        </tr>
      ))}
      <tr className={`${tc.tr} font-semibold`}>
        <td className={tc.td}>{t("sectionTotal", { section: title })}</td>
        {totals.map((v, i) => (
          <td key={data.months[i]} className={tc.tdNum}>
            {cell(v)}
          </td>
        ))}
        <td className={tc.tdNum}>{f.money(total)}</td>
      </tr>
    </>
  );

  return (
    <>
      <PageHeader
        title={t("incomeStatementTitle")}
        description={t("incomeStatementHint")}
        action={
          <PdfButton
            href={pdfHref("/panel/raporlar/gelir-gider", { from, to })}
            label={t("pdf")}
            title={t("pdfTitle")}
          />
        }
      />
      <ReportsSubnav active="incomeStatement" />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label={t("totalIncome")}
          value={f.money(data.totals.incomeMinor)}
        />
        <Stat
          label={t("totalExpense")}
          value={f.money(data.totals.expenseMinor)}
        />
        <Stat
          label={t("net")}
          value={f.money(data.totals.netMinor)}
          tone={data.totals.netMinor < 0 ? "danger" : "success"}
        />
      </div>

      <Card>
        <CardHeader
          title={t("rangeTitle", {
            from: f.date(new Date(`${from}T12:00:00`)),
            to: f.date(new Date(`${to}T12:00:00`)),
          })}
          action={<RangeForm from={from} to={to} />}
        />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>
                    {t("account")}
                  </th>
                  {data.months.map((m) => (
                    <th
                      key={m}
                      scope="col"
                      className={`${tc.th} whitespace-nowrap text-right`}
                    >
                      {f.period(m)}
                    </th>
                  ))}
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("total")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {section(
                  t("income"),
                  data.income,
                  data.totals.incomeByMonth,
                  data.totals.incomeMinor,
                )}
                {section(
                  t("expense"),
                  data.expense,
                  data.totals.expenseByMonth,
                  data.totals.expenseMinor,
                )}
                <tr className="border-t-2 border-border-strong font-semibold">
                  <td className={tc.td}>{t("net")}</td>
                  {data.totals.netByMonth.map((v, i) => (
                    <td
                      key={data.months[i]}
                      className={`${tc.tdNum} ${v < 0 ? "text-danger-fg" : ""}`}
                    >
                      {cell(v)}
                    </td>
                  ))}
                  <td
                    className={`${tc.tdNum} ${data.totals.netMinor < 0 ? "text-danger-fg" : ""}`}
                  >
                    {f.money(data.totals.netMinor)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-fg-subtle">{t("accrualNote")}</p>
        </CardBody>
      </Card>
    </>
  );
}
