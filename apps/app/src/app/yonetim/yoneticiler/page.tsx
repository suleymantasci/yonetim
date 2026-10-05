import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { platformManagerList } from "@yonetim/contracts";
import {
  Badge, Card, CardBody, EmptyState, Input, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { apiGet, toQuery } from "@/lib/api/server";
import { formatters } from "@/lib/format";

import { daysUntil, RemainingBadge } from "../remaining";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.platformManagers");
  return { title: t("title"), robots: { index: false } };
}

/**
 * Platform → yöneticiler.
 *
 * Sorulan soru "kim, hangi sitede, hangi paketle, ne kadar süresi kaldı ve
 * sistemi kullanıyor mu". Sıralama sunucuda: süresi en yakın biten üstte —
 * takip edilmesi gereken satır her zaman ilk ekranda.
 */
export default async function PlatformManagersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("app.platformManagers");
  const tAcc = await getTranslations("app.platformAccounts");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const data = await apiGet(
    `/v1/panel/platform/managers?${toQuery({ q: params.q, limit: "200" })}`,
    platformManagerList,
  );

  const remainingLabels = {
    daysLeft: (days: number) => tAcc("daysLeft", { days }),
    daysOverdue: (days: number) => tAcc("daysOverdue", { days }),
    endsToday: tAcc("endsToday"),
    none: "—",
  };

  const deadline = (row: (typeof data.rows)[number]) => row.periodEndAt ?? row.trialEndsAt;
  const expiringSoon = data.rows.filter((row) => {
    const d = daysUntil(deadline(row));
    return d !== null && d >= 0 && d <= 7;
  }).length;
  const expired = data.rows.filter((row) => {
    const d = daysUntil(deadline(row));
    return d !== null && d < 0;
  }).length;
  const neverActive = data.rows.filter((row) => !row.lastLoginAt).length;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      <header>
        <h1 className="font-heading text-2xl font-extrabold text-fg">{t("title")}</h1>
        <p className="text-sm text-fg-subtle">{t("description")}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t("totalManagers")} value={String(data.total)} />
        <Stat
          label={t("expiringSoon")}
          value={String(expiringSoon)}
          tone={expiringSoon > 0 ? "warning" : "neutral"}
        />
        <Stat label={t("expired")} value={String(expired)} tone={expired > 0 ? "danger" : "neutral"} />
        <Stat label={t("neverActive")} value={String(neverActive)} />
      </div>

      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="min-w-48 flex-1 text-sm">
              <span className="mb-1 block font-medium text-fg">{t("searchLabel")}</span>
              <Input name="q" defaultValue={params.q ?? ""} placeholder={t("searchHint")} />
            </label>
            <button className="h-10 rounded-lg border border-border-strong px-4 text-sm font-medium text-fg hover:bg-hover">
              {t("filter")}
            </button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {data.rows.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("col.manager")}</th>
                    <th scope="col" className={tc.th}>{t("col.site")}</th>
                    <th scope="col" className={tc.th}>{t("col.plan")}</th>
                    <th scope="col" className={tc.th}>{t("col.status")}</th>
                    <th scope="col" className={tc.th}>{t("col.remaining")}</th>
                    <th scope="col" className={tc.th}>{t("col.lastLogin")}</th>
                    <th scope="col" className={tc.th}>
                      <span className="sr-only">{t("col.action")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={`${row.userId}:${row.tenantId}`} className={tc.tr}>
                      <td className={tc.td}>
                        <div className="font-medium text-fg">{row.name}</div>
                        <div className="text-xs text-fg-subtle">
                          {[row.email, row.phone].filter(Boolean).join(" · ") || "—"}
                        </div>
                        <div className="mt-0.5 text-xs text-fg-subtle">{tEnum(`role.${row.role}`)}</div>
                      </td>
                      <td className={tc.td}>
                        <div className="text-fg">{row.tenantName}</div>
                        <div className="text-xs text-fg-subtle">
                          {row.unitCount} · {tEnum(`tenantStatus.${row.tenantStatus}`)}
                        </div>
                      </td>
                      <td className={tc.td}>
                        {row.planName ?? <span className="text-xs text-fg-subtle">{tAcc("noPlan")}</span>}
                      </td>
                      <td className={tc.td}>
                        {row.subscriptionStatus ? (
                          <Badge tone={row.subscriptionStatus === "active" ? "success" : row.subscriptionStatus === "trialing" ? "info" : "warning"}>
                            {tEnum(`subscriptionStatus.${row.subscriptionStatus}`)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-fg-subtle">{tAcc("noSubscription")}</span>
                        )}
                      </td>
                      <td className={tc.td}>
                        <RemainingBadge until={deadline(row)} labels={remainingLabels} />
                        {deadline(row) ? (
                          <div className="mt-1 text-xs text-fg-subtle">{f.date(deadline(row)!)}</div>
                        ) : null}
                      </td>
                      <td className={tc.tdMuted}>
                        {row.lastLoginAt ? f.dateTime(row.lastLoginAt) : t("neverLoggedIn")}
                      </td>
                      <td className={tc.td}>
                        <Link
                          href={`/yonetim/hesaplar/${encodeURIComponent(row.accountKey)}`}
                          className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm text-fg hover:bg-hover"
                        >
                          {t("openAccount")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-fg-subtle">
        {t("footnote", { shown: data.rows.length, total: data.total })}
      </p>
    </div>
  );
}
