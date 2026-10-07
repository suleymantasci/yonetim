import { Layers, Plus } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import {
  DEBT_KINDS,
  DEBT_SORT_KEYS,
  RISK_THRESHOLDS_MINOR,
  TREND_MONTHS,
  debtListResponse,
  unitDebtSummary,
} from "@yonetim/contracts";
import { siteConfig } from "@yonetim/config";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Pagination,
  Stat,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { NavTabs } from "@/components/nav-tabs";
import { ListControls } from "@/components/list/list-controls";
import { toListQuery } from "@/lib/api/list";
import { apiGet, toQuery } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import {
  buildListHref,
  pageRange,
  parseListParams,
  type SearchParamsInput,
} from "@/lib/list-params";
import { DebtsTable, type DebtRowView } from "./debts-table";
import { UnitTrendCell } from "./unit-trend-cell";

export const dynamic = "force-dynamic";

/**
 * Borçlar ekranı — GAP 4.1.3.
 *
 * İki görünüm tek sayfada: **borç listesi** (varsayılan, satır = borç) ve
 * **daire özeti** (satır = daire, mevcut ekran). İkisi ayrı sayfa olsaydı
 * yönetici hangisinde olduğunu takip etmek zorunda kalırdı; sekme yeterli.
 */
export default async function DebtsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  // Bağlayıcı yetki kararı API'de (`@RequirePermission`); buradaki erken
  // kontrol yetkisiz kullanıcıya doğru hata sayfasını göstermek için.
  const ctx = await requirePermission("debt:read");
  const t = await getTranslations("app.debts");
  const tUnits = await getTranslations("app.units");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const fmt = await formatters();

  const query = await searchParams;
  const rawView = Array.isArray(query.gorunum)
    ? query.gorunum[0]
    : query.gorunum;
  const view = rawView === "daire" ? "daire" : "borc";

  const params = parseListParams(query, {
    sortableKeys: DEBT_SORT_KEYS,
    defaultSort: "dueDate",
    defaultDirection: "desc",
    filterKeys: ["blok", "donem", "tur", "durum", "risk"],
  });

  // Eşik URL'de **kuruş** taşınıyor (₺ değil): `toListQuery` değeri olduğu gibi
  // uca geçiriyor ve uç kuruş bekliyor. Ekranda ₺'ye çeviren tek yer aşağıdaki
  // filtre etiketi.
  const riskThreshold = RISK_THRESHOLDS_MINOR.find(
    (value) => String(value) === params.filters.risk,
  );

  const data = await apiGet(
    `/v1/panel/debts?${toListQuery(params, {
      blockId: params.filters.blok,
      period: params.filters.donem,
      kind: params.filters.tur,
      status: params.filters.durum,
      minOutstanding: riskThreshold,
    })}`,
    debtListResponse,
  );
  const { from, to, pageCount } = pageRange(params, data.meta.total);

  const tabs = (
    <NavTabs
      activeKey={view}
      label={t("viewTabs")}
      items={[
        { key: "borc", label: t("viewDebts"), href: "/panel/borclar" },
        {
          key: "daire",
          label: t("viewUnits"),
          href: "/panel/borclar?gorunum=daire",
        },
      ]}
    />
  );

  const header = (
    <PageHeader
      title={t("title")}
      description={t("description")}
      action={
        <>
          <Link
            href="/panel/borclar/toplu"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
          >
            <Layers aria-hidden className="h-4 w-4" />
            {t("bulkWizard")}
          </Link>
          <Link
            href="/panel/borclar/yeni"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            <Plus aria-hidden className="h-4 w-4" />
            {t("newDebt")}
          </Link>
        </>
      }
    />
  );

  const stats = (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label={t("statOutstanding")}
        value={fmt.money(data.totals.outstandingMinor)}
        tone={data.totals.outstandingMinor > 0 ? "danger" : "success"}
      />
      <Stat
        label={t("statOverdue")}
        value={fmt.money(data.totals.overdueMinor)}
        tone={data.totals.overdueMinor > 0 ? "danger" : "neutral"}
      />
      <Stat
        label={t("statLateFee")}
        value={fmt.money(data.totals.lateFeeMinor)}
      />
      <Stat
        label={t("statCollected")}
        value={fmt.money(data.totals.collectedMinor)}
      />
    </div>
  );

  if (view === "daire") {
    // Eşik iki görünümde de geçerli: sekme değiştiren yönetici aynı daralmış
    // listeyi görmeye devam etsin (sözleşmedeki `unitDebtSummaryQuery` notu).
    const { rows: unitRows } = await apiGet(
      `/v1/panel/debts/unit-summary?${toQuery({ minOutstanding: riskThreshold })}`,
      unitDebtSummary,
    );
    return (
      <>
        {header}
        {stats}
        <div className="mb-4">{tabs}</div>

        <ListControls
          searchable={false}
          filters={[
            {
              param: "risk",
              label: t("riskFilter"),
              value: params.filters.risk ?? "",
              options: [
                { value: "", label: t("allRisks") },
                ...RISK_THRESHOLDS_MINOR.map((minor) => ({
                  value: String(minor),
                  label: t("riskAtLeast", { amount: fmt.money(minor) }),
                })),
              ],
            },
          ]}
        />

        <Card>
          <CardHeader title={t("viewUnits")} description={t("unitViewHint")} />
          <CardBody className="p-0">
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 820 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>
                      {tUnits("number")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {tUnits("block")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("statOutstanding")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("statOverdue")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("openCount")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("oldestDue")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("trendHeader")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {unitRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={tc.empty}>
                        {tCommon("state.empty")}
                      </td>
                    </tr>
                  ) : (
                    unitRows.map((row) => (
                      <tr key={row.unitId} className={tc.tr}>
                        <td className={`${tc.td} font-medium`}>
                          <Link
                            href={`/panel/birimler/${row.unitId}`}
                            className="hover:underline"
                          >
                            {row.number}
                          </Link>
                        </td>
                        <td className={tc.tdMuted}>{row.blockName ?? "—"}</td>
                        <td className={tc.tdNum}>
                          {fmt.money(row.outstandingMinor)}
                        </td>
                        <td
                          className={`${tc.tdNum} ${row.overdueMinor > 0 ? "font-semibold text-danger-fg" : ""}`}
                        >
                          {fmt.money(row.overdueMinor)}
                        </td>
                        <td className={tc.tdNum}>{row.debtCount}</td>
                        <td className={tc.tdMuted}>
                          {row.oldestDue ? fmt.date(row.oldestDue) : "—"}
                        </td>
                        <td className={tc.td}>
                          <UnitTrendCell
                            values={row.trendMinor}
                            label={t("trendLabel", {
                              unit: row.number,
                              months: TREND_MONTHS,
                            })}
                            emptyLabel={t("trendFlat")}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </>
    );
  }

  const rows: DebtRowView[] = data.rows.map((row) => {
    const outstanding = row.outstandingMinor;
    const overdue = row.status !== "paid" && row.dueDate.getTime() < Date.now();
    let statusTone: DebtRowView["statusTone"] = "neutral";
    if (row.status === "paid") statusTone = "success";
    else if (overdue || row.status === "in_legal") statusTone = "danger";
    else if (row.status === "partial") statusTone = "warning";

    return {
      id: row.id,
      unitId: row.unitId,
      unitLabel: row.blockName
        ? `${row.blockName}/${row.unitNumber}`
        : row.unitNumber,
      debtorName: row.debtorName,
      description: row.description,
      kindLabel: tEnum(`debtKind.${row.kind}`),
      period: row.period ? fmt.period(row.period) : "—",
      amount: fmt.money(row.amountMinor),
      paid: fmt.money(row.paidMinor),
      outstanding: outstanding > 0 ? fmt.money(outstanding) : "—",
      hasOutstanding: outstanding > 0,
      lateFee: row.lateFeeMinor > 0 ? fmt.money(row.lateFeeMinor) : null,
      dueDate: fmt.date(row.dueDate),
      overdue,
      statusLabel: tEnum(`debtStatus.${row.status}`),
      statusTone,
      lateFeeExempt: row.lateFeeExempt,
      changeCount: row.changeCount,
      installmentLabel:
        row.installmentNo && row.installmentCount
          ? `${row.installmentNo}/${row.installmentCount}`
          : null,
    };
  });

  return (
    <>
      {header}

      <div className="mb-4">
        <Alert tone="info">
          {t("lateFeeNotice", { pct: siteConfig.dues.monthlyLateFeePct })}
        </Alert>
      </div>

      {stats}
      <div className="mb-4">{tabs}</div>

      <ListControls
        searchPlaceholder={t("searchPlaceholder")}
        filters={[
          {
            param: "blok",
            label: tUnits("block"),
            value: params.filters.blok ?? "",
            options: [
              { value: "", label: tUnits("allBlocks") },
              ...data.facets.blocks.map((block) => ({
                value: block.id,
                label: block.label,
              })),
            ],
          },
          {
            param: "donem",
            label: tUnits("period"),
            value: params.filters.donem ?? "",
            options: [
              { value: "", label: t("allPeriods") },
              ...data.facets.periods.map((period) => ({
                value: period,
                label: fmt.period(period),
              })),
            ],
          },
          {
            param: "tur",
            label: t("kind"),
            value: params.filters.tur ?? "",
            options: [
              { value: "", label: t("allKinds") },
              // Filtre **tüm** türleri listeler (`late_fee` dahil): gecikme
              // tazminatı borcu listede görünüyor, dolayısıyla aranabilmeli.
              // Elle seçilemeyen tür yalnız *formda* gizleniyor.
              ...DEBT_KINDS.map((kind) => ({
                value: kind,
                label: tEnum(`debtKind.${kind}`),
              })),
            ],
          },
          {
            param: "risk",
            label: t("riskFilter"),
            value: params.filters.risk ?? "",
            options: [
              { value: "", label: t("allRisks") },
              ...RISK_THRESHOLDS_MINOR.map((minor) => ({
                value: String(minor),
                label: t("riskAtLeast", { amount: fmt.money(minor) }),
              })),
            ],
          },
          {
            param: "durum",
            label: t("status"),
            value: params.filters.durum ?? "",
            options: [
              { value: "", label: t("allStatuses") },
              { value: "acik", label: t("filterOpen") },
              { value: "gecikmis", label: t("filterOverdue") },
              { value: "odendi", label: t("filterPaid") },
              { value: "taksit", label: t("filterInstallment") },
            ],
          },
        ]}
      />

      <Card>
        <CardBody className="p-0">
          <DebtsTable
            rows={rows}
            sort={params.sort}
            direction={params.direction}
            basePath="/panel/borclar"
            params={params}
            canForgive={can(ctx, "debt:forgive")}
            labels={{
              unit: tUnits("number"),
              debtor: t("debtor"),
              description: tUnits("debtDescription"),
              period: tUnits("period"),
              amount: tUnits("amount"),
              outstanding: t("statOutstanding"),
              dueDate: tUnits("dueDate"),
              status: t("status"),
              empty: tCommon("state.noResult"),
              cancelTitle: t("cancelTitle"),
              cancelDescription: t("cancelDescription"),
              reasonLabel: t("bulkReasonLabel"),
              reasonPlaceholder: t("bulkReasonPlaceholder"),
              exemptOn: t("exemptOn"),
              exemptOff: t("exemptOff"),
              changedTooltip: t("changedTooltip"),
              exemptTooltip: t("exemptTooltip"),
              forgive: t("forgive"),
              forgiveTitle: t("forgiveTitle"),
              forgiveDescription: t("forgiveDescription"),
              decisionLabel: t("decisionLabel"),
              decisionPlaceholder: t("decisionPlaceholder"),
            }}
          />
          <Pagination
            page={params.page}
            pageCount={pageCount}
            total={data.meta.total}
            hrefFor={(page) =>
              buildListHref("/panel/borclar", params, { sayfa: page })
            }
            labels={{
              previous: tCommon("action.previous"),
              next: tCommon("action.next"),
              summary: tCommon("state.showing", {
                from,
                to,
                total: data.meta.total,
              }),
            }}
            linkComponent={Link}
          />
        </CardBody>
      </Card>
    </>
  );
}
