import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { platformDemoList, type DemoStatus } from "@yonetim/contracts";
import { Badge, Card, CardBody, EmptyState, Stat, tableClasses as tc } from "@yonetim/ui";

import { apiGet } from "@/lib/api/server";
import { requireContext } from "@/lib/context";
import { formatters } from "@/lib/format";

import { PurgeDemoForm } from "./purge-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.platformDemo");
  return { title: t("title"), robots: { index: false } };
}

const STATUS_TONE: Record<DemoStatus, "success" | "info" | "warning" | "danger" | "neutral"> = {
  pending: "info",
  provisioning: "info",
  ready: "success",
  failed: "danger",
  purged: "neutral",
  cancelled: "neutral",
};

/**
 * Platform → demo talepleri.
 *
 * Talep satırı demo silindikten sonra da kalıyor (iletişim bilgisi satış
 * takibi için); "Gerçek hesaba geçen" sayısı, talep e-postasıyla sonradan
 * açılmış gerçek bir hesap olup olmadığına bakıyor.
 */
export default async function PlatformDemoPage() {
  const ctx = await requireContext();
  if (!ctx.roles.includes("super_admin")) redirect("/yonetim");

  const t = await getTranslations("app.platformDemo");
  const tShell = await getTranslations("app.shell");
  const f = await formatters();
  const data = await apiGet("/v1/panel/platform/demo-requests", platformDemoList);

  const remaining = (until: Date) => {
    const minutes = Math.max(0, Math.floor((until.getTime() - Date.now()) / 60_000));
    const h = Math.floor(minutes / 60);
    const hl = tShell("demoHours");
    const ml = tShell("demoMinutes");
    return t("remaining", { time: h > 0 ? `${h} ${hl} ${minutes % 60} ${ml}` : `${minutes} ${ml}` });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      <header>
        <h1 className="font-heading text-2xl font-extrabold text-fg">{t("title")}</h1>
        <p className="text-sm text-fg-subtle">{t("subtitle")}</p>
        <p className="mt-1 text-xs text-fg-subtle">
          {t("limits", { maxLive: data.limits.maxLive, perIp: data.limits.perIpPerDay, ttl: data.limits.ttlHours })}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t("totals.live")} value={String(data.totals.live)} tone="success" />
        <Stat label={t("totals.pending")} value={String(data.totals.pending)} />
        <Stat label={t("totals.last7")} value={String(data.totals.last7Days)} />
        <Stat label={t("totals.converted")} value={String(data.totals.converted)} />
      </div>

      <Card>
        <CardBody className="p-0">
          {data.rows.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t("empty")} description={t("subtitle")} />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th className={tc.th}>{t("col.person")}</th>
                    <th className={tc.th}>{t("col.contact")}</th>
                    <th className={tc.th}>{t("col.kind")}</th>
                    <th className={tc.th}>{t("col.status")}</th>
                    <th className={tc.th}>{t("col.created")}</th>
                    <th className={tc.th}>{t("col.expires")}</th>
                    <th className={tc.th}>{t("col.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id} className={tc.tr}>
                      <td className={tc.td}>
                        <div className="font-medium text-fg">{row.fullName}</div>
                        <div className="font-mono text-xs text-fg-subtle">demo-{row.code}</div>
                      </td>
                      <td className={tc.td}>
                        <div className="break-all text-fg">{row.email}</div>
                        <div className="text-xs text-fg-subtle">{row.phone}</div>
                        {row.ip ? <div className="text-xs text-fg-subtle">IP {row.ip}</div> : null}
                      </td>
                      <td className={tc.td}>
                        <div>{t(`kind.${row.kind}`)}</div>
                        {row.siteCount > 0 ? (
                          <div className="text-xs text-fg-subtle">{t("sites", { count: row.siteCount })}</div>
                        ) : null}
                      </td>
                      <td className={tc.td}>
                        <Badge tone={STATUS_TONE[row.status]}>{t(`status.${row.status}`)}</Badge>
                        {row.error ? <div className="mt-1 text-xs text-danger-fg">{row.error}</div> : null}
                      </td>
                      <td className={tc.td}>
                        <div className="whitespace-nowrap">{f.dateTime(row.createdAt)}</div>
                      </td>
                      <td className={tc.td}>
                        {row.status === "ready" && row.expiresAt ? (
                          <>
                            <div className="whitespace-nowrap">{f.dateTime(row.expiresAt)}</div>
                            <div className="text-xs text-fg-subtle">{remaining(row.expiresAt)}</div>
                          </>
                        ) : row.purgedAt ? (
                          <div className="whitespace-nowrap text-fg-subtle">{f.dateTime(row.purgedAt)}</div>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className={tc.td}>
                        {row.status === "ready" || row.status === "failed" || row.status === "pending" ? (
                          <PurgeDemoForm id={row.id} code={row.code} />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
