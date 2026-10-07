import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { requestDetail, requestListResponse } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { RequestDetailPanel } from "../request-detail-panel";
import { RequestForm } from "../request-form";

export const dynamic = "force-dynamic";

const PRIORITY_TONE = {
  critical: "danger",
  high: "warning",
  normal: "neutral",
  low: "info",
} as const;

/** `/panel/talepler/[id]` — tam sayfa detay (çekmece: `@modal/(.)talepler`). */
export default async function RequestDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("request:read");
  const t = await getTranslations("app.requests");
  const tEnum = await getTranslations("enum");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const [detail, options] = await Promise.all([
    apiGet(`/v1/panel/operations/requests/${id}`, requestDetail).catch(
      () => null,
    ),
    apiGet("/v1/panel/operations/requests", requestListResponse),
  ]);
  if (!detail) notFound();

  const canWrite = hasPermission(ctx.roles, "request:write");
  const canAssign = hasPermission(ctx.roles, "request:assign");

  return (
    <>
      <PageHeader
        title={`${detail.code} — ${detail.title}`}
        description={t("detailDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/talepler" },
          { label: detail.code },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title={t("summarySection")}
              action={
                <Badge tone={PRIORITY_TONE[detail.priority]}>
                  {tEnum(`requestPriority.${detail.priority}`)}
                </Badge>
              }
            />
            <CardBody className="space-y-2 text-sm">
              <Row
                label={t("status")}
                value={tEnum(`requestStatus.${detail.status}`)}
              />
              <Row
                label={t("category")}
                value={tEnum(`requestCategory.${detail.category}`)}
              />
              <Row
                label={t("unit")}
                value={detail.unitNumber ?? t("unitCommonArea")}
              />
              <Row
                label={t("assignee")}
                value={detail.assignedToName ?? t("assigneeNone")}
              />
              <Row
                label={t("sla")}
                value={detail.slaDueAt ? f.dateTime(detail.slaDueAt) : "—"}
              />
              <Row
                label={t("firstResponse")}
                value={
                  detail.firstResponseAt
                    ? f.dateTime(detail.firstResponseAt)
                    : t("noFirstResponse")
                }
              />
              <Row label={t("cost")} value={f.money(detail.costMinor)} />
              <Row label={t("createdAt")} value={f.dateTime(detail.createdAt)} />
              {detail.description ? (
                <p className="whitespace-pre-wrap border-t border-border pt-2 text-fg">
                  {detail.description}
                </p>
              ) : null}
            </CardBody>
          </Card>

          {canWrite ? (
            <Card>
              <CardHeader title={t("editSection")} />
              <CardBody>
                <RequestForm
                  defaults={{
                    id: detail.id,
                    unitId: detail.unitId,
                    category: detail.category,
                    title: detail.title,
                    description: detail.description,
                    priority: detail.priority,
                    assignedToUserId: detail.assignedToUserId,
                    costKurus: detail.costMinor,
                  }}
                  units={options.units}
                  assignees={options.assignees}
                  canAssign={canAssign}
                  submitLabel={tCommon("action.save")}
                  stayOnSuccess
                />
              </CardBody>
            </Card>
          ) : null}
        </div>

        {canWrite ? (
          <RequestDetailPanel
            detail={detail}
            assignees={options.assignees}
            canAssign={canAssign}
          />
        ) : null}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-fg-subtle">{label}</span>
      <span className="text-right font-medium text-fg">{value}</span>
    </div>
  );
}
