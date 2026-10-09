import { FolderTree, Plus, Receipt, Repeat, Wallet } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { EXPENSE_SORT_KEYS, expenseListResponse } from "@yonetim/contracts";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Pagination,
  Stat,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ListControls } from "@/components/list/list-controls";
import { toListQuery } from "@/lib/api/list";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import {
  buildListHref,
  pageRange,
  parseListParams,
  type SearchParamsInput,
} from "@/lib/list-params";
import { CategoryBreakdown } from "./category-breakdown";
import { NoCategoriesNotice } from "./no-categories-notice";
import { ExpensesTable, type ExpenseRowView } from "./expenses-table";

export const dynamic = "force-dynamic";

const STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "paid",
  "rejected",
] as const;

export default async function ExpensesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  const ctx = await requirePermission("expense:read");
  const t = await getTranslations("app.expenses");
  const tPay = await getTranslations("app.payables");
  const tRec = await getTranslations("app.recurring");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const fmt = await formatters();

  const canApprove = hasPermission(ctx.roles, "expense:approve");
  const canWrite = hasPermission(ctx.roles, "expense:write");

  const params = parseListParams(await searchParams, {
    sortableKeys: EXPENSE_SORT_KEYS,
    defaultSort: "expenseDate",
    defaultDirection: "desc",
    filterKeys: ["kategori", "donem", "durum", "dagitim"],
  });

  const data = await apiGet(
    `/v1/panel/expenses?${toListQuery(params, {
      categoryId: params.filters.kategori,
      period: params.filters.donem,
      status: params.filters.durum,
      distribution: params.filters.dagitim,
    })}`,
    expenseListResponse,
  );
  const { from, to, pageCount } = pageRange(params, data.meta.total);

  const actions = (
    <>
      <Link
        href="/panel/giderler/odenecekler"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
      >
        <Wallet aria-hidden className="h-4 w-4" />
        {tPay("title")}
      </Link>
      <Link
        href="/panel/giderler/tekrarlayan"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
      >
        <Repeat aria-hidden className="h-4 w-4" />
        {tRec("title")}
      </Link>
      {canWrite ? (
        <Link
          href="/panel/giderler/kategoriler"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
        >
          <FolderTree aria-hidden className="h-4 w-4" />
          {t("categoriesTitle")}
        </Link>
      ) : null}
      {canWrite ? (
        <Link
          href="/panel/giderler/yeni"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
        >
          <Plus aria-hidden className="h-4 w-4" />
          {t("newExpense")}
        </Link>
      ) : null}
    </>
  );

  if (
    data.meta.total === 0 &&
    !params.query &&
    Object.keys(params.filters).length === 0
  ) {
    return (
      <>
        <PageHeader title={t("title")} action={actions} />
        <EmptyState
          icon={<Receipt aria-hidden className="h-10 w-10" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
          action={actions}
        />
      </>
    );
  }

  const rows: ExpenseRowView[] = data.rows.map((row) => {
    let statusTone: ExpenseRowView["statusTone"] = "neutral";
    if (row.status === "paid" || row.status === "approved")
      statusTone = "success";
    else if (row.status === "pending_approval") statusTone = "warning";
    else if (row.status === "rejected") statusTone = "danger";

    return {
      id: row.id,
      description: row.description,
      vendorName: row.vendorName,
      categoryName: row.categoryName,
      categoryColor: row.categoryColor,
      amount: fmt.money(row.amountMinor),
      vat: row.vatMinor > 0 ? fmt.money(row.vatMinor) : "—",
      expenseDate: fmt.date(row.expenseDate),
      statusLabel: tEnum(`expenseStatus.${row.status}`),
      statusTone,
      distributed: row.distributedAt !== null,
      hasAttachment: row.attachmentUrl !== null,
      period: row.period ? fmt.period(row.period) : "—",
    };
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={actions}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("statMonth")}
          value={fmt.money(data.totals.monthMinor)}
        />
        <Stat label={t("statYear")} value={fmt.money(data.totals.yearMinor)} />
        <Stat
          label={t("statPending")}
          value={fmt.money(data.totals.pendingMinor)}
          tone={data.totals.pendingMinor > 0 ? "warning" : "neutral"}
        />
        <Stat
          label={t("statUndistributed")}
          value={fmt.money(data.totals.undistributedMinor)}
          tone={data.totals.undistributedMinor > 0 ? "warning" : "success"}
          hint={
            data.totals.undistributedMinor > 0
              ? t("statUndistributedHint")
              : undefined
          }
        />
      </div>

      {data.facets.categories.length === 0 ? (
        <div className="mb-4">
          <NoCategoriesNotice />
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ListControls
            searchPlaceholder={t("searchPlaceholder")}
            filters={[
              {
                param: "kategori",
                label: t("category"),
                value: params.filters.kategori ?? "",
                options: [
                  { value: "", label: t("allCategories") },
                  ...data.facets.categories.map((category) => ({
                    value: category.id,
                    label:
                      category.depth > 0 ? `— ${category.name}` : category.name,
                  })),
                ],
              },
              {
                param: "durum",
                label: t("status"),
                value: params.filters.durum ?? "",
                options: [
                  { value: "", label: t("allStatuses") },
                  ...STATUSES.map((status) => ({
                    value: status,
                    label: tEnum(`expenseStatus.${status}`),
                  })),
                ],
              },
              {
                param: "dagitim",
                label: t("distributionFilter"),
                value: params.filters.dagitim ?? "",
                options: [
                  { value: "", label: t("allDistribution") },
                  { value: "bekliyor", label: t("notDistributed") },
                  { value: "yapildi", label: t("distributedOption") },
                ],
              },
            ]}
          />

          <Card>
            <CardBody className="p-0">
              <ExpensesTable
                rows={rows}
                sort={params.sort}
                direction={params.direction}
                basePath="/panel/giderler"
                params={params}
                canApprove={canApprove}
                labels={{
                  description: t("description2"),
                  category: t("category"),
                  vendor: t("vendor"),
                  amount: t("amountGross"),
                  vat: t("vatAmount"),
                  expenseDate: t("expenseDate"),
                  status: t("status"),
                  period: t("period"),
                  empty: tCommon("state.noResult"),
                  approve: tCommon("action.approve"),
                  reject: tCommon("action.reject"),
                  markPaid: t("markPaid"),
                  deleteTitle: t("deleteTitle"),
                  deleteDescription: t("deleteDescription"),
                  distributedTooltip: t("distributedTooltip"),
                  notDistributedTooltip: t("notDistributedTooltip"),
                  attachmentTooltip: t("attachmentTooltip"),
                }}
              />
              <Pagination
                page={params.page}
                pageCount={pageCount}
                total={data.meta.total}
                hrefFor={(page) =>
                  buildListHref("/panel/giderler", params, { sayfa: page })
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
        </div>

        <div>
          <Card>
            <CardHeader
              title={t("breakdownTitle")}
              description={t("breakdownHint")}
            />
            <CardBody>
              <CategoryBreakdown
                rows={data.byCategory.map((row) => ({
                  name: row.name,
                  amountKurus: row.amountMinor,
                  amountLabel: fmt.money(row.amountMinor),
                }))}
                emptyText={tCommon("state.empty")}
                shareLabel={tCommon("a11y.share")}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
