import { desc, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { meterReadings, meters, withTenant } from "@yonetim/db";
import { Badge, Card, CardBody, CardHeader, EmptyState, Stat, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MetersPage() {
  const ctx = await requirePermission("meter:read");
  const t = await getTranslations("app.meters");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const data = await withTenant(ctx.tenantId, async (tx) => {
    const meterRows = await tx.select().from(meters).where(isNull(meters.deletedAt));
    const readings = await tx
      .select()
      .from(meterReadings)
      .orderBy(desc(meterReadings.readingDate))
      .limit(100);
    return { meterRows, readings };
  });

  const anomalies = data.readings.filter((r) => r.anomalyFlag);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("defined")} value={String(data.meterRows.length)} />
        <Stat label={t("recentReadings")} value={String(data.readings.length)} />
        <Stat
          label={t("anomalies")}
          value={String(anomalies.length)}
          tone={anomalies.length ? "warning" : "success"}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title={t("recentReadings")} />
        <CardBody className="p-0">
          {data.readings.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 640 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("period")}</th>
                    <th scope="col" className={tc.th}>{t("type")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("previous")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("current")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("consumption")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("amount")}</th>
                    <th scope="col" className={tc.th}>{t("date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.readings.map((r) => {
                    const meter = data.meterRows.find((m) => m.id === r.meterId);
                    return (
                      <tr key={r.id} className={tc.tr}>
                        <td className={tc.td}>{f.period(r.period)}</td>
                        <td className={tc.td}>
                          {meter ? tEnum(`meterType.${meter.type}`) : "—"}
                        </td>
                        <td className={tc.tdNum}>{r.previousValue}</td>
                        <td className={tc.tdNum}>{r.currentValue}</td>
                        <td className={tc.tdNum}>
                          {r.consumption}
                          {r.anomalyFlag ? (
                            <Badge tone="warning">{t("anomalyBadge")}</Badge>
                          ) : null}
                        </td>
                        <td className={tc.tdNum}>{f.money(r.amountKurus)}</td>
                        <td className={tc.tdMuted}>{f.date(r.readingDate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
