import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { platformAccountList } from "@yonetim/contracts";
import {
  Badge, Card, CardBody, EmptyState, Input, Select, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { apiGet, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

/**
 * Süper-admin hesap listesi — SPEC Bölüm 18.1 #1–#4.
 *
 * NEDEN AYRI BİR EKRAN: `/yonetim` özeti platform genelinin sayılarını
 * gösteriyor ("kaç site, ne kadar MRR") ama tek bir müşteri hakkında hiçbir şey
 * söylemiyordu. Panelden beklenen işler — süre uzat, dondur, kapat, hesaba geç —
 * hepsi **bir hesabın** üzerinde çalışıyor ve o hesabı bulmanın yolu yoktu.
 *
 * SIRALAMA RİSKE GÖRE, ALFABETİK DEĞİL: sunucu en kötü abonelik durumuna ve
 * ödenmemiş bakiyeye göre sıralıyor. Alfabetik liste 200 satırda hiçbir şey
 * söylemez; buradaki tek iş "bugün kiminle ilgilenmeliyim" sorusunu ilk satırda
 * cevaplamak.
 *
 * YETKİ: `admin:tenants` — `super_admin` ve `support_agent`. Aksiyonların her
 * biri ayrıca kendi iznini istiyor, yani destek personeli listeyi görüyor ama
 * hesaba geçemiyor.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.platformAccounts");
  return { title: t("title"), robots: { index: false } };
}

const STATUS_FILTERS = [
  "all",
  "trial",
  "active",
  "past_due",
  "suspended",
  "archived",
] as const;

export default async function PlatformAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; durum?: string }>;
}) {
  await requirePermission("admin:tenants");
  const params = await searchParams;
  const t = await getTranslations("app.platformAccounts");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const query = toQuery({ q: params.q, durum: params.durum });
  const data = await apiGet(
    `/v1/panel/platform/accounts${query ? `?${query}` : ""}`,
    platformAccountList,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-fg">{t("title")}</h1>
          <p className="text-sm text-fg-subtle">{t("description")}</p>
        </div>
        <Link href="/yonetim" className="text-sm underline hover:no-underline">
          {t("backToOverview")}
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label={t("totalAccounts")} value={String(data.totals.accounts)} />
        <Stat label={t("totalSites")} value={String(data.totals.sites)} />
        <Stat label={t("totalUnits")} value={String(data.totals.units)} />
        <Stat
          label={t("payingSites")}
          value={String(data.totals.payingAccounts)}
          tone="success"
          hint={t("trialSites", { count: data.totals.trialAccounts })}
        />
        <Stat
          label={t("outstanding")}
          value={f.money(data.totals.outstandingMinor)}
          tone={data.totals.outstandingMinor > 0 ? "warning" : "success"}
        />
      </div>

      {/*
        Filtre `<form method="get">`: durum URL'de kalıyor, yani destek
        personeli "ödemesi gecikenler" görünümünü paylaşabiliyor ve geri
        düğmesi çalışıyor. JS'e bağlı bir filtre bu ikisini de kaybettirirdi.
      */}
      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="flex-1 min-w-48 text-sm">
              <span className="mb-1 block font-medium text-fg">{t("searchLabel")}</span>
              <Input name="q" defaultValue={params.q ?? ""} placeholder={t("searchHint")} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-fg">{t("statusLabel")}</span>
              <Select name="durum" defaultValue={params.durum ?? "all"}>
                {STATUS_FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {value === "all" ? t("statusAll") : tEnum(`tenantStatus.${value}`)}
                  </option>
                ))}
              </Select>
            </label>
            <button className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg hover:bg-hover">
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
                    <th scope="col" className={tc.th}>{t("col.account")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("col.sites")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("col.units")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("col.users")}</th>
                    <th scope="col" className={tc.th}>{t("col.subscription")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("col.yearly")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("col.outstanding")}</th>
                    <th scope="col" className={tc.th}>{t("col.nextPeriod")}</th>
                    <th scope="col" className={tc.th}>
                      <span className="sr-only">{t("col.action")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.key} className={tc.tr}>
                      <td className={tc.td}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-fg">{row.name}</span>
                          <Badge tone={row.kind === "company" ? "info" : "neutral"}>
                            {t(`kind.${row.kind}`)}
                          </Badge>
                          {row.addonCount > 0 ? (
                            <Badge tone="neutral">
                              {t("addonBadge", { count: row.addonCount })}
                            </Badge>
                          ) : null}
                        </div>
                        <span className="text-xs text-fg-subtle">
                          {row.contactEmail ?? row.contactName ?? "—"}
                        </span>
                      </td>
                      <td className={tc.tdNum}>
                        {row.siteCount}
                        {row.archivedSiteCount > 0 ? (
                          <span className="ml-1 text-xs text-fg-subtle">
                            ({t("archivedShort", { count: row.archivedSiteCount })})
                          </span>
                        ) : null}
                      </td>
                      <td className={tc.tdNum}>{row.unitCount}</td>
                      <td className={tc.tdNum}>{row.userCount}</td>
                      <td className={tc.td}>
                        {row.worstSubscriptionStatus ? (
                          <Badge tone={subscriptionTone(row.worstSubscriptionStatus)}>
                            {tEnum(`subscriptionStatus.${row.worstSubscriptionStatus}`)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-fg-subtle">{t("noSubscription")}</span>
                        )}
                        {row.overdueInvoiceCount > 0 ? (
                          <div className="mt-1 text-xs font-semibold text-danger-fg">
                            {t("overdueInvoices", { count: row.overdueInvoiceCount })}
                          </div>
                        ) : null}
                      </td>
                      <td className={tc.tdNum}>{f.money(row.yearlyPriceMinor)}</td>
                      <td className={tc.tdNum}>
                        <span className={row.outstandingMinor > 0 ? "text-danger-fg" : ""}>
                          {f.money(row.outstandingMinor)}
                        </span>
                      </td>
                      <td className={tc.tdMuted}>
                        {row.nextPeriodEndAt
                          ? f.date(row.nextPeriodEndAt)
                          : row.trialEndsAt
                            ? t("trialUntil", { date: f.date(row.trialEndsAt) })
                            : "—"}
                      </td>
                      <td className={tc.td}>
                        <Link
                          href={`/yonetim/hesaplar/${encodeURIComponent(row.key)}`}
                          className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg hover:bg-hover"
                        >
                          {t("manage")}
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

/**
 * Durum → renk. Tek yerde, çünkü aynı eşleme detay ekranında da kullanılıyor
 * ve iki yerde ayrışırsa aynı hesap iki sayfada iki farklı aciliyet gösterir.
 */
function subscriptionTone(
  status: string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "trialing":
      return "info";
    case "past_due":
    case "grace":
      return "warning";
    case "suspended":
      return "danger";
    default:
      return "neutral";
  }
}
