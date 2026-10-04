import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { dataBreachList, kvkkOverviewResponse, residentOptionList } from "@yonetim/contracts";
import { Alert, Badge, Card, CardBody, CardHeader, Stat } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

import { BreachActions, CreateBreachButton, CreateRequestButton, RequestActions } from "./kvkk-actions";

export const dynamic = "force-dynamic";

export default async function KvkkPage() {
  const ctx = await requirePermission("kvkk:read");
  const canManage = can(ctx, "kvkk:manage");
  const t = await getTranslations("app.kvkkPanel");
  const tKvkk = await getTranslations("kvkk");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  // Risk puanı sunucuda hesaplanıyor: girdilerinin hepsi (rıza kapsamı,
  // geciken başvuru, işaretli duyuru) veritabanından geliyor. Ekranda
  // hesaplamak için önce beş sorgunun sonucunu taşımak gerekirdi (§9a).
  const {
    requests,
    risk,
    erasurePlan: erasure,
    totals,
  } = await apiGet("/v1/panel/kvkk", kvkkOverviewResponse);
  const [breaches, residentOptions] = await Promise.all([
    apiGet("/v1/panel/kvkk/breaches", dataBreachList),
    canManage && can(ctx, "resident:read")
      ? apiGet("/v1/panel/residents/options", residentOptionList)
      : Promise.resolve({ rows: [] }),
  ]);
  const residents = residentOptions.rows.map((row) => ({
    value: row.id,
    label: [row.firstName, row.lastName].filter(Boolean).join(" ") + (row.phoneMasked ? ` · ${row.phoneMasked}` : ""),
  }));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", {
          days: Math.round(siteConfig.legal.kvkkResponseHours / 24),
        })}
        action={canManage ? <CreateRequestButton residents={residents} /> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
        <Stat
          label={t("riskScore")}
          value={`${risk.score}/100`}
          hint={tEnum(`riskLevel.${risk.level}`)}
          tone={
            risk.level === "dusuk"
              ? "success"
              : risk.level === "orta"
                ? "warning"
                : "danger"
          }
        />
        <Stat label={t("openRequests")} value={String(totals.open)} />
        <Stat
          label={t("overdueRequests")}
          value={String(totals.overdue)}
          tone={totals.overdue ? "danger" : "success"}
        />
        <Stat
          label={t("consentRate")}
          value={f.percent(totals.consentCoverage)}
        />
      </div>

      {totals.overdue > 0 ? (
        <div className="mt-4">
          <Alert tone="danger" title={t("overdueAlertTitle")}>
            {t("overdueAlertBody")}
          </Alert>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("findingsTitle")} />
          <CardBody className="space-y-3">
            {risk.issues.length === 0 ? (
              <p className="text-sm text-success-fg">{t("noFindings")}</p>
            ) : (
              risk.issues.map((issue) => (
                <div
                  key={issue.code}
                  className="rounded border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-fg">
                      {tKvkk(`risk.${issue.code}.title`, issue.params ?? {})}
                    </span>
                    <Badge
                      tone={
                        issue.weight >= 20
                          ? "danger"
                          : issue.weight >= 10
                            ? "warning"
                            : "neutral"
                      }
                    >
                      +{issue.weight}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">
                    {tKvkk(`risk.${issue.code}.action`)}
                  </p>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("requestsTitle")} />
          <CardBody className="space-y-2">
            {requests.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t("noRequests")}</p>
            ) : (
              requests.map((r) => (
                <div
                  key={r.id}
                  className="rounded border border-border p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-fg">
                      {tEnum(`kvkkRequestType.${r.type}`)}
                    </span>
                    <Badge
                      tone={
                        r.status === "fulfilled"
                          ? "success"
                          : r.overdue
                            ? "danger"
                            : "warning"
                      }
                    >
                      {tEnum(`kvkkRequestStatus.${r.status}`)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-fg">
                    {r.subjectName ?? r.requesterEmail ?? "—"}
                  </div>
                  {r.detail ? <p className="mt-1 whitespace-pre-line text-xs text-fg-muted">{r.detail}</p> : null}
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-fg-subtle">
                    <span className={r.overdue ? "font-semibold text-danger-fg" : undefined}>
                      {t("legalDueAt", { date: f.date(r.legalDueAt) })}
                    </span>
                    {r.dueAt && !r.fulfilledAt ? <span>{t("dueAt", { date: f.dateTime(r.dueAt) })}</span> : null}
                    {r.fulfilledAt ? <span>{t("fulfilledAt", { date: f.dateTime(r.fulfilledAt) })}</span> : null}
                  </div>
                  {r.responseNote ? (
                    <p className="mt-1 rounded bg-surface-sunken p-2 text-xs text-fg-muted">{r.responseNote}</p>
                  ) : null}
                  {canManage ? <RequestActions requestId={r.id} type={r.type} status={r.status} /> : null}
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title={t("erasureTitle")}
          description={t("erasureDescription")}
        />
        <CardBody className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <h3 className="font-semibold text-fg">{t("deletable")}</h3>
            <ul className="mt-2 space-y-1 text-fg-muted">
              {erasure.deletable.map((d) => (
                <li key={d} className="font-mono text-xs">
                  • {d}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-fg">{t("anonymizable")}</h3>
            <ul className="mt-2 space-y-1 text-fg-muted">
              {erasure.anonymizable.map((a) => (
                <li key={a.field}>
                  • <span className="font-mono text-xs">{a.field}</span> —{" "}
                  {tKvkk(`anonymize.${a.reasonKey}`)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-fg">{t("retained")}</h3>
            <ul className="mt-2 space-y-1 text-fg-muted">
              {erasure.retained.map((r) => (
                <li key={r.table}>
                  • <span className="font-mono text-xs">{r.table}</span>:{" "}
                  {tKvkk(`retention.${r.reasonKey}`)} (
                  {tKvkk(`retention.until.${r.untilKey}`, {
                    value: r.untilValue ?? "",
                  })}
                  )
                </li>
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>
      <Card className="mt-4">
        <CardHeader
          title={t("breachesTitle")}
          description={t("breachesDescription")}
          action={canManage ? <CreateBreachButton /> : undefined}
        />
        <CardBody className="space-y-2">
          {breaches.rows.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noBreaches")}</p>
          ) : (
            breaches.rows.map((b) => (
              <div key={b.id} className="rounded border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-fg">{b.title}</span>
                  <Badge tone={b.boardOverdue ? "danger" : b.status === "closed" ? "success" : "warning"}>
                    {t(`breachStatusOption.${b.status}`)}
                  </Badge>
                </div>
                <p className="mt-1 whitespace-pre-line text-xs text-fg-muted">{b.description}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-fg-subtle">
                  <span>{t("detectedOn", { date: f.dateTime(b.detectedAt) })}</span>
                  <span>{t("affectedCount", { count: b.affectedUserCount })}</span>
                  {b.boardNotifiedAt ? (
                    <span>{t("boardNotifiedOn", { date: f.dateTime(b.boardNotifiedAt) })}</span>
                  ) : (
                    <span className={b.boardOverdue ? "font-semibold text-danger-fg" : "font-semibold text-warning-fg"}>
                      {t("boardDeadline", { date: f.dateTime(b.boardDeadlineAt) })}
                    </span>
                  )}
                </div>
                {canManage ? (
                  <BreachActions breachId={b.id} status={b.status} boardNotified={Boolean(b.boardNotifiedAt)} />
                ) : null}
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </>
  );
}
