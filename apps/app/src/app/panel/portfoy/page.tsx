import { AlertTriangle, Plus } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { portfolioResponse } from "@yonetim/contracts";
import { HEALTHY_COLLECTION_RATE } from "@yonetim/dues";
import {
  Badge, Card, CardBody, EmptyState, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requireContext } from "@/lib/context";
import { formatters } from "@/lib/format";
import { SwitchTenantButton } from "./switch-tenant-button";

/**
 * Yönetim şirketi portföyü — SPEC Bölüm 2.2.
 *
 * `company_admin` / `company_operator` rolleri ve `tenants.company_id` alanı
 * baştan beri vardı ama ekranı yoktu: 20 siteyi yöneten bir şirket "hangisinde
 * işler kötü gidiyor" sorusunu 20 kez site değiştirerek cevaplıyordu.
 *
 * SIRALAMA RİSKE GÖRE: liste alfabetik değil, **dikkat gerektiren site üstte**.
 * Alfabetik bir liste 20 satırda hiçbir şey söylemiyor; buradaki tek iş
 * "bugün nereye bakmalıyım" sorusunu ilk satırda cevaplamak.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.portfolio");
  return { title: t("title") };
}

export default async function PortfolioPage() {
  const ctx = await requireContext();
  const t = await getTranslations("app.portfolio");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const { totals, rows } = await apiGet("/v1/panel/portfolio", portfolioResponse);

  // Risk skoru: gecikmiş borç, SLA ihlali ve geciken bakım birlikte bakılır.
  // Tek boyuta indirmek (ör. yalnız gecikmiş borç) SLA'sı patlamış ama borcu
  // temiz bir siteyi listenin dibine atardı.
  const sorted = [...rows].sort((a, b) => riskScore(b) - riskScore(a));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { count: totals.tenantCount })}
        action={
          ctx.roles.some((r) => r === "manager" || r === "company_admin") ? (
            <Link
              href="/panel/portfoy/yeni"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("newTenant")}
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("tenantCount")} value={String(totals.tenantCount)} />
        <Stat label={t("unitCount")} value={String(totals.unitCount)} />
        <Stat
          label={t("outstanding")}
          value={f.money(totals.outstandingMinor)}
          tone={totals.outstandingMinor > 0 ? "warning" : "success"}
        />
        <Stat
          label={t("overdue")}
          value={f.money(totals.overdueMinor)}
          tone={totals.overdueMinor > 0 ? "danger" : "success"}
        />
      </div>

      <Card className="mt-4">
        <CardBody className="p-0">
          {sorted.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th className={tc.th}>{t("col.property")}</th>
                    <th className={`${tc.th} text-right`}>{t("col.units")}</th>
                    <th className={`${tc.th} text-right`}>{t("col.collectionRate")}</th>
                    <th className={`${tc.th} text-right`}>{t("col.overdue")}</th>
                    <th className={tc.th}>{t("col.attention")}</th>
                    <th className={tc.th}>
                      <span className="sr-only">{t("col.action")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr key={row.tenantId} className={tc.tr}>
                      <td className={tc.td}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-fg">{row.name}</span>
                          {row.active ? (
                            <Badge tone="info">{t("current")}</Badge>
                          ) : null}
                          {row.status !== "active" ? (
                            <Badge tone={row.status === "trial" ? "info" : "warning"}>
                              {tEnum(`tenantStatus.${row.status}`)}
                            </Badge>
                          ) : null}
                        </div>
                        <span className="text-xs text-fg-subtle">
                          {tEnum(`role.${row.role}`)}
                        </span>
                      </td>
                      <td className={tc.tdNum}>{row.unitCount}</td>
                      <td className={tc.tdNum}>
                        {row.collectionRate === null ? (
                          <span className="text-fg-subtle">—</span>
                        ) : (
                          <span
                            className={
                              row.collectionRate < HEALTHY_COLLECTION_RATE
                                ? "font-semibold text-danger-fg"
                                : "text-fg"
                            }
                          >
                            {f.percent(row.collectionRate, 0)}
                          </span>
                        )}
                      </td>
                      <td className={tc.tdNum}>
                        <span className={row.overdueMinor > 0 ? "text-danger-fg" : ""}>
                          {f.money(row.overdueMinor)}
                        </span>
                      </td>
                      <td className={tc.td}>
                        <Attention row={row} t={t} />
                      </td>
                      <td className={tc.td}>
                        {row.active ? (
                          <span className="text-xs text-fg-subtle">{t("viewing")}</span>
                        ) : (
                          <SwitchTenantButton
                            tenantId={row.tenantId}
                            label={t("switch")}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <p className="mt-3 text-xs text-fg-subtle">
        {t("footnote", { user: ctx.userName })}
      </p>
    </>
  );
}

/** Dikkat çekenler tek hücrede: üç ayrı sütun tabloyu okunmaz yapıyordu. */
function Attention({
  row,
  t,
}: {
  row: {
    openRequestCount: number;
    slaBreachedCount: number;
    overdueMaintenanceCount: number;
  };
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const flags: { tone: "danger" | "warning" | "neutral"; text: string }[] = [];

  if (row.slaBreachedCount > 0) {
    flags.push({ tone: "danger", text: t("slaBreached", { count: row.slaBreachedCount }) });
  }
  if (row.overdueMaintenanceCount > 0) {
    flags.push({
      tone: "danger",
      text: t("overdueMaintenance", { count: row.overdueMaintenanceCount }),
    });
  }
  if (row.openRequestCount > 0) {
    flags.push({ tone: "neutral", text: t("openRequests", { count: row.openRequestCount }) });
  }

  if (flags.length === 0) {
    return <span className="text-sm text-fg-subtle">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((flag) => (
        <Badge key={flag.text} tone={flag.tone}>
          {flag.tone === "danger" ? (
            <AlertTriangle aria-hidden className="mr-1 inline h-3 w-3" />
          ) : null}
          {flag.text}
        </Badge>
      ))}
    </div>
  );
}

function riskScore(row: {
  collectionRate: number | null;
  overdueMinor: number;
  slaBreachedCount: number;
  overdueMaintenanceCount: number;
}): number {
  // Ağırlıklar kaba ve bilinçli olarak öyle: amaç sıralamak, puanlamak değil.
  const collection =
    row.collectionRate === null
      ? 0
      : Math.max(0, HEALTHY_COLLECTION_RATE - row.collectionRate) * 100;
  return (
    collection +
    row.slaBreachedCount * 10 +
    row.overdueMaintenanceCount * 5 +
    (row.overdueMinor > 0 ? 1 : 0)
  );
}
