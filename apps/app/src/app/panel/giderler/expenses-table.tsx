"use client";

import { Paperclip, Split } from "lucide-react";
import Link from "@/components/link";
import { useTranslations } from "next-intl";

import { Badge, DataTable, type DataColumn } from "@yonetim/ui";

import { BulkSelection } from "@/components/list/bulk-selection";
import { buildListHref, type ListParams } from "@/lib/list-params";
import { deleteExpenses, setExpenseStatus } from "./actions";

/**
 * Gider tablosu.
 *
 * "Dağıtıldı" durumu ayrı bir sütun değil, açıklamanın yanındaki simge:
 * yöneticinin aradığı bilgi "hangi giderler henüz sakinlere yansımadı?" —
 * o yüzden dağıtılmamış giderler vurgulanır, dağıtılmışlar sakinleşir.
 *
 * Tablo iskeleti `DataTable`'da; burada yalnız gidere özgü sütunlar ve
 * onay/ödeme toplu işlemleri duruyor.
 */
export interface ExpenseRowView {
  id: string;
  description: string;
  vendorName: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  amount: string;
  vat: string;
  expenseDate: string;
  statusLabel: string;
  statusTone: "neutral" | "success" | "warning" | "danger";
  distributed: boolean;
  hasAttachment: boolean;
  period: string;
}

export function ExpensesTable({
  rows,
  sort,
  direction,
  basePath,
  params,
  canApprove,
  labels,
}: {
  rows: ExpenseRowView[];
  sort: string;
  direction: "asc" | "desc";
  basePath: string;
  params: ListParams;
  canApprove: boolean;
  labels: {
    description: string;
    category: string;
    vendor: string;
    amount: string;
    vat: string;
    expenseDate: string;
    status: string;
    period: string;
    empty: string;
    approve: string;
    reject: string;
    markPaid: string;
    deleteTitle: string;
    deleteDescription: string;
    distributedTooltip: string;
    notDistributedTooltip: string;
    attachmentTooltip: string;
  };
}) {
  const t = useTranslations("common");

  const hrefFor = (key: string, direction: "asc" | "desc") =>
    buildListHref(basePath, params, { sirala: key, yon: direction, sayfa: 1 });

  const actions = [
    ...(canApprove
      ? [
          {
            key: "approve",
            label: labels.approve,
            run: (ids: string[]) => setExpenseStatus(ids, "approved"),
          },
          {
            key: "paid",
            label: labels.markPaid,
            run: (ids: string[]) => setExpenseStatus(ids, "paid"),
          },
          {
            key: "reject",
            label: labels.reject,
            run: (ids: string[]) => setExpenseStatus(ids, "rejected"),
          },
        ]
      : []),
    {
      key: "delete",
      label: t("action.delete"),
      tone: "danger" as const,
      confirm: {
        title: labels.deleteTitle,
        description: labels.deleteDescription,
        confirmLabel: t("action.delete"),
      },
      run: deleteExpenses,
    },
  ];

  const columns: DataColumn<ExpenseRowView>[] = [
    {
      key: "description",
      header: labels.description,
      primary: true,
      render: (row) => (
        <>
          {row.description}
          <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
            {row.hasAttachment ? (
              <span title={labels.attachmentTooltip} className="text-fg-subtle">
                <Paperclip aria-label={labels.attachmentTooltip} className="h-3.5 w-3.5" />
              </span>
            ) : null}
            <span
              title={row.distributed ? labels.distributedTooltip : labels.notDistributedTooltip}
              className={row.distributed ? "text-success-fg" : "text-warning-fg"}
            >
              <Split
                aria-label={
                  row.distributed ? labels.distributedTooltip : labels.notDistributedTooltip
                }
                className="h-3.5 w-3.5"
              />
            </span>
          </span>
        </>
      ),
    },
    {
      key: "expenseDate",
      header: labels.expenseDate,
      sortKey: "expenseDate",
      render: (row) => <span className="text-fg-muted">{row.expenseDate}</span>,
    },
    {
      key: "category",
      header: labels.category,
      sortKey: "category",
      render: (row) =>
        row.categoryName ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-sm border border-border"
              // Kategori rengi kullanıcı verisi (veritabanından), token değil.
              style={row.categoryColor ? { backgroundColor: row.categoryColor } : undefined}
            />
            {row.categoryName}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: "vendor",
      header: labels.vendor,
      sortKey: "vendor",
      render: (row) => <span className="text-fg-muted">{row.vendorName ?? "—"}</span>,
    },
    {
      key: "amount",
      header: labels.amount,
      sortKey: "amount",
      numeric: true,
      render: (row) => <span className="font-medium">{row.amount}</span>,
    },
    { key: "vat", header: labels.vat, numeric: true, render: (row) => row.vat },
    {
      key: "status",
      header: labels.status,
      sortKey: "status",
      hideInCard: true,
      render: (row) => <Badge tone={row.statusTone}>{row.statusLabel}</Badge>,
    },
  ];

  return (
    <BulkSelection rows={rows} actions={actions}>
      {({ isSelected, isBusy, headerCheckbox, rowCheckbox }) => (
        <DataTable
          columns={columns}
          rows={rows}
          sort={sort}
          direction={direction}
          hrefFor={hrefFor}
          linkComponent={Link}
          selection={{ isSelected, isBusy, headerCheckbox, rowCheckbox }}
          rowHref={(row) => `/panel/giderler/${row.id}`}
          cardSubtitle={(row) => row.categoryName ?? undefined}
          cardBadge={(row) => <Badge tone={row.statusTone}>{row.statusLabel}</Badge>}
          cardBreakpoint="lg"
          empty={<p className="px-4 py-10 text-center text-sm text-fg-subtle">{labels.empty}</p>}
        />
      )}
    </BulkSelection>
  );
}
