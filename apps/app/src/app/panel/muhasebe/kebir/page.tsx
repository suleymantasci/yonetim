import { getTranslations } from "next-intl/server";

import { ledgerResponse } from "@yonetim/contracts";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Select,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { apiGet, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { parseRange, RangeForm } from "../../raporlar/report-tools";
import { AccountingSubnav } from "../subnav";

export const dynamic = "force-dynamic";

const CODE = /^\d{3}(\.\d{2,3})?$/;

/** Kebir — seçilen hesabın devirli hareket dökümü (üst hesap alt hesapları kapsar). */
export default async function LedgerPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("report:read");
  const t = await getTranslations("app.accounting");
  const tHub = await getTranslations("app.reportsHub");
  const f = await formatters();
  const params = await searchParams;
  const { from, to } = parseRange(params);
  const code = params.code && CODE.test(params.code) ? params.code : "100";
  const data = await apiGet(
    `/v1/panel/reports/accounting/ledger?${toQuery({ code, from, to })}`,
    ledgerResponse,
  );
  const side = (v: number) =>
    v === 0
      ? "—"
      : `${f.money(Math.abs(v))} ${v > 0 ? t("debitShort") : t("creditShort")}`;

  return (
    <>
      <PageHeader
        title={t("ledgerTitle")}
        description={t("ledgerDescription")}
        action={<PrintButton label={t("print")} />}
      />
      <AccountingSubnav active="ledger" />

      {data.truncated ? (
        <div className="mb-4">
          <Alert tone="warning">
            {tHub("truncated", { count: data.lines.length })}
          </Alert>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={`${data.code} ${data.name}`}
          description={tHub("rangeTitle", {
            from: f.date(new Date(`${from}T12:00:00`)),
            to: f.date(new Date(`${to}T12:00:00`)),
          })}
          action={
            <RangeForm from={from} to={to}>
              <label className="text-xs text-fg-subtle">
                {t("account")}
                <Select
                  name="code"
                  defaultValue={code}
                  className="mt-0.5 h-9 max-w-[16rem]"
                >
                  {(data.accounts.some((a) => a.code === code)
                    ? data.accounts
                    : [{ code, name: data.name }, ...data.accounts]
                  ).map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} {a.name}
                    </option>
                  ))}
                </Select>
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
                    {tHub("date")}
                  </th>
                  <th scope="col" className={tc.th}>
                    {tHub("descriptionColumn")}
                  </th>
                  <th scope="col" className={tc.th}>
                    {t("counterAccount")}
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
                  <td className={tc.td}>
                    {f.date(new Date(`${from}T12:00:00`))}
                  </td>
                  <td className={tc.td} colSpan={4}>
                    {tHub("carriedForward")}
                  </td>
                  <td className={tc.tdNum}>{side(data.openingMinor)}</td>
                </tr>
                {data.lines.map((l, i) => (
                  <tr key={i} className={tc.tr}>
                    <td className={`${tc.td} whitespace-nowrap`}>
                      {f.date(l.date)}
                    </td>
                    <td className={tc.td}>{l.description}</td>
                    <td className={tc.tdMuted}>{l.counter}</td>
                    <td className={tc.tdNum}>
                      {l.debitMinor ? f.money(l.debitMinor) : ""}
                    </td>
                    <td className={tc.tdNum}>
                      {l.creditMinor ? f.money(l.creditMinor) : ""}
                    </td>
                    <td className={tc.tdNum}>{side(l.balanceMinor)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border-strong font-semibold">
                  <td className={tc.td} colSpan={3}>
                    {t("total")}
                  </td>
                  <td className={tc.tdNum}>
                    {f.money(data.totals.debitMinor)}
                  </td>
                  <td className={tc.tdNum}>
                    {f.money(data.totals.creditMinor)}
                  </td>
                  <td className={tc.tdNum}>{side(data.closingMinor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
