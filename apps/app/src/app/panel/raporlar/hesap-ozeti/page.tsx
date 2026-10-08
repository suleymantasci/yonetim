import { getTranslations } from "next-intl/server";

import { unitStatementResponse } from "@yonetim/contracts";
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

/**
 * Toplu hesap özeti — her bağımsız bölüm için devir, borçlandırma, tahsilat,
 * bakiye. "Ayrıntılı döküm" her bölümün hareketlerini ayrı sayfada basar:
 * sakinlere dağıtılan hesap özeti ve toplu makbuz dökümü olarak kullanılır.
 */
export default async function UnitStatementsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("report:read");
  const t = await getTranslations("app.reportsHub");
  const f = await formatters();
  const params = await searchParams;
  const { from, to } = parseRange(params);
  const detail = params.detail === "1";
  const onlyOpen = params.onlyOpen === "1";
  const data = await apiGet(
    `/v1/panel/reports/accounting/unit-statements?${toQuery({ from, to, detail: detail ? "1" : "0", onlyOpen: onlyOpen ? "1" : "0" })}`,
    unitStatementResponse,
  );
  const fromLabel = f.date(new Date(`${from}T12:00:00`));
  const toLabel = f.date(new Date(`${to}T12:00:00`));

  return (
    <>
      <PageHeader
        title={t("unitStatementsTitle")}
        description={t("unitStatementsHint")}
        action={
          <PdfButton
            href={pdfHref("/panel/raporlar/hesap-ozeti", {
              from,
              to,
              ...(detail ? { detail: "1" } : {}),
              ...(onlyOpen ? { onlyOpen: "1" } : {}),
            })}
            label={t("pdf")}
            title={t("pdfTitle")}
          />
        }
      />
      <ReportsSubnav active="unitStatements" />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4 print:hidden">
        <Stat
          label={t("openingBalance")}
          value={f.money(data.totals.openingMinor)}
        />
        <Stat label={t("charged")} value={f.money(data.totals.chargedMinor)} />
        <Stat label={t("collected")} value={f.money(data.totals.paidMinor)} />
        <Stat
          label={t("closingBalance")}
          value={f.money(data.totals.closingMinor)}
          tone={data.totals.closingMinor > 0 ? "warning" : "success"}
        />
      </div>

      <Card className="mb-4">
        <CardHeader
          title={t("rangeTitle", { from: fromLabel, to: toLabel })}
          action={
            <RangeForm from={from} to={to}>
              <label className="flex h-9 items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  name="onlyOpen"
                  value="1"
                  defaultChecked={onlyOpen}
                  className="h-4 w-4"
                />
                {t("onlyOpen")}
              </label>
              <label className="flex h-9 items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  name="detail"
                  value="1"
                  defaultChecked={detail}
                  className="h-4 w-4"
                />
                {t("detailed")}
              </label>
            </RangeForm>
          }
        />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>
                    {t("unit")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("openingBalance")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("charged")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("collected")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("closingBalance")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.unitId} className={tc.tr}>
                    <td className={tc.td}>
                      <div className="font-medium">{r.label}</div>
                      {r.holder ? (
                        <div className="text-xs text-fg-subtle">{r.holder}</div>
                      ) : null}
                    </td>
                    <td className={tc.tdNum}>{f.money(r.openingMinor)}</td>
                    <td className={tc.tdNum}>{f.money(r.chargedMinor)}</td>
                    <td className={tc.tdNum}>{f.money(r.paidMinor)}</td>
                    <td
                      className={`${tc.tdNum} font-semibold ${r.closingMinor > 0 ? "text-warning-fg" : ""}`}
                    >
                      {f.money(r.closingMinor)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border-strong font-semibold">
                  <td className={tc.td}>{t("total")}</td>
                  <td className={tc.tdNum}>
                    {f.money(data.totals.openingMinor)}
                  </td>
                  <td className={tc.tdNum}>
                    {f.money(data.totals.chargedMinor)}
                  </td>
                  <td className={tc.tdNum}>{f.money(data.totals.paidMinor)}</td>
                  <td className={tc.tdNum}>
                    {f.money(data.totals.closingMinor)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {detail
        ? data.rows.map((r) => (
            <Card key={r.unitId} className="mb-4 break-before-page">
              <CardHeader
                title={`${r.label}${r.holder ? ` — ${r.holder}` : ""}`}
                description={t("statementFor", {
                  from: fromLabel,
                  to: toLabel,
                })}
              />
              <CardBody className="p-0">
                <div className={tc.wrapper}>
                  <table className={tc.table}>
                    <thead className={tc.thead}>
                      <tr>
                        <th scope="col" className={tc.th}>
                          {t("date")}
                        </th>
                        <th scope="col" className={tc.th}>
                          {t("descriptionColumn")}
                        </th>
                        <th scope="col" className={`${tc.th} text-right`}>
                          {t("debit")}
                        </th>
                        <th scope="col" className={`${tc.th} text-right`}>
                          {t("credit")}
                        </th>
                        <th scope="col" className={`${tc.th} text-right`}>
                          {t("balance")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className={`${tc.tr} bg-surface-sunken`}>
                        <td className={tc.td}>{fromLabel}</td>
                        <td className={tc.td}>{t("carriedForward")}</td>
                        <td className={tc.tdNum} />
                        <td className={tc.tdNum} />
                        <td className={tc.tdNum}>{f.money(r.openingMinor)}</td>
                      </tr>
                      {(r.lines ?? []).map((l, i) => (
                        <tr key={i} className={tc.tr}>
                          <td className={`${tc.td} whitespace-nowrap`}>
                            {f.date(l.date)}
                          </td>
                          <td className={tc.td}>{l.description}</td>
                          <td className={tc.tdNum}>
                            {l.debitMinor ? f.money(l.debitMinor) : ""}
                          </td>
                          <td className={tc.tdNum}>
                            {l.creditMinor ? f.money(l.creditMinor) : ""}
                          </td>
                          <td className={tc.tdNum}>
                            {f.money(l.balanceMinor)}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className={tc.td} colSpan={4}>
                          {t("closingBalance")}
                        </td>
                        <td className={tc.tdNum}>{f.money(r.closingMinor)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          ))
        : null}
    </>
  );
}
