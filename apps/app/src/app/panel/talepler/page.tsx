import { desc, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { requests, withTenant } from "@yonetim/db";
import {
  Badge, Card, CardBody, CardHeader, EmptyState, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

const PRIORITY_TONE = {
  critical: "danger",
  high: "warning",
  normal: "neutral",
  low: "info",
} as const;

export default async function RequestsPage() {
  const ctx = await requirePermission("request:read");
  const t = await getTranslations("app.requests");
  const tEnum = await getTranslations("enum");
  const f = await formatters();
  const now = new Date();

  const rows = await withTenant(ctx.tenantId, async (tx) =>
    tx
      .select()
      .from(requests)
      .where(isNull(requests.deletedAt))
      .orderBy(desc(requests.createdAt))
      .limit(200),
  );

  const open = rows.filter((r) => !["resolved", "closed", "rejected"].includes(r.status));
  const breached = open.filter((r) => r.slaDueAt && r.slaDueAt < now);
  const resolved = rows.filter((r) => r.resolvedAt);
  const avgHours =
    resolved.length > 0
      ? Math.round(
          resolved.reduce(
            (a, r) => a + (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 3_600_000,
            0,
          ) / resolved.length,
        )
      : 0;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", {
          critical: siteConfig.sla.critical.hours,
          high: siteConfig.sla.high.hours,
          normal: siteConfig.sla.normal.hours,
        })}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label={t("open")} value={String(open.length)} />
        <Stat
          label={t("slaBreached")}
          value={String(breached.length)}
          tone={breached.length ? "danger" : "success"}
        />
        <Stat label={t("resolved")} value={String(resolved.length)} />
        <Stat label={t("avgResolution")} value={t("avgResolutionValue", { hours: avgHours })} />
      </div>

      <Card className="mt-4">
        <CardHeader title={t("listTitle")} />
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 760 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("code")}</th>
                    <th scope="col" className={tc.th}>{t("subject")}</th>
                    <th scope="col" className={tc.th}>{t("category")}</th>
                    <th scope="col" className={tc.th}>{t("priority")}</th>
                    <th scope="col" className={tc.th}>{t("status")}</th>
                    <th scope="col" className={tc.th}>{t("sla")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isBreached = r.slaDueAt && r.slaDueAt < now && !r.resolvedAt;
                    return (
                      <tr key={r.id} className={tc.tr}>
                        <td className={`${tc.td} font-mono text-xs`}>{r.code}</td>
                        <td className={tc.td}>{r.title}</td>
                        <td className={tc.tdMuted}>{tEnum(`requestCategory.${r.category}`)}</td>
                        <td className={tc.td}>
                          <Badge tone={PRIORITY_TONE[r.priority]}>
                            {tEnum(`requestPriority.${r.priority}`)}
                          </Badge>
                        </td>
                        <td className={tc.td}>{tEnum(`requestStatus.${r.status}`)}</td>
                        <td className={`${tc.td} text-xs`}>
                          {r.slaDueAt ? (
                            isBreached ? (
                              <Badge tone="danger">
                                {t("slaExceeded", { date: f.dateTime(r.slaDueAt) })}
                              </Badge>
                            ) : (
                              f.dateTime(r.slaDueAt)
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={tc.tdNum}>{f.money(r.costKurus)}</td>
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
