import { getTranslations } from "next-intl/server";

import { operatingBookResponse } from "@yonetim/contracts";
import {
  Alert,
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

/**
 * İşletme defteri (KMK 35) — kasaya ve bankalara giren/çıkan para,
 * kronolojik ve kümülatif bakiyeli. Kasa ↔ banka virmanı iç hareket olduğu
 * için deftere girmez.
 */
export default async function OperatingBookPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("report:read");
  const t = await getTranslations("app.reportsHub");
  const f = await formatters();
  const { from, to } = parseRange(await searchParams);
  const data = await apiGet(
    `/v1/panel/reports/accounting/operating-book?${toQuery({ from, to })}`,
    operatingBookResponse,
  );

  return (
    <>
      <PageHeader
        title={t("operatingBookTitle")}
        description={t("operatingBookHint")}
        action={
          <PdfButton
            href={pdfHref("/panel/raporlar/isletme-defteri", { from, to })}
            label={t("pdf")}
            title={t("pdfTitle")}
          />
        }
      />
      <ReportsSubnav active="operatingBook" />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label={t("openingBalance")} value={f.money(data.openingMinor)} />
        <Stat
          label={t("totalIncome")}
          value={f.money(data.totals.incomeMinor)}
        />
        <Stat
          label={t("totalExpense")}
          value={f.money(data.totals.expenseMinor)}
        />
        <Stat
          label={t("closingBalance")}
          value={f.money(data.closingMinor)}
          tone={data.closingMinor < 0 ? "danger" : "neutral"}
        />
      </div>

      {data.truncated ? (
        <div className="mb-4">
          <Alert tone="warning">
            {t("truncated", { count: data.lines.length })}
          </Alert>
        </div>
      ) : null}

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
                    #
                  </th>
                  <th scope="col" className={tc.th}>
                    {t("date")}
                  </th>
                  <th scope="col" className={tc.th}>
                    {t("descriptionColumn")}
                  </th>
                  <th scope="col" className={tc.th}>
                    {t("head")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("income")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("expense")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("balance")}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className={`${tc.tr} bg-surface-sunken`}>
                  <td className={tc.td} />
                  <td className={tc.td}>
                    {f.date(new Date(`${from}T12:00:00`))}
                  </td>
                  <td className={tc.td} colSpan={2}>
                    {t("carriedForward")}
                  </td>
                  <td className={tc.tdNum} />
                  <td className={tc.tdNum} />
                  <td className={tc.tdNum}>{f.money(data.openingMinor)}</td>
                </tr>
                {data.lines.map((l, i) => (
                  <tr key={i} className={tc.tr}>
                    <td className={`${tc.tdMuted} tabular-nums`}>{i + 1}</td>
                    <td className={`${tc.td} whitespace-nowrap`}>
                      {f.date(l.date)}
                    </td>
                    <td className={tc.td}>
                      <div>{l.description}</div>
                      <div className="text-xs text-fg-subtle">{l.account}</div>
                    </td>
                    <td className={tc.tdMuted}>{l.head}</td>
                    <td className={tc.tdNum}>
                      {l.incomeMinor ? f.money(l.incomeMinor) : ""}
                    </td>
                    <td className={tc.tdNum}>
                      {l.expenseMinor ? f.money(l.expenseMinor) : ""}
                    </td>
                    <td
                      className={`${tc.tdNum} ${l.balanceMinor < 0 ? "text-danger-fg" : ""}`}
                    >
                      {f.money(l.balanceMinor)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border-strong font-semibold">
                  <td className={tc.td} colSpan={4}>
                    {t("total")}
                  </td>
                  <td className={tc.tdNum}>
                    {f.money(data.totals.incomeMinor)}
                  </td>
                  <td className={tc.tdNum}>
                    {f.money(data.totals.expenseMinor)}
                  </td>
                  <td className={tc.tdNum}>{f.money(data.closingMinor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
