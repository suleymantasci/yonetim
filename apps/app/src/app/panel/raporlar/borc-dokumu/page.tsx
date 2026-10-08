import { getTranslations } from "next-intl/server";

import { openItemsResponse } from "@yonetim/contracts";
import { Card, CardBody, CardHeader, Stat, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { openItemsParams } from "../debt-report-params";
import { PdfButton } from "../pdf-button";
import { pdfHref } from "../pdf-route";
import { MemberScopeSelect, ReportsSubnav } from "../report-tools";

export const dynamic = "force-dynamic";

/**
 * Toplu borç dökümü — daire başına ödenmemiş kalemler. PDF'te her daire
 * ayrı sayfada: sayfalar ayrılıp kapıya bırakılabilsin.
 */
export default async function OpenItemsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("report:read");
  const t = await getTranslations("app.reportsHub");
  const td = await getTranslations("app.debtReports");
  const f = await formatters();
  const params = await searchParams;
  const p = openItemsParams(params);
  const data = await apiGet(p.api, openItemsResponse);

  return (
    <>
      <PageHeader
        title={td("openItemsTitle")}
        description={td("openItemsHint")}
        action={
          <PdfButton
            href={pdfHref("/panel/raporlar/borc-dokumu", p.passthrough)}
            label={t("pdf")}
            title={t("pdfTitle")}
          />
        }
      />
      <ReportsSubnav active="openItems" />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-3 print:hidden">
        <Stat label={td("unitCount")} value={String(data.units.length)} />
        <Stat label={td("value.remaining")} value={f.money(data.totalMinor)} tone={data.totalMinor > 0 ? "warning" : "success"} />
        <Stat label={td("overdue")} value={f.money(data.overdueMinor)} tone={data.overdueMinor > 0 ? "danger" : "success"} />
      </div>

      <Card className="mb-4">
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-2 print:hidden">
            <MemberScopeSelect value={params.uye} />
            <label className="flex h-9 items-center gap-2 text-sm text-fg">
              <input type="checkbox" name="gecikmis" value="1" defaultChecked={p.overdueOnly} className="h-4 w-4" />
              {td("overdueOnly")}
            </label>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
            >
              {t("apply")}
            </button>
          </form>
        </CardBody>
      </Card>

      {data.units.length === 0 ? (
        <p className="text-sm text-fg-subtle">{td("empty")}</p>
      ) : (
        <div className="space-y-4">
          {data.units.map((u) => (
            <Card key={u.unitId}>
              <CardHeader
                title={u.label}
                description={u.holder ?? undefined}
                action={<span className="text-sm font-semibold tabular-nums">{f.money(u.totalMinor)}</span>}
              />
              <CardBody className="p-0">
                <div className={tc.wrapper}>
                  <table className={tc.table}>
                    <thead className={tc.thead}>
                      <tr>
                        <th scope="col" className={tc.th}>{t("descriptionColumn")}</th>
                        <th scope="col" className={tc.th}>{td("dueDate")}</th>
                        <th scope="col" className={tc.th}>{td("debtor")}</th>
                        <th scope="col" className={`${tc.th} text-right`}>{td("amount")}</th>
                        <th scope="col" className={`${tc.th} text-right`}>{td("lateFeeColumn")}</th>
                        <th scope="col" className={`${tc.th} text-right`}>{td("value.paid")}</th>
                        <th scope="col" className={`${tc.th} text-right`}>{td("value.remaining")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {u.items.map((i) => (
                        <tr key={i.debtId} className={tc.tr}>
                          <td className={tc.td}>{i.description}</td>
                          <td className={`${tc.td} whitespace-nowrap ${i.overdue ? "text-danger-fg" : ""}`}>{f.date(i.dueDate)}</td>
                          <td className={tc.tdMuted}>{i.debtorName ?? "—"}</td>
                          <td className={tc.tdNum}>{f.money(i.amountMinor)}</td>
                          <td className={tc.tdNum}>{i.lateFeeMinor ? f.money(i.lateFeeMinor) : "—"}</td>
                          <td className={tc.tdNum}>{i.paidMinor ? f.money(i.paidMinor) : "—"}</td>
                          <td className={`${tc.tdNum} font-semibold`}>{f.money(i.remainingMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
