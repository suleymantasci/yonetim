import { getTranslations } from "next-intl/server";

import { currentPeriod, periodKey } from "@yonetim/core";
import { Card, CardBody, CardHeader, Stat, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { getDashboardSummary, getUnitDebtSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const ctx = await requirePermission("report:read");
  const t = await getTranslations("app.reports");
  const f = await formatters();
  const summary = await getDashboardSummary(ctx);
  const unitDebts = await getUnitDebtSummary(ctx);

  const paying = unitDebts.filter((u) => Number(u.outstanding) === 0).length;
  const late = unitDebts.filter((u) => Number(u.overdue) > 0).length;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { period: f.period(periodKey(currentPeriod())) })}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("collectionRate")} value={f.percent(summary.collectionRate)} />
        <Stat
          label={t("unitsWithoutDebt")}
          value={`${paying}/${unitDebts.length}`}
          tone="success"
        />
        <Stat
          label={t("unitsOverdue")}
          value={String(late)}
          tone={late ? "warning" : "success"}
        />
        <Stat label={t("monthlyExpense")} value={f.money(summary.expenseThisMonthKurus)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("balanceTitle")} description={t("balanceDescription")} />
          <CardBody className="space-y-2 text-sm">
            <Row label={t("accrued")} value={f.money(summary.accruedThisMonthKurus)} />
            <Row label={t("collected")} value={f.money(summary.collectedThisMonthKurus)} />
            <Row label={t("expense")} value={f.money(summary.expenseThisMonthKurus)} />
            <Row
              label={t("net")}
              value={f.money(summary.collectedThisMonthKurus - summary.expenseThisMonthKurus)}
              strong
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("topDebtorsTitle")} />
          <CardBody className="p-0">
            <table className={tc.table}>
              <tbody>
                {unitDebts.slice(0, 10).map((u) => (
                  <tr key={u.unit_id} className={tc.tr}>
                    <td className={tc.td}>{u.number}</td>
                    <td className={tc.tdNum}>{f.money(Number(u.outstanding))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-fg-subtle">{label}</span>
      <span className={strong ? "font-bold tabular-nums" : "tabular-nums"}>{value}</span>
    </div>
  );
}
