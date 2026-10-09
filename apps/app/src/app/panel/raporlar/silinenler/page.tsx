import { getTranslations } from "next-intl/server";

import { deletedResponse } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader, Select, Stat, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { parseRange, RangeForm, ReportsSubnav } from "../report-tools";

export const dynamic = "force-dynamic";

const KINDS = ["debt", "payment", "cash", "expense"] as const;

/** Silinen hareket raporu — iptal edilen borç ve tahsilat, iptal kasa hareketi, silinen gider. */
export default async function DeletedReportPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("audit:read");
  const t = await getTranslations("app.reportsHub");
  const td = await getTranslations("app.deletedReport");
  const f = await formatters();
  const params = await searchParams;
  const { from, to } = parseRange(params);
  const kind = (KINDS as readonly string[]).includes(params.tur ?? "") ? params.tur : undefined;
  const data = await apiGet(`/v1/panel/reports/debts/deleted?${toQuery({ from, to, kind })}`, deletedResponse);

  return (
    <>
      <PageHeader title={td("title")} description={td("hint")} />
      <ReportsSubnav active="deleted" />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label={td("count")} value={String(data.totals.count)} />
        <Stat label={td("amount")} value={f.money(data.totals.amountMinor)} />
      </div>
      <Card>
        <CardHeader
          title={t("rangeTitle", { from: f.date(new Date(`${from}T12:00:00`)), to: f.date(new Date(`${to}T12:00:00`)) })}
          action={
            <RangeForm from={from} to={to}>
              <label className="text-xs text-fg-subtle">
                {td("kindLabel")}
                <Select name="tur" defaultValue={kind ?? ""} className="mt-0.5 h-9">
                  <option value="">{td("allKinds")}</option>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {td(`kind.${k}`)}
                    </option>
                  ))}
                </Select>
              </label>
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
                    <th className={tc.th}>{t("date")}</th>
                    <th className={tc.th}>{td("kindLabel")}</th>
                    <th className={tc.th}>{t("descriptionColumn")}</th>
                    <th className={tc.th}>{td("by")}</th>
                    <th className={tc.th}>{td("reason")}</th>
                    <th className={`${tc.th} text-right`}>{td("amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={`${r.kind}-${r.id}`} className={tc.tr}>
                      <td className={`${tc.td} whitespace-nowrap`}>{f.dateTime(r.at)}</td>
                      <td className={tc.td}>
                        <Badge tone="danger">{td(`kind.${r.kind}`)}</Badge>
                      </td>
                      <td className={tc.td}>
                        {r.description}
                        {r.unitLabel ? <span className="block text-xs text-fg-subtle">{r.unitLabel}</span> : null}
                      </td>
                      <td className={tc.tdMuted}>{r.byName ?? "—"}</td>
                      <td className={tc.tdMuted}>{r.reason ?? "—"}</td>
                      <td className={tc.tdNum}>{f.money(r.amountMinor)}</td>
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
