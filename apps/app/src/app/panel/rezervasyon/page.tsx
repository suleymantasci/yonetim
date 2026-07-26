import { desc, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { reservations, resources, withTenant } from "@yonetim/db";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  approved: "success", pending: "warning", rejected: "danger",
  cancelled: "neutral", completed: "neutral", no_show: "danger",
};

export default async function ReservationsPage() {
  const ctx = await requirePermission("reservation:read");
  const t = await getTranslations("app.reservations");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const data = await withTenant(ctx.tenantId, async (tx) => {
    const res = await tx.select().from(resources).where(isNull(resources.deletedAt));
    const rows = await tx.select().from(reservations).orderBy(desc(reservations.startAt)).limit(100);
    return { res, rows };
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.res.map((r) => (
          <Card key={r.id}>
            <CardHeader
              title={r.name}
              description={`${
                tEnum.has(`resourceKind.${r.kind}`) ? tEnum(`resourceKind.${r.kind}`) : r.kind
              } · ${t("capacity", { count: r.capacity ?? "—" })}`}
            />
            <CardBody className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-fg-subtle">{t("fee")}</span>
                <span className="font-medium text-fg">
                  {r.feeKurus === 0
                    ? t("free")
                    : `${f.money(r.feeKurus)} / ${tEnum(`feeUnit.${r.feeUnit}`)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-subtle">{t("deposit")}</span>
                <span>{r.depositKurus === 0 ? t("noDeposit") : f.money(r.depositKurus)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-subtle">{t("approval")}</span>
                <span>{r.requiresApproval ? t("approvalRequired") : t("autoApproval")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-subtle">{t("hours")}</span>
                <span className="tabular-nums">
                  {r.openHour}:00 – {r.closeHour}:00
                </span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title={t("listTitle")} />
        <CardBody className="p-0">
          {data.rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-fg">
                      {data.res.find((x) => x.id === r.resourceId)?.name ?? "—"}
                    </div>
                    <div className="text-xs text-fg-subtle">
                      {f.dateTime(r.startAt)} → {f.dateTime(r.endAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {tEnum(`reservationStatus.${r.status}`)}
                    </Badge>
                    <span className="tabular-nums">{f.money(r.feeKurus)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
