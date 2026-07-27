import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { platformOverview } from "@yonetim/contracts";
import type { TenantStatus } from "@yonetim/core";
import {
  Alert, Badge, Card, CardBody, CardHeader, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { apiGet } from "@/lib/api/server";
import { requireContext } from "@/lib/context";
import { formatters } from "@/lib/format";

/**
 * Süper-admin paneli — SPEC Bölüm 18.
 *
 * Yalnızca platform rolleri (super_admin / support_agent) erişebilir ve bu
 * kontrol **uçta**: `/v1/panel/platform/overview` yetkisiz çağrıyı 403 ile
 * kesiyor. Buradaki `requireContext()` yalnız oturum ve kullanıcı adı için —
 * ekranın kapısı olduğunu sanmak, veriyi çeken sorguyu korumasız bırakmak
 * olurdu.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.admin");
  return { title: t("title"), robots: { index: false } };
}

export default async function AdminPage() {
  const ctx = await requireContext();
  const t = await getTranslations("app.admin");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const f = await formatters();
  const data = await apiGet("/v1/panel/platform/overview", platformOverview);
  const {
    tenants: tenantStats,
    revenue,
    notifications: notify,
    recentTenants,
    campaigns: campaignRows,
    featureFlags: flags,
    plans: planRows,
  } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-fg">{t("title")}</h1>
          <p className="text-sm text-fg-subtle">
            {siteConfig.brand.name} · {ctx.userName}
          </p>
        </div>
        <form action="/api/oturum/cikis" method="post">
          <button className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg hover:bg-hover">
            {tCommon("action.logout")}
          </button>
        </form>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("totalTenants")} value={String(tenantStats.total)} />
        <Stat
          label={t("activeSubscriptions")}
          value={String(tenantStats.active)}
          tone="success"
        />
        <Stat label={t("inTrial")} value={String(tenantStats.trial)} />
        <Stat
          label={t("pastDue")}
          value={String(tenantStats.pastDue)}
          tone={tenantStats.pastDue > 0 ? "warning" : "neutral"}
        />
        <Stat label={t("mrr")} value={f.money(revenue.mrrMinor)} />
        <Stat label={t("arr")} value={f.money(revenue.arrMinor)} />
        <Stat
          label={t("notificationFailureRate")}
          value={f.percent(notify.failureRate, 1)}
          tone={notify.failureRate > 0.01 ? "danger" : "success"}
          hint={t("notificationsSent", { count: notify.sent })}
        />
        <Stat label={t("notificationCost")} value={f.money(notify.costMinor)} />
      </div>

      {data.overdueKvkkCount > 0 ? (
        <Alert tone="danger" title={t("overdueKvkkTitle")}>
          {t("overdueKvkkBody", { count: data.overdueKvkkCount })}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("recentTenants")} description={t("recentTenantsDescription")} />
          <CardBody className="p-0">
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("property")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("units")}</th>
                    <th scope="col" className={tc.th}>{t("status")}</th>
                    <th scope="col" className={tc.th}>{t("registered")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTenants.map((row) => (
                    <tr key={row.id} className={tc.tr}>
                      <td className={tc.td}>
                        <div className="font-medium text-fg">{row.name}</div>
                        <div className="text-xs text-fg-subtle">{row.slug}</div>
                      </td>
                      <td className={tc.tdNum}>{row.unitCount}</td>
                      <td className={tc.td}>
                        <Badge
                          tone={
                            row.status === "active"
                              ? "success"
                              : row.status === "trial"
                                ? "info"
                                : row.status === "past_due"
                                  ? "warning"
                                  : "neutral"
                          }
                        >
                          {tEnum(`tenantStatus.${row.status as TenantStatus}`)}
                        </Badge>
                      </td>
                      <td className={tc.tdMuted}>{f.date(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("campaignPerformance")} />
            <CardBody className="space-y-2 text-sm">
              {campaignRows.length === 0 ? (
                <p className="text-fg-subtle">{t("noCampaigns")}</p>
              ) : (
                campaignRows.map((c) => (
                  <div key={c.name} className="flex items-center justify-between gap-2">
                    <span className="text-fg">{c.name}</span>
                    <span className="flex items-center gap-2">
                      <Badge tone={c.status === "active" ? "success" : "neutral"}>
                        {c.status === "active"
                          ? tCommon("state.active")
                          : tCommon("state.inactive")}
                      </Badge>
                      <span className="tabular-nums">
                        {c.usageCount}
                        {c.usageLimit ? `/${c.usageLimit}` : ""}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("featureFlags")} description={t("featureFlagsDescription")} />
            <CardBody className="space-y-2 text-sm">
              {flags.length === 0 ? (
                <p className="text-fg-subtle">{t("noFlags")}</p>
              ) : (
                flags.map((flag) => (
                  <div key={flag.id} className="flex items-center justify-between">
                    <span className="font-mono text-xs text-fg">{flag.key}</span>
                    <span className="flex items-center gap-2">
                      <Badge tone={flag.enabled ? "success" : "neutral"}>
                        {flag.enabled ? tCommon("state.active") : tCommon("state.inactive")}
                      </Badge>
                      <span className="text-xs text-fg-subtle">
                        {f.percent(flag.rolloutPct / 100)}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t("planCatalog")}
              description={t("planCatalogDescription", { count: planRows.length })}
            />
            <CardBody className="space-y-1 text-sm">
              {planRows.slice(0, 8).map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span className="text-fg">{p.name}</span>
                  <span className="tabular-nums">{f.money(p.yearlyPriceMinor)}</span>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <Alert tone="info" title={t("impersonationTitle")}>
        {t("impersonationBody")}
      </Alert>
    </div>
  );
}
