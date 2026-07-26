import { and, count, eq, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { announcements, consents, kvkkRequests, withTenant } from "@yonetim/db";
import { kvkkRiskScore, planErasure } from "@yonetim/kvkk";
import { Alert, Badge, Card, CardBody, CardHeader, Stat } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function KvkkPage() {
  const ctx = await requirePermission("kvkk:read");
  const t = await getTranslations("app.kvkkPanel");
  const tKvkk = await getTranslations("kvkk");
  const tEnum = await getTranslations("enum");
  const f = await formatters();
  const now = new Date();

  const stats = await withTenant(ctx.tenantId, async (tx) => {
    const requests = await tx.select().from(kvkkRequests).limit(100);
    const [flagged] = await tx
      .select({ value: count() })
      .from(announcements)
      .where(and(eq(announcements.kvkkFlagged, true), isNull(announcements.deletedAt)));
    const consentRows = await tx
      .select({ granted: consents.granted, kind: consents.kind })
      .from(consents);
    return { requests, flagged: flagged?.value ?? 0, consentRows };
  });

  const overdue = stats.requests.filter((r) => r.status !== "fulfilled" && r.dueAt < now);
  const consentGranted = stats.consentRows.filter(
    (c) => c.kind === "acik_riza_zorunlu" && c.granted,
  ).length;
  const consentTotal = Math.max(
    1,
    stats.consentRows.filter((c) => c.kind === "acik_riza_zorunlu").length,
  );

  const risk = kvkkRiskScore({
    hasPrivacyNotice: true,
    consentCoverage: consentGranted / consentTotal,
    overdueRequests: overdue.length,
    blockedAnnouncements90d: stats.flagged,
    staleResidents: 0,
    verbisRegistered: false,
    hasDpoContact: Boolean(siteConfig.brand.contact.email),
    breaches12m: 0,
    mfaEnabled: ctx.session.user.twoFactorEnabled,
    identityDocsStored: 0,
  });

  const erasure = planErasure();

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", {
          days: Math.round(siteConfig.legal.kvkkResponseHours / 24),
        })}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat
          label={t("riskScore")}
          value={`${risk.score}/100`}
          hint={tEnum(`riskLevel.${risk.level}`)}
          tone={risk.level === "dusuk" ? "success" : risk.level === "orta" ? "warning" : "danger"}
        />
        <Stat
          label={t("openRequests")}
          value={String(stats.requests.filter((r) => r.status !== "fulfilled").length)}
        />
        <Stat
          label={t("overdueRequests")}
          value={String(overdue.length)}
          tone={overdue.length ? "danger" : "success"}
        />
        <Stat label={t("consentRate")} value={f.percent(consentGranted / consentTotal)} />
      </div>

      {overdue.length > 0 ? (
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
                <div key={issue.code} className="rounded border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-fg">
                      {tKvkk(`risk.${issue.code}.title`, issue.params ?? {})}
                    </span>
                    <Badge
                      tone={issue.weight >= 20 ? "danger" : issue.weight >= 10 ? "warning" : "neutral"}
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
            {stats.requests.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t("noRequests")}</p>
            ) : (
              stats.requests.map((r) => (
                <div key={r.id} className="rounded border border-border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-fg">
                      {tEnum(`kvkkRequestType.${r.type}`)}
                    </span>
                    <Badge
                      tone={
                        r.status === "fulfilled" ? "success" : r.dueAt < now ? "danger" : "warning"
                      }
                    >
                      {tEnum(`kvkkRequestStatus.${r.status}`)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-fg-subtle">
                    {t("dueAt", { date: f.dateTime(r.dueAt) })}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={t("erasureTitle")} description={t("erasureDescription")} />
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
                  {tKvkk(`retention.until.${r.untilKey}`, { value: r.untilValue ?? "" })})
                </li>
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
