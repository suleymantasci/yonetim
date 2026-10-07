import { getTranslations } from "next-intl/server";

import { currentPeriod, periodKey } from "@yonetim/core";
import {
  Card,
  CardBody,
  CardHeader,
  Stat,
  tableClasses as tc,
} from "@yonetim/ui";

import { dashboardResponse, unitDebtSummary } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requirePermission("report:read");
  const t = await getTranslations("app.reports");
  const f = await formatters();

  const [{ summary }, { rows: unitDebts }] = await Promise.all([
    apiGet("/v1/panel/dashboard", dashboardResponse),
    apiGet("/v1/panel/debts/unit-summary", unitDebtSummary),
  ]);

  const paying = unitDebts.filter((u) => u.outstandingMinor === 0).length;
  const late = unitDebts.filter((u) => u.overdueMinor > 0).length;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", {
          period: f.period(periodKey(currentPeriod())),
        })}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("collectionRate")}
          value={f.percent(summary.collectionRate)}
        />
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
        <Stat
          label={t("monthlyExpense")}
          value={f.money(summary.expenseThisMonthMinor)}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("balanceTitle")}
            description={t("balanceDescription")}
          />
          <CardBody className="space-y-2 text-sm">
            <Row
              label={t("accrued")}
              value={f.money(summary.accruedThisMonthMinor)}
            />
            <Row
              label={t("collected")}
              value={f.money(summary.collectedThisMonthMinor)}
            />
            <Row
              label={t("expense")}
              value={f.money(summary.expenseThisMonthMinor)}
            />
            <Row
              label={t("net")}
              value={f.money(
                summary.collectedThisMonthMinor - summary.expenseThisMonthMinor,
              )}
              strong
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("topDebtorsTitle")} />
          <CardBody className="p-0">
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <tbody>
                  {unitDebts.slice(0, 10).map((u) => (
                    <tr key={u.unitId} className={tc.tr}>
                      <td className={tc.td}>{u.number}</td>
                      <td className={tc.tdNum}>
                        {f.money(u.outstandingMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-fg-subtle">{label}</span>
      <span className={strong ? "font-bold tabular-nums" : "tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
