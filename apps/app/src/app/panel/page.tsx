import { Layers, Megaphone, Plus, Receipt } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { siteConfig } from "@yonetim/config";
import { HEALTHY_COLLECTION_RATE } from "@yonetim/dues";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  KpiCard,
  pageActionClasses,
} from "@yonetim/ui";

import { dashboardResponse } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { audienceOf } from "@/components/shell/nav";
import { apiGet } from "@/lib/api/server";
import { requireContext } from "@/lib/context";
import { formatters } from "@/lib/format";
import { DashboardCharts } from "./dashboard-charts";
import { ResidentHome } from "./resident-home";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireContext();

  /**
   * `/panel` ortak adres, ekran role göre ayrışıyor.
   *
   * Öncesinde sakin buraya girdiğinde hata sayfası görüyordu: aşağıdaki
   * `/v1/panel/dashboard` çağrısı `report:read` istiyor ve sakinde yok.
   * Sakini `/giris`e atmak da doğru değildi — oturumu geçerliydi, yalnız
   * ekranı yanlıştı.
   */
  if (audienceOf(ctx.roles) === "resident") return <ResidentHome />;
  // MIMARI-PLAN §9a — bir ekran, bir çağrı: özet, grafikler ve aktivite akışı
  // tek yanıtta geliyor. A4 öncesi bu sayfa üç ayrı sorgu fonksiyonu
  // çağırıyordu; HTTP'ye çevrilince üç gidiş-dönüş olurdu.
  const { summary, charts } = await apiGet(
    "/v1/panel/dashboard",
    dashboardResponse,
  );
  const t = await getTranslations("app.dashboard");
  const tCommon = await getTranslations("common");
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

  const net = summary.collectedThisMonthMinor - summary.expenseThisMonthMinor;

  /**
   * Tahsilatın bir önceki aya göre değişimi.
   *
   * Önceki ay sıfırsa oran tanımsız (∞) — rozet hiç gösterilmiyor. "%∞ artış"
   * yazmak teknik olarak doğru, bilgi olarak değersiz.
   */
  const collectedSeries = charts?.monthly.collectedMinor ?? [];
  const currentCollected = collectedSeries[collectedSeries.length - 1] ?? 0;
  const previousCollected = collectedSeries[collectedSeries.length - 2] ?? 0;
  const collectedDelta =
    previousCollected > 0
      ? {
          ratio: (currentCollected - previousCollected) / previousCollected,
          formatted: f.percent(
            Math.abs((currentCollected - previousCollected) / previousCollected),
            1,
          ),
          label: t("deltaPrevMonth"),
        }
      : undefined;

  // Hızlı işlemler yalnız yetkili olanlar için (GAP 4.3.4).
  const quickActions = [
    {
      href: "/panel/borclar/toplu",
      label: t("quickBulkDebt"),
      permission: "debt:write" as const,
      icon: <Layers aria-hidden className="h-4 w-4" />,
      primary: true,
    },
    {
      href: "/panel/giderler/yeni",
      label: t("quickNewExpense"),
      permission: "expense:write" as const,
      icon: <Receipt aria-hidden className="h-4 w-4" />,
    },
    {
      href: "/panel/duyurular",
      label: t("quickNewAnnouncement"),
      permission: "announcement:write" as const,
      icon: <Megaphone aria-hidden className="h-4 w-4" />,
    },
    {
      href: "/panel/birimler/yeni",
      label: t("quickNewUnit"),
      permission: "unit:write" as const,
      icon: <Plus aria-hidden className="h-4 w-4" />,
    },
  ].filter((action) => hasPermission(ctx.roles, action.permission));

  return (
    <>
      <PageHeader
        title={t("greeting", { property: ctx.tenantName })}
        description={t("description")}
        action={quickActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={
              action.primary ? pageActionClasses.primary : pageActionClasses.secondary
            }
          >
            {action.icon}
            {action.label}
          </Link>
        ))}
      />

      {ctx.tenantStatus === "trial" ? (
        <div className="mb-6">
          <Alert tone="info" title={t("trialTitle")}>
            {t("trialBody", {
              months: siteConfig.billing.trial.dataRetentionMonthsAfterTrial,
            })}
          </Alert>
        </div>
      ) : null}

      {/*
       * KPI şeridi: dört kart, ikisi gömülü trendle.
       *
       * Trend yalnız seri **varsa** çiziliyor; `charts` boş sitelerde `null`
       * dönüyor ve o durumda kart sade sayıya düşüyor. Delta son iki ayın
       * karşılaştırması — `KpiCard` yönün iyi mi kötü mü olduğunu bilmiyor,
       * `positiveIsGood` ile söylüyoruz (tahsilatta artış iyi, borçta kötü).
       */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          label={t("totalReceivable")}
          value={f.money(summary.totalDebtMinor)}
          hint={ctx.tenantName}
          tone={summary.totalDebtMinor > 0 ? "warning" : "success"}
          href="/panel/borclar"
          linkComponent={Link}
        />
        <KpiCard
          label={t("overdueReceivable")}
          value={f.money(summary.overdueDebtMinor)}
          hint={t("overdueHint")}
          tone={summary.overdueDebtMinor > 0 ? "danger" : "success"}
          href="/panel/borclar?durum=gecikmis"
          linkComponent={Link}
        />
        <KpiCard
          label={t("collectedThisMonth")}
          value={f.money(summary.collectedThisMonthMinor)}
          hint={t("accruedHint", { amount: f.money(summary.accruedThisMonthMinor) })}
          delta={collectedDelta}
          trend={
            charts
              ? { values: charts.monthly.collectedMinor, label: t("chartCollected") }
              : undefined
          }
        />
        <KpiCard
          label={t("collectionRate")}
          value={f.percent(summary.collectionRate)}
          tone={summary.collectionRate >= HEALTHY_COLLECTION_RATE ? "success" : "warning"}
          hint={t("chartTargetLabel") + " " + f.percent(HEALTHY_COLLECTION_RATE)}
          trend={
            charts
              ? { values: charts.monthly.collectionRatePct, label: t("collectionRate") }
              : undefined
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title={t("operations")}
            description={t("operationsDescription")}
          />
          <CardBody className="space-y-3 text-sm">
            <Row
              label={t("openRequests")}
              value={String(summary.openRequests)}
              href="/panel/talepler"
            />
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
          <CardHeader
            title={t("expenseThisMonth")}
            description={t("expenseThisMonthDescription")}
          />
          <CardBody>
            <div className="text-2xl font-bold tabular-nums text-fg">
              {f.money(summary.expenseThisMonthMinor)}
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              {t("collectionExpenseGap")}{" "}
              <strong
                className={net >= 0 ? "text-success-fg" : "text-danger-fg"}
              >
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
                <div className="font-medium text-fg">
                  {summary.lastAnnouncement.title}
                </div>
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

      {charts ? (
        <div className="mt-5">
          <DashboardCharts
            monthly={{
              periods: charts.monthly.periods,
              periodLabels: charts.monthly.periods.map((period) =>
                f.period(period),
              ),
              accruedKurus: charts.monthly.accruedMinor,
              collectedKurus: charts.monthly.collectedMinor,
              expenseKurus: charts.monthly.expenseMinor,
              collectionRatePct: charts.monthly.collectionRatePct,
            }}
            aging={charts.aging}
            forecast={{
              periodLabels: charts.forecast.periods.map((period) =>
                f.period(period),
              ),
              netKurus: charts.forecast.netMinor,
              forecastFrom: charts.forecast.forecastFrom,
              assumedCollectionRate: charts.forecast.assumedCollectionRate,
            }}
            collectionSplit={{
              paidKurus: charts.collectionSplit.paidMinor,
              openKurus: charts.collectionSplit.openMinor,
              overdueKurus: charts.collectionSplit.overdueMinor,
            }}
            collectionTarget={HEALTHY_COLLECTION_RATE}
            labels={{
              incomeExpenseTitle: t("chartIncomeExpense"),
              incomeExpenseHint: t("chartIncomeExpenseHint"),
              accrued: t("chartAccrued"),
              collected: t("chartCollected"),
              outstanding: t("chartOutstanding"),
              expense: t("chartExpense"),
              mixTitle: t("chartMix"),
              mixHint: t("chartMixHint"),
              rate: t("collectionRate"),
              rateTitle: t("chartCollectionRate"),
              rateHint: t("chartCollectionRateHint"),
              targetTitle: t("chartTarget"),
              targetHint: t("chartTargetHint"),
              target: t("chartTargetLabel"),
              aboveTarget: t("chartAboveTarget"),
              belowTarget: t("chartBelowTarget"),
              flowTitle: t("chartFlow"),
              flowHint: t("chartFlowHint"),
              step: t("chartStep"),
              agingTitle: t("chartAging"),
              agingHint: t("chartAgingHint"),
              agingBuckets: {
                d0: t("aging.d0"),
                d30: t("aging.d30"),
                d60: t("aging.d60"),
                d90: t("aging.d90"),
                d180: t("aging.d180"),
              },
              overdueAmount: t("overdueReceivable"),
              forecastTitle: t("chartForecast"),
              forecastHint: t("chartForecastHint", {
                rate: f.percent(charts.forecast.assumedCollectionRate),
              }),
              net: t("chartNet"),
              forecastNote: t("chartForecastNote"),
              splitTitle: t("chartSplit"),
              splitHint: t("chartSplitHint"),
              paid: t("splitPaid"),
              open: t("splitOpen"),
              overdue: t("splitOverdue"),
              month: t("chartMonth"),
              bucket: t("chartBucket"),
              asTable: tCommon("a11y.chartAsTable"),
              asChart: tCommon("a11y.chartAsChart"),
              empty: tCommon("state.empty"),
              totalLabel: t("chartTotal"),
            }}
          />
        </div>
      ) : null}
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
    <Link
      href={href}
      className="flex items-center justify-between hover:underline"
    >
      <span className="text-fg-muted">{label}</span>
      <span
        className={`font-semibold tabular-nums ${danger ? "text-danger-fg" : "text-fg"}`}
      >
        {value}
      </span>
    </Link>
  );
}
