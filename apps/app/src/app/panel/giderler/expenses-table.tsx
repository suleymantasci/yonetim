"use client";

import { Paperclip, Split } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge, DataCard, SortableTh, tableClasses as tc } from "@yonetim/ui";

import { BulkSelection } from "@/components/list/bulk-selection";
import { buildListHref, type ListParams } from "@/lib/list-params";
import { deleteExpenses, setExpenseStatus } from "./actions";

/**
 * Gider tablosu.
 *
 * "Dağıtıldı" durumu ayrı bir sütun değil, satır sonundaki simge: yöneticinin
 * aradığı bilgi "hangi giderler henüz sakinlere yansımadı?" — o yüzden
 * dağıtılmamış giderler vurgulanır, dağıtılmışlar sakinleşir.
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

  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-fg-subtle">
        {labels.empty}
      </p>
    );
  }

  return (
    <BulkSelection rows={rows} actions={actions}>
      {({ isSelected, headerCheckbox, rowCheckbox }) => (
        <>
          <div className="hidden md:block">
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 900 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className="w-10 px-4 py-2">
                      {headerCheckbox}
                    </th>
                    <SortableTh
                      label={labels.expenseDate}
                      columnKey="expenseDate"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      linkComponent={Link as never}
                    />
                    <th scope="col" className={tc.th}>
                      {labels.description}
                    </th>
                    <SortableTh
                      label={labels.category}
                      columnKey="category"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      linkComponent={Link as never}
                    />
                    <SortableTh
                      label={labels.vendor}
                      columnKey="vendor"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      linkComponent={Link as never}
                    />
                    <SortableTh
                      label={labels.amount}
                      columnKey="amount"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      align="right"
                      linkComponent={Link as never}
                    />
                    <th scope="col" className={`${tc.th} text-right`}>
                      {labels.vat}
                    </th>
                    <SortableTh
                      label={labels.status}
                      columnKey="status"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      linkComponent={Link as never}
                    />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`${tc.tr} ${isSelected(row.id) ? "bg-selected" : "hover:bg-hover"}`}
                    >
                      <td className="px-4 py-2.5">{rowCheckbox(row.id)}</td>
                      <td className={tc.tdMuted}>{row.expenseDate}</td>
                      <td className={tc.td}>
                        <Link
                          href={`/panel/giderler/${row.id}`}
                          className="font-medium hover:underline"
                        >
                          {row.description}
                        </Link>
                        <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
                          {row.hasAttachment ? (
                            <span
                              title={labels.attachmentTooltip}
                              className="text-fg-subtle"
                            >
                              <Paperclip
                                aria-label={labels.attachmentTooltip}
                                className="h-3.5 w-3.5"
                              />
                            </span>
                          ) : null}
                          <span
                            title={
                              row.distributed
                                ? labels.distributedTooltip
                                : labels.notDistributedTooltip
                            }
                            className={
                              row.distributed
                                ? "text-success-fg"
                                : "text-warning-fg"
                            }
                          >
                            <Split
                              aria-label={
                                row.distributed
                                  ? labels.distributedTooltip
                                  : labels.notDistributedTooltip
                              }
                              className="h-3.5 w-3.5"
                            />
                          </span>
                        </span>
                      </td>
                      <td className={tc.td}>
                        {row.categoryName ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden
                              className="h-2 w-2 shrink-0 rounded-sm border border-border"
                              style={
                                row.categoryColor
                                  ? { backgroundColor: row.categoryColor }
                                  : undefined
                              }
                            />
                            {row.categoryName}
                          </span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className={tc.tdMuted}>{row.vendorName ?? "—"}</td>
                      <td className={`${tc.tdNum} font-medium`}>
                        {row.amount}
                      </td>
                      <td className={tc.tdNum}>{row.vat}</td>
                      <td className={tc.td}>
                        <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 p-3 md:hidden">
            {rows.map((row) => (
              <DataCard
                key={row.id}
                title={row.description}
                subtitle={row.categoryName ?? undefined}
                href={`/panel/giderler/${row.id}`}
                linkComponent={Link as never}
                leading={rowCheckbox(row.id)}
                badge={<Badge tone={row.statusTone}>{row.statusLabel}</Badge>}
                rows={[
                  { label: labels.amount, value: row.amount },
                  { label: labels.expenseDate, value: row.expenseDate },
                  { label: labels.vendor, value: row.vendorName ?? "—" },
                  { label: labels.period, value: row.period },
                ]}
              />
            ))}
          </div>
        </>
      )}
    </BulkSelection>
  );
}
