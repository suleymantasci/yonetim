import { Layers, Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import {
  Alert, Badge, Card, CardBody, CardHeader, Pagination, Stat, Tabs, tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ListControls } from "@/components/list/list-controls";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { buildListHref, pageRange, parseListParams, type SearchParamsInput } from "@/lib/list-params";
import { getUnitDebtSummary } from "@/lib/queries";
import { DEBT_SORT_KEYS, listDebts } from "@/lib/queries/debts";
import { DebtsTable, type DebtRowView } from "./debts-table";

export const dynamic = "force-dynamic";

const DEBT_KINDS = [
  "dues", "utility", "reservation", "penalty", "late_fee", "extra", "legal_cost",
] as const;

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
  const ctx = await requirePermission("debt:read");
  const t = await getTranslations("app.debts");
  const tUnits = await getTranslations("app.units");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const fmt = await formatters();

  const query = await searchParams;
  const rawView = Array.isArray(query.gorunum) ? query.gorunum[0] : query.gorunum;
  const view = rawView === "daire" ? "daire" : "borc";

  const params = parseListParams(query, {
    sortableKeys: DEBT_SORT_KEYS,
    defaultSort: "dueDate",
    defaultDirection: "desc",
    filterKeys: ["blok", "donem", "tur", "durum"],
  });

  const data = await listDebts(ctx, params);
  const { from, to, pageCount } = pageRange(params, data.total);

  const tabs = (
    <Tabs
      activeKey={view}
      linkComponent={Link as never}
      label={t("viewTabs")}
      items={[
        { key: "borc", label: t("viewDebts"), href: "/panel/borclar" },
        { key: "daire", label: t("viewUnits"), href: "/panel/borclar?gorunum=daire" },
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
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label={t("statOutstanding")}
        value={fmt.money(data.totals.outstandingKurus)}
        tone={data.totals.outstandingKurus > 0 ? "danger" : "success"}
      />
      <Stat
        label={t("statOverdue")}
        value={fmt.money(data.totals.overdueKurus)}
        tone={data.totals.overdueKurus > 0 ? "danger" : "neutral"}
      />
      <Stat label={t("statLateFee")} value={fmt.money(data.totals.lateFeeKurus)} />
      <Stat label={t("statCollected")} value={fmt.money(data.totals.collectedKurus)} />
    </div>
  );

  if (view === "daire") {
    const unitRows = await getUnitDebtSummary(ctx);
    return (
      <>
        {header}
        {stats}
        <div className="mb-4">{tabs}</div>
        <Card>
          <CardHeader title={t("viewUnits")} description={t("unitViewHint")} />
          <CardBody className="p-0">
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 720 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{tUnits("number")}</th>
                    <th scope="col" className={tc.th}>{tUnits("block")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("statOutstanding")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("statOverdue")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("openCount")}</th>
                    <th scope="col" className={tc.th}>{t("oldestDue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {unitRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={tc.empty}>
                        {tCommon("state.empty")}
                      </td>
                    </tr>
                  ) : (
                    unitRows.map((row) => (
                      <tr key={row.unit_id} className={tc.tr}>
                        <td className={`${tc.td} font-medium`}>
                          <Link href={`/panel/birimler/${row.unit_id}`} className="hover:underline">
                            {row.number}
                          </Link>
                        </td>
                        <td className={tc.tdMuted}>{row.block_name ?? "—"}</td>
                        <td className={tc.tdNum}>{fmt.money(Number(row.outstanding))}</td>
                        <td
                          className={`${tc.tdNum} ${Number(row.overdue) > 0 ? "font-semibold text-danger-fg" : ""}`}
                        >
                          {fmt.money(Number(row.overdue))}
                        </td>
                        <td className={tc.tdNum}>{row.debt_count}</td>
                        <td className={tc.tdMuted}>
                          {row.oldest_due ? fmt.date(new Date(row.oldest_due)) : "—"}
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
    const outstanding = row.outstandingKurus;
    const overdue = row.status !== "paid" && row.dueDate.getTime() < Date.now();
    let statusTone: DebtRowView["statusTone"] = "neutral";
    if (row.status === "paid") statusTone = "success";
    else if (overdue || row.status === "in_legal") statusTone = "danger";
    else if (row.status === "partial") statusTone = "warning";

    return {
      id: row.id,
      unitId: row.unitId,
      unitLabel: row.blockName ? `${row.blockName}/${row.unitNumber}` : row.unitNumber,
      debtorName: row.debtorName,
      description: row.description,
      kindLabel: tEnum(`debtKind.${row.kind}`),
      period: row.period ? fmt.period(row.period) : "—",
      amount: fmt.money(row.amountKurus),
      paid: fmt.money(row.paidKurus),
      outstanding: outstanding > 0 ? fmt.money(outstanding) : "—",
      hasOutstanding: outstanding > 0,
      lateFee: row.lateFeeKurus > 0 ? fmt.money(row.lateFeeKurus) : null,
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
              ...data.blocks.map((block) => ({ value: block.id, label: block.name })),
            ],
          },
          {
            param: "donem",
            label: tUnits("period"),
            value: params.filters.donem ?? "",
            options: [
              { value: "", label: t("allPeriods") },
              ...data.periods.map((period) => ({ value: period, label: fmt.period(period) })),
            ],
          },
          {
            param: "tur",
            label: t("kind"),
            value: params.filters.tur ?? "",
            options: [
              { value: "", label: t("allKinds") },
              ...DEBT_KINDS.map((kind) => ({ value: kind, label: tEnum(`debtKind.${kind}`) })),
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
            hrefFor={(key, direction) =>
              buildListHref("/panel/borclar", params, { sirala: key, yon: direction, sayfa: 1 })
            }
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
            }}
          />
          <Pagination
            page={params.page}
            pageCount={pageCount}
            total={data.total}
            hrefFor={(page) => buildListHref("/panel/borclar", params, { sayfa: page })}
            labels={{
              previous: tCommon("action.previous"),
              next: tCommon("action.next"),
              summary: tCommon("state.showing", { from, to, total: data.total }),
            }}
            linkComponent={Link as never}
          />
        </CardBody>
      </Card>
    </>
  );
}
