import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { Alert, Card, CardBody, CardHeader, EmptyState, Stat } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requireContext } from "@/lib/context";
import { formatters } from "@/lib/format";
import { getDashboardSummary } from "@/lib/queries";

export default async function DashboardPage() {
  const ctx = await requireContext();
  const summary = await getDashboardSummary(ctx);
  const t = await getTranslations("app.dashboard");
  const f = await formatters();

  if (summary.unitCount === 0) {
    return (
      <>
        <PageHeader title={t("greeting", { property: ctx.tenantName })} />
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
          action={
            <Link
              href="/panel/birimler"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg"
            >
              {t("emptyAction")}
            </Link>
          }
        />
      </>
    );
  }

  const net = summary.collectedThisMonthKurus - summary.expenseThisMonthKurus;

  return (
    <>
      <PageHeader
        title={t("greeting", { property: ctx.tenantName })}
        description={t("description")}
      />

      {ctx.tenantStatus === "trial" ? (
        <div className="mb-6">
          <Alert tone="info" title={t("trialTitle")}>
            {t("trialBody", { months: siteConfig.billing.trial.dataRetentionMonthsAfterTrial })}
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("totalReceivable")}
          value={f.money(summary.totalDebtKurus)}
          hint={ctx.tenantName}
          tone={summary.totalDebtKurus > 0 ? "warning" : "success"}
        />
        <Stat
          label={t("overdueReceivable")}
          value={f.money(summary.overdueDebtKurus)}
          hint={t("overdueHint")}
          tone={summary.overdueDebtKurus > 0 ? "danger" : "success"}
        />
        <Stat
          label={t("collectedThisMonth")}
          value={f.money(summary.collectedThisMonthKurus)}
          hint={t("accruedHint", { amount: f.money(summary.accruedThisMonthKurus) })}
        />
        <Stat
          label={t("collectionRate")}
          value={f.percent(summary.collectionRate)}
          tone={summary.collectionRate >= 0.85 ? "success" : "warning"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("operations")} description={t("operationsDescription")} />
          <CardBody className="space-y-3 text-sm">
            <Row label={t("openRequests")} value={String(summary.openRequests)} href="/panel/talepler" />
            <Row
              label={t("slaBreached")}
              value={String(summary.slaBreached)}
              href="/panel/talepler"
              danger={summary.slaBreached > 0}
            />
            <Row
              label={t("maintenanceIn30Days")}
              value={String(summary.upcomingMaintenance)}
              href="/panel/bakim"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("expenseThisMonth")} description={t("expenseThisMonthDescription")} />
          <CardBody>
            <div className="text-2xl font-bold tabular-nums text-fg">
              {f.money(summary.expenseThisMonthKurus)}
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              {t("collectionExpenseGap")}{" "}
              <strong className={net >= 0 ? "text-success-fg" : "text-danger-fg"}>
                {f.money(net)}
              </strong>
            </p>
            <Link
              href="/panel/simulator"
              className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
            >
              {t("openSimulator")}
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("lastAnnouncement")} />
          <CardBody>
            {summary.lastAnnouncement ? (
              <>
                <div className="font-medium text-fg">{summary.lastAnnouncement.title}</div>
                <div className="mt-1 text-sm text-fg-subtle">
                  {summary.lastAnnouncement.publishedAt
                    ? f.date(summary.lastAnnouncement.publishedAt)
                    : t("draft")}
                </div>
              </>
            ) : (
              <p className="text-sm text-fg-subtle">{t("noAnnouncement")}</p>
            )}
            <Link
              href="/panel/duyurular"
              className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
            >
              {t("createAnnouncement")}
            </Link>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  href,
  danger,
}: {
  label: string;
  value: string;
  href: string;
  danger?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center justify-between hover:underline">
      <span className="text-fg-muted">{label}</span>
      <span className={`font-semibold tabular-nums ${danger ? "text-danger-fg" : "text-fg"}`}>
        {value}
      </span>
    </Link>
  );
}
