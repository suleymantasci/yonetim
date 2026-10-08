import { getTranslations } from "next-intl/server";

import { receiptListResponse } from "@yonetim/contracts";
import { Card, CardBody, CardHeader, Stat, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { memberScopeFromParam } from "@/lib/member-scope";
import { PdfButton } from "../pdf-button";
import { pdfHref } from "../pdf-route";
import { MemberScopeSelect, parseRange, RangeForm, ReportsSubnav } from "../report-tools";

export const dynamic = "force-dynamic";

/** Toplu tahsilat makbuzu dökümü — aralıktaki tahsilatlar, mahsup satırlarıyla. */
export default async function ReceiptsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("report:read");
  const t = await getTranslations("app.reportsHub");
  const td = await getTranslations("app.debtReports");
  const tEnum = await getTranslations("enum");
  const f = await formatters();
  const params = await searchParams;
  const { from, to } = parseRange(params);
  const member = memberScopeFromParam(params.uye);
  const data = await apiGet(
    `/v1/panel/reports/debts/receipts?${toQuery({ from, to, member: member === "all" ? undefined : member })}`,
    receiptListResponse,
  );

  return (
    <>
      <PageHeader
        title={td("receiptsTitle")}
        description={td("receiptsHint")}
        action={
          <PdfButton
            href={pdfHref("/panel/raporlar/makbuzlar", { from, to, ...(params.uye ? { uye: params.uye } : {}) })}
            label={t("pdf")}
            title={t("pdfTitle")}
          />
        }
      />
      <ReportsSubnav active="receipts" />

      <div className="mb-4 grid grid-cols-2 gap-3 print:hidden">
        <Stat label={td("receiptCount")} value={String(data.rows.length)} />
        <Stat label={t("collected")} value={f.money(data.totalMinor)} />
      </div>

      <Card>
        <CardHeader
          title={t("rangeTitle", { from: f.date(new Date(`${from}T12:00:00`)), to: f.date(new Date(`${to}T12:00:00`)) })}
          action={
            <RangeForm from={from} to={to}>
              <MemberScopeSelect value={params.uye} />
            </RangeForm>
          }
        />
        <CardBody className="p-0">
          {data.rows.length === 0 ? (
            <p className="p-6 text-sm text-fg-subtle">{td("empty")}</p>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{td("receiptNo")}</th>
                    <th scope="col" className={tc.th}>{t("date")}</th>
                    <th scope="col" className={tc.th}>{t("unit")}</th>
                    <th scope="col" className={tc.th}>{td("payer")}</th>
                    <th scope="col" className={tc.th}>{t("descriptionColumn")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{td("amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.paymentId} className={tc.tr}>
                      <td className={`${tc.td} font-mono text-xs`}>{r.receiptNo ?? "—"}</td>
                      <td className={`${tc.td} whitespace-nowrap`}>{f.date(r.paidAt)}</td>
                      <td className={tc.td}>{r.unitLabel ?? "—"}</td>
                      <td className={tc.tdMuted}>{r.payerName ?? r.debtorName ?? "—"}</td>
                      <td className={tc.td}>
                        <span className="text-xs text-fg-subtle">{tEnum(`paymentMethod.${r.method}`)}</span>
                        {r.allocations.length > 0 ? (
                          <span className="block text-xs">{r.allocations.map((a) => a.description).join(", ")}</span>
                        ) : null}
                      </td>
                      <td className={`${tc.tdNum} font-semibold`}>{f.money(r.amountMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
