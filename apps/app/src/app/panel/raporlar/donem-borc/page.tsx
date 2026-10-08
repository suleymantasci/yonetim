import { getTranslations } from "next-intl/server";

import { debtMatrixResponse, debtTypeList } from "@yonetim/contracts";
import {
  Card,
  CardBody,
  CardHeader,
  Select,
  Stat,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { matrixParams } from "../debt-report-params";
import { PdfButton } from "../pdf-button";
import { pdfHref } from "../pdf-route";
import { MemberScopeSelect, ReportsSubnav } from "../report-tools";

export const dynamic = "force-dynamic";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * Dönemsel borç tablosu — satır daire ya da üye, sütun yılın ayları.
 * Yöneticinin en sık baktığı "kim hangi ay borçlu" tablosu; kalan, tahakkuk
 * ya da ödenen; borcun dönemine ya da vadesine göre.
 */
export default async function DebtMatrixPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("report:read");
  const t = await getTranslations("app.reportsHub");
  const td = await getTranslations("app.debtReports");
  const f = await formatters();
  const params = await searchParams;
  const p = matrixParams(params);
  const [data, types] = await Promise.all([
    apiGet(p.api, debtMatrixResponse),
    apiGet("/v1/panel/debt-types", debtTypeList),
  ]);
  const cell = (v: number) => (v === 0 ? "—" : f.money(v));
  const monthLabel = (m: number) => f.period(`${p.year}-${String(m).padStart(2, "0")}`);
  const showBefore = data.totals.beforeMinor !== 0;
  const showAfter = data.totals.afterMinor !== 0;
  const years = Array.from({ length: 7 }, (_, i) => p.thisYear + 1 - i);

  return (
    <>
      <PageHeader
        title={td("matrixTitle")}
        description={td("matrixHint")}
        action={
          <PdfButton
            href={pdfHref("/panel/raporlar/donem-borc", p.passthrough)}
            label={t("pdf")}
            title={t("pdfTitle")}
          />
        }
      />
      <ReportsSubnav active="debtMatrix" />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4 print:hidden">
        <Stat label={td(`value.${p.value}`)} value={f.money(data.totals.totalMinor)} />
        <Stat label={td("rowCount")} value={String(data.rows.length)} />
        {showBefore ? <Stat label={td("before")} value={f.money(data.totals.beforeMinor)} /> : null}
        {showAfter ? <Stat label={td("after")} value={f.money(data.totals.afterMinor)} /> : null}
      </div>

      <Card>
        <CardHeader
          title={td("matrixCardTitle", { year: p.year, value: td(`value.${p.value}`) })}
        />
        <CardBody className="border-b border-border">
          <form method="get" className="flex flex-wrap items-end gap-2 print:hidden">
            <label className="text-xs text-fg-subtle">
              {td("year")}
              <Select name="yil" defaultValue={String(p.year)} className="mt-0.5 h-9">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-fg-subtle">
              {td("rows")}
              <Select name="satir" defaultValue={p.rows === "member" ? "uye" : "daire"} className="mt-0.5 h-9">
                <option value="daire">{td("rowsUnit")}</option>
                <option value="uye">{td("rowsMember")}</option>
              </Select>
            </label>
            <label className="text-xs text-fg-subtle">
              {td("valueLabel")}
              <Select
                name="deger"
                defaultValue={p.value === "charged" ? "tahakkuk" : p.value === "paid" ? "odenen" : "kalan"}
                className="mt-0.5 h-9"
              >
                <option value="kalan">{td("value.remaining")}</option>
                <option value="tahakkuk">{td("value.charged")}</option>
                <option value="odenen">{td("value.paid")}</option>
              </Select>
            </label>
            <label className="text-xs text-fg-subtle">
              {td("basis")}
              <Select name="esas" defaultValue={p.basis === "due" ? "vade" : "donem"} className="mt-0.5 h-9">
                <option value="donem">{td("basisPeriod")}</option>
                <option value="vade">{td("basisDue")}</option>
              </Select>
            </label>
            <label className="text-xs text-fg-subtle">
              {td("lateFee")}
              <Select name="gecikme" defaultValue={p.lateFee} className="mt-0.5 h-9">
                <option value="1">{td("lateFeeIn")}</option>
                <option value="0">{td("lateFeeOut")}</option>
              </Select>
            </label>
            <label className="text-xs text-fg-subtle">
              {td("debtType")}
              <Select name="tur" defaultValue={p.debtTypeId ?? ""} className="mt-0.5 h-9">
                <option value="">{td("allTypes")}</option>
                {types.rows.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </label>
            <MemberScopeSelect value={params.uye} />
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
            >
              {t("apply")}
            </button>
          </form>
        </CardBody>
        <CardBody className="p-0">
          {data.rows.length === 0 ? (
            <p className="p-6 text-sm text-fg-subtle">{td("empty")}</p>
          ) : (
            <div className={tc.wrapper}>
              <table className={`${tc.table} text-xs`}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={`${tc.th} sticky left-0 z-10 bg-surface-sunken`}>
                      {p.rows === "member" ? td("rowsMember") : td("rowsUnit")}
                    </th>
                    {showBefore ? (
                      <th scope="col" className={`${tc.th} text-right`}>
                        {td("before")}
                      </th>
                    ) : null}
                    {MONTHS.map((m) => (
                      <th key={m} scope="col" className={`${tc.th} whitespace-nowrap text-right`}>
                        {monthLabel(m)}
                      </th>
                    ))}
                    {showAfter ? (
                      <th scope="col" className={`${tc.th} text-right`}>
                        {td("after")}
                      </th>
                    ) : null}
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("total")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.key} className={tc.tr}>
                      <td className={`${tc.td} sticky left-0 z-10 bg-surface`}>
                        <div className="whitespace-nowrap font-medium">{r.label}</div>
                        {r.sub ? <div className="max-w-56 truncate text-fg-subtle">{r.sub}</div> : null}
                      </td>
                      {showBefore ? <td className={tc.tdNum}>{cell(r.beforeMinor)}</td> : null}
                      {r.months.map((v, i) => (
                        <td key={MONTHS[i]} className={tc.tdNum}>
                          {cell(v)}
                        </td>
                      ))}
                      {showAfter ? <td className={tc.tdNum}>{cell(r.afterMinor)}</td> : null}
                      <td className={`${tc.tdNum} font-semibold`}>{f.money(r.totalMinor)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border-strong font-semibold">
                    <td className={`${tc.td} sticky left-0 z-10 bg-surface`}>{t("total")}</td>
                    {showBefore ? <td className={tc.tdNum}>{cell(data.totals.beforeMinor)}</td> : null}
                    {data.totals.months.map((v, i) => (
                      <td key={MONTHS[i]} className={tc.tdNum}>
                        {cell(v)}
                      </td>
                    ))}
                    {showAfter ? <td className={tc.tdNum}>{cell(data.totals.afterMinor)}</td> : null}
                    <td className={tc.tdNum}>{f.money(data.totals.totalMinor)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="px-4 py-3 text-xs text-fg-subtle">{td("matrixNote")}</p>
        </CardBody>
      </Card>
    </>
  );
}
