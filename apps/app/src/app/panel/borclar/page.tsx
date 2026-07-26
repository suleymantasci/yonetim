import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { Alert, Badge, Card, CardBody, CardHeader, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { getUnitDebtSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const ctx = await requirePermission("debt:read");
  const rows = await getUnitDebtSummary(ctx);
  const t = await getTranslations("app.debts");
  const f = await formatters();

  const totals = rows.reduce(
    (acc, r) => ({
      outstanding: acc.outstanding + Number(r.outstanding),
      overdue: acc.overdue + Number(r.overdue),
    }),
    { outstanding: 0, overdue: 0 },
  );
  const withDebt = rows.filter((r) => Number(r.outstanding) > 0);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {totals.overdue > 0 ? (
        <div className="mb-4">
          <Alert tone="warning" title={t("overdueAlertTitle")}>
            {t("overdueAlertBody", {
              amount: f.money(totals.overdue),
              days: siteConfig.dues.legalActionThresholdDays,
            })}
          </Alert>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={t("unitsWithDebt", { count: withDebt.length })}
          description={t("totalReceivable", { amount: f.money(totals.outstanding) })}
        />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table} style={{ minWidth: 640 }}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>{t("unit")}</th>
                  <th scope="col" className={tc.th}>{t("block")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("outstanding")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("overdue")}</th>
                  <th scope="col" className={tc.th}>{t("oldestDue")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("recordCount")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={tc.empty}>
                      {t("emptyMessage")}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.unit_id} className={tc.tr}>
                      <td className={`${tc.td} font-medium`}>{r.number}</td>
                      <td className={tc.tdMuted}>{r.block_name ?? "—"}</td>
                      <td className={tc.tdNum}>{f.money(Number(r.outstanding))}</td>
                      <td className={`${tc.td} text-right`}>
                        {Number(r.overdue) > 0 ? (
                          <Badge tone="danger">{f.money(Number(r.overdue))}</Badge>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className={tc.tdMuted}>
                        {r.oldest_due ? f.date(new Date(r.oldest_due)) : "—"}
                      </td>
                      <td className={tc.tdNum}>{r.debt_count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
