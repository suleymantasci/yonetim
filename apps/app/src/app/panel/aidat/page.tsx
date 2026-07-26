import { isNull } from "drizzle-orm";
import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { currentPeriod, periodKey } from "@yonetim/core";
import { duesPlans, duesRuns, withTenant } from "@yonetim/db";
import type { DuesFormula } from "@yonetim/dues";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DuesPlansPage() {
  const ctx = await requirePermission("dues:read");
  const t = await getTranslations("app.duesPlans");
  const tEnum = await getTranslations("enum");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const data = await withTenant(ctx.tenantId, async (tx) => {
    const plans = await tx.select().from(duesPlans).where(isNull(duesPlans.deletedAt));
    const runs = await tx.select().from(duesRuns).limit(50);
    return { plans, runs };
  });

  const newPlanButton = (
    <Link
      href="/panel/aidat/yeni"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
    >
      <Plus aria-hidden className="h-4 w-4" />
      {t("newPlan")}
    </Link>
  );

  if (data.plans.length === 0) {
    return (
      <>
        <PageHeader title={t("title")} action={newPlanButton} />
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
          action={newPlanButton}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} action={newPlanButton} />

      <div className="grid gap-4 lg:grid-cols-2">
        {data.plans.map((p) => (
          <Card key={p.id}>
            <CardHeader
              title={p.name}
              description={`${tEnum(`duesPeriod.${p.period}`)} · ${t("dueDaySuffix", { day: p.dueDayOfMonth })}`}
              action={
                <div className="flex items-center gap-2">
                  {p.isActive ? (
                    <Badge tone="success">{tCommon("state.active")}</Badge>
                  ) : (
                    <Badge tone="neutral">{tCommon("state.inactive")}</Badge>
                  )}
                  <Link
                    href={`/panel/aidat/${p.id}/duzenle`}
                    aria-label={tCommon("action.edit")}
                    className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg"
                  >
                    <Pencil aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                </div>
              }
            />
            <CardBody className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-fg-subtle">{t("formula")}</span>
                <span className="font-medium text-fg">
                  {tEnum(`duesFormula.${p.formula as DuesFormula}`)}
                </span>
              </div>
              <p className="text-xs text-fg-subtle">
                {tEnum(`duesFormulaDescription.${p.formula as DuesFormula}`)}
              </p>
              <div className="flex justify-between gap-4">
                <span className="text-fg-subtle">
                  {p.formula === "equal" ? t("baseAmount") : t("poolAmount")}
                </span>
                <span className="font-semibold tabular-nums text-fg">
                  {f.money(p.baseAmountKurus ?? p.totalAmountKurus ?? 0)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-fg-subtle">{t("lateFee")}</span>
                <span className="text-fg">{t("lateFeeValue", { pct: p.lateFeeMonthlyPct })}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-fg-subtle">{t("startPeriod")}</span>
                <span className="text-fg">{f.period(p.startPeriod)}</span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader
          title={t("accrualHistory")}
          description={t("currentPeriod", { period: f.period(periodKey(currentPeriod())) })}
        />
        <CardBody className="p-0">
          {data.runs.length === 0 ? (
            <p className="p-4 text-sm text-fg-subtle">{t("noRuns")}</p>
          ) : (
            <table className={tc.table}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>{t("period")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("generatedDebts")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("total")}</th>
                  <th scope="col" className={tc.th}>{t("runStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id} className={tc.tr}>
                    <td className={tc.td}>{f.period(r.period)}</td>
                    <td className={tc.tdNum}>{r.generatedCount}</td>
                    <td className={tc.tdNum}>{f.money(r.totalKurus)}</td>
                    <td className={tc.td}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <div className="mt-4">
        <Alert tone="info" title={t("transparencyTitle")}>
          {t("transparencyBody")}
        </Alert>
      </div>
    </>
  );
}
