import { AlertTriangle, Bell, Plus } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { portfolioFinance, portfolioPeople, portfolioResponse } from "@yonetim/contracts";
import { HEALTHY_COLLECTION_RATE } from "@yonetim/dues";
import {
  Badge, Card, CardBody, CardHeader, EmptyState, Input, Stat, tableClasses as tc,
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

export default async function PortfolioPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireContext();
  const query = ((await searchParams).ara ?? "").trim().slice(0, 60);
  const t = await getTranslations("app.portfolio");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const [{ totals, rows }, finance, people] = await Promise.all([
    apiGet("/v1/panel/portfolio", portfolioResponse),
    apiGet("/v1/panel/portfolio/finance", portfolioFinance).catch(() => ({ rows: [] })),
    query.length >= 2
      ? apiGet(`/v1/panel/portfolio/people?q=${encodeURIComponent(query)}`, portfolioPeople).catch(() => null)
      : Promise.resolve(null),
  ]);
  const money = new Map(finance.rows.map((r) => [r.tenantId, r]));
  const cashTotal = finance.rows.reduce((s, r) => s + r.cashMinor + r.bankMinor, 0);
  const payableTotal = finance.rows.reduce((s, r) => s + r.payableMinor, 0);

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
          !ctx.tenantIsDemo && ctx.roles.some((r) => r === "manager" || r === "company_admin") ? (
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

      {finance.rows.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4">
          <Stat label={t("cashTotal")} value={f.money(cashTotal)} />
          <Stat label={t("payableTotal")} value={f.money(payableTotal)} tone={payableTotal > 0 ? "warning" : "success"} />
        </div>
      ) : null}

      <Card className="mt-4">
        <CardHeader title={t("peopleTitle")} description={t("peopleHint")} />
        <CardBody className={people ? "border-b border-border" : undefined}>
          <form method="get" role="search" className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-fg-subtle">
              {t("peopleSearch")}
              <Input name="ara" defaultValue={query} minLength={2} maxLength={60} placeholder={t("peoplePlaceholder")} className="mt-0.5 h-9 w-64" />
            </label>
            <button type="submit" className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover">
              {t("peopleSubmit")}
            </button>
          </form>
        </CardBody>
        {people ? (
          <CardBody className="p-0">
            {people.rows.length === 0 ? (
              <p className="p-6 text-sm text-fg-subtle">{t("peopleEmpty")}</p>
            ) : (
              <div className={tc.wrapper}>
                <table className={tc.table}>
                  <thead className={tc.thead}>
                    <tr>
                      <th className={tc.th}>{t("col.person")}</th>
                      <th className={tc.th}>{t("col.property")}</th>
                      <th className={tc.th}>{t("col.unitsOf")}</th>
                      <th className={`${tc.th} text-right`}>{t("col.balance")}</th>
                      <th className={tc.th}>
                        <span className="sr-only">{t("col.action")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.rows.map((p) => {
                      const current = p.tenantId === ctx.tenantId;
                      return (
                        <tr key={`${p.tenantId}:${p.userId}`} className={tc.tr}>
                          <td className={tc.td}>
                            <span className="font-medium text-fg">{p.name}</span>
                            <span className="block text-xs text-fg-subtle">
                              {[p.roles.map((r) => tEnum(`role.${r}`)).join(", "), p.phone].filter(Boolean).join(" · ")}
                            </span>
                          </td>
                          <td className={tc.td}>{p.siteName}</td>
                          <td className={tc.tdMuted}>{p.units.join(", ") || "—"}</td>
                          <td className={tc.tdNum}>
                            <span className={p.outstandingMinor > 0 ? "text-danger-fg" : ""}>{f.money(p.outstandingMinor)}</span>
                          </td>
                          <td className={tc.td}>
                            {current ? (
                              <Link href={`/panel/sakinler/${p.userId}`} className="text-sm font-semibold text-primary hover:underline">
                                {t("openCard")}
                              </Link>
                            ) : (
                              <SwitchTenantButton tenantId={p.tenantId} label={t("switchOpen")} next={`/panel/sakinler/${p.userId}`} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {people.truncated ? <p className="p-3 text-xs text-fg-subtle">{t("peopleTruncated")}</p> : null}
              </div>
            )}
          </CardBody>
        ) : null}
      </Card>

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
                    <th className={`${tc.th} text-right`}>{t("col.cash")}</th>
                    <th className={`${tc.th} text-right`}>{t("col.payable")}</th>
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
                      <td className={tc.tdNum}>
                        {money.get(row.tenantId) ? (
                          f.money(money.get(row.tenantId)!.cashMinor + money.get(row.tenantId)!.bankMinor)
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className={tc.tdNum}>
                        {money.get(row.tenantId) ? (
                          f.money(money.get(row.tenantId)!.payableMinor)
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
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

/**
 * Dikkat çekenler tek hücrede: üç ayrı sütun tabloyu okunmaz yapıyordu.
 * Okunmamış bildirimler de burada — bildirim siteye özel ve zil yalnız
 * bakılan sitenin bildirimini gösteriyor; yönetici genel durumu buradan görür.
 * Son bildirimin başlığı rozetin üzerine gelince okunur.
 */
function Attention({
  row,
  t,
}: {
  row: {
    openRequestCount: number;
    slaBreachedCount: number;
    overdueMaintenanceCount: number;
    unreadNotificationCount: number;
    latestNotificationTitle: string | null;
  };
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const flags: {
    tone: "danger" | "warning" | "neutral";
    text: string;
    title?: string;
    bell?: boolean;
  }[] = [];

  if (row.slaBreachedCount > 0) {
    flags.push({ tone: "danger", text: t("slaBreached", { count: row.slaBreachedCount }) });
  }
  if (row.overdueMaintenanceCount > 0) {
    flags.push({
      tone: "danger",
      text: t("overdueMaintenance", { count: row.overdueMaintenanceCount }),
    });
  }
  if (row.unreadNotificationCount > 0) {
    flags.push({
      tone: "warning",
      bell: true,
      text: t("unreadNotifications", { count: row.unreadNotificationCount }),
      title: row.latestNotificationTitle
        ? t("latestNotification", { title: row.latestNotificationTitle })
        : undefined,
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
        <span key={flag.text} title={flag.title}>
          <Badge tone={flag.tone}>
            {flag.bell ? (
              <Bell aria-hidden className="mr-1 inline h-3 w-3" />
            ) : flag.tone === "danger" ? (
              <AlertTriangle aria-hidden className="mr-1 inline h-3 w-3" />
            ) : null}
            {flag.text}
          </Badge>
        </span>
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
