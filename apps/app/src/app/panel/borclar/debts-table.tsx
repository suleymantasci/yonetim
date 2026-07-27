"use client";

import { History, ShieldOff } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Badge,
  DataCard,
  SortableTh,
  tableClasses as tc,
  Textarea,
} from "@yonetim/ui";

import { BulkSelection } from "@/components/list/bulk-selection";
import { buildListHref, type ListParams } from "@/lib/list-params";
import { cancelDebts, setLateFeeExempt } from "./actions";

/**
 * Borç tablosu.
 *
 * İki şeffaflık işareti taşır:
 * - **Tarihçe simgesi**: bu borcun tutarı/vadesi daha önce değişmiş. Sakin de
 *   aynı işareti görür; "sessiz zam" mümkün değil (SPEC 3.2).
 * - **Muafiyet simgesi**: gecikme tazminatı işlemiyor. Yöneticinin hangi
 *   borçlara faiz yürüdüğünü gözle ayırt edebilmesi gerekiyor (GAP 4.2.5).
 *
 * İptal işlemi gerekçe ister: gerekçesiz iptal, denetçiye açıklanamayan bir
 * silme olurdu.
 */
export interface DebtRowView {
  id: string;
  unitId: string;
  unitLabel: string;
  debtorName: string | null;
  description: string;
  kindLabel: string;
  period: string;
  amount: string;
  paid: string;
  outstanding: string;
  hasOutstanding: boolean;
  lateFee: string | null;
  dueDate: string;
  overdue: boolean;
  statusLabel: string;
  statusTone: "neutral" | "success" | "warning" | "danger";
  lateFeeExempt: boolean;
  changeCount: number;
  installmentLabel: string | null;
}

export function DebtsTable({
  rows,
  sort,
  direction,
  basePath,
  params,
  labels,
}: {
  rows: DebtRowView[];
  sort: string;
  direction: "asc" | "desc";
  basePath: string;
  params: ListParams;
  labels: {
    unit: string;
    debtor: string;
    description: string;
    period: string;
    amount: string;
    outstanding: string;
    dueDate: string;
    status: string;
    empty: string;
    cancelTitle: string;
    cancelDescription: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    exemptOn: string;
    exemptOff: string;
    changedTooltip: string;
    exemptTooltip: string;
  };
}) {
  const t = useTranslations("common");
  const [reason, setReason] = useState("");

  const hrefFor = (key: string, direction: "asc" | "desc") =>
    buildListHref(basePath, params, { sirala: key, yon: direction, sayfa: 1 });

  const actions = [
    {
      key: "exemptOn",
      label: labels.exemptOn,
      run: (ids: string[]) => setLateFeeExempt(ids, true),
    },
    {
      key: "exemptOff",
      label: labels.exemptOff,
      run: (ids: string[]) => setLateFeeExempt(ids, false),
    },
    {
      key: "cancel",
      label: t("action.delete"),
      tone: "danger" as const,
      confirm: {
        title: labels.cancelTitle,
        description: labels.cancelDescription,
        confirmLabel: t("action.confirm"),
      },
      // Gerekçe, onay diyaloğu açılmadan önce girilir (aşağıdaki alan).
      run: (ids: string[]) => cancelDebts(ids, reason),
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
              <table className={tc.table} style={{ minWidth: 980 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className="w-10 px-4 py-2">
                      {headerCheckbox}
                    </th>
                    <SortableTh
                      label={labels.unit}
                      columnKey="unit"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      linkComponent={Link as never}
                    />
                    <th scope="col" className={tc.th}>
                      {labels.description}
                    </th>
                    <th scope="col" className={tc.th}>
                      {labels.debtor}
                    </th>
                    <SortableTh
                      label={labels.period}
                      columnKey="period"
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
                      {labels.outstanding}
                    </th>
                    <SortableTh
                      label={labels.dueDate}
                      columnKey="dueDate"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      linkComponent={Link as never}
                    />
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
                      <td className={tc.td}>
                        <Link
                          href={`/panel/birimler/${row.unitId}`}
                          className="font-medium hover:underline"
                        >
                          {row.unitLabel}
                        </Link>
                      </td>
                      <td className={tc.td}>
                        <Link
                          href={`/panel/borclar/${row.id}`}
                          className="hover:underline"
                        >
                          {row.description}
                        </Link>
                        <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
                          {row.changeCount > 0 ? (
                            <span
                              title={labels.changedTooltip}
                              className="text-warning-fg"
                            >
                              <History
                                aria-label={labels.changedTooltip}
                                className="h-3.5 w-3.5"
                              />
                            </span>
                          ) : null}
                          {row.lateFeeExempt ? (
                            <span
                              title={labels.exemptTooltip}
                              className="text-info-fg"
                            >
                              <ShieldOff
                                aria-label={labels.exemptTooltip}
                                className="h-3.5 w-3.5"
                              />
                            </span>
                          ) : null}
                        </span>
                        {row.installmentLabel ? (
                          <span className="ml-1 text-xs text-fg-subtle">
                            {row.installmentLabel}
                          </span>
                        ) : null}
                      </td>
                      <td className={tc.tdMuted}>{row.debtorName ?? "—"}</td>
                      <td className={tc.tdMuted}>{row.period}</td>
                      <td className={tc.tdNum}>{row.amount}</td>
                      <td
                        className={`${tc.tdNum} ${row.hasOutstanding ? "font-semibold text-danger-fg" : ""}`}
                      >
                        {row.outstanding}
                      </td>
                      <td
                        className={`${tc.td} ${row.overdue ? "text-danger-fg" : ""}`}
                      >
                        {row.dueDate}
                      </td>
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
                subtitle={row.unitLabel}
                href={`/panel/borclar/${row.id}`}
                linkComponent={Link as never}
                leading={rowCheckbox(row.id)}
                badge={<Badge tone={row.statusTone}>{row.statusLabel}</Badge>}
                rows={[
                  { label: labels.amount, value: row.amount },
                  { label: labels.outstanding, value: row.outstanding },
                  { label: labels.dueDate, value: row.dueDate },
                  { label: labels.period, value: row.period },
                ]}
              />
            ))}
          </div>

          {/* Gerekçe alanı: iptal aksiyonu bunu okur. Seçim varken görünür. */}
          <div className="border-t border-border bg-surface-sunken px-4 py-3">
            <label
              className="block text-xs font-medium text-fg-muted"
              htmlFor="bulk-cancel-reason"
            >
              {labels.reasonLabel}
            </label>
            <Textarea
              id="bulk-cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={labels.reasonPlaceholder}
              rows={2}
              maxLength={500}
              className="mt-1 min-h-0"
            />
          </div>
        </>
      )}
    </BulkSelection>
  );
}
