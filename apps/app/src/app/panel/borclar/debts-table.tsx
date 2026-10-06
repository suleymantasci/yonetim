"use client";

import { History, ShieldOff } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge, DataTable, Input, Textarea, type DataColumn } from "@yonetim/ui";

import { BulkSelection } from "@/components/list/bulk-selection";
import { buildListHref, type ListParams } from "@/lib/list-params";
import { cancelDebts, forgiveDebts, setLateFeeExempt } from "./actions";

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
 * silme olurdu. Gerekçe alanı **yalnız seçim varken** görünüyor; boş bir
 * listenin altında duran bir "iptal gerekçesi" kutusu, ne işe yaradığı
 * anlaşılmayan bir alandı.
 *
 * Dokuz sütun `md`'de sıkışıyordu; kart kırılımı bu tabloda `lg`.
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
  canForgive,
  labels,
}: {
  rows: DebtRowView[];
  sort: string;
  direction: "asc" | "desc";
  basePath: string;
  params: ListParams;
  /** `debt:forgive` yetkisi — silme eylemi yalnız bunda görünür. */
  canForgive: boolean;
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
    forgive: string;
    forgiveTitle: string;
    forgiveDescription: string;
    decisionLabel: string;
    decisionPlaceholder: string;
  };
}) {
  const t = useTranslations("common");
  const [reason, setReason] = useState("");
  const [decisionRef, setDecisionRef] = useState("");

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
    ...(canForgive
      ? [
          {
            key: "forgive",
            label: labels.forgive,
            tone: "danger" as const,
            confirm: {
              title: labels.forgiveTitle,
              description: labels.forgiveDescription,
              confirmLabel: t("action.confirm"),
            },
            // Gerekçe ve karar numarası seçimin altındaki alanlardan okunur.
            run: (ids: string[]) => forgiveDebts(ids, reason, decisionRef),
          },
        ]
      : []),
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

  const columns: DataColumn<DebtRowView>[] = [
    {
      key: "description",
      header: labels.description,
      primary: true,
      render: (row) => (
        <>
          {row.description}
          <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
            {row.changeCount > 0 ? (
              <span title={labels.changedTooltip} className="text-warning-fg">
                <History aria-label={labels.changedTooltip} className="h-3.5 w-3.5" />
              </span>
            ) : null}
            {row.lateFeeExempt ? (
              <span title={labels.exemptTooltip} className="text-info-fg">
                <ShieldOff aria-label={labels.exemptTooltip} className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </span>
          {row.installmentLabel ? (
            <span className="ml-1 text-xs text-fg-subtle">{row.installmentLabel}</span>
          ) : null}
        </>
      ),
    },
    {
      key: "unit",
      header: labels.unit,
      sortKey: "unit",
      render: (row) => (
        <Link
          href={`/panel/birimler/${row.unitId}`}
          className="font-medium hover:underline"
        >
          {row.unitLabel}
        </Link>
      ),
    },
    {
      key: "debtor",
      header: labels.debtor,
      render: (row) => <span className="text-fg-muted">{row.debtorName ?? "—"}</span>,
    },
    {
      key: "period",
      header: labels.period,
      sortKey: "period",
      render: (row) => <span className="text-fg-muted">{row.period}</span>,
    },
    {
      key: "amount",
      header: labels.amount,
      sortKey: "amount",
      numeric: true,
      render: (row) => row.amount,
    },
    {
      key: "outstanding",
      header: labels.outstanding,
      numeric: true,
      render: (row) => (
        <span className={row.hasOutstanding ? "font-semibold text-danger-fg" : undefined}>
          {row.outstanding}
        </span>
      ),
    },
    {
      key: "dueDate",
      header: labels.dueDate,
      sortKey: "dueDate",
      render: (row) => (
        <span className={row.overdue ? "text-danger-fg" : undefined}>{row.dueDate}</span>
      ),
    },
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
      {({ isSelected, isBusy, headerCheckbox, rowCheckbox }) => {
        const anySelected = rows.some((row) => isSelected(row.id));
        return (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              sort={sort}
              direction={direction}
              hrefFor={hrefFor}
              linkComponent={Link}
              selection={{ isSelected, isBusy, headerCheckbox, rowCheckbox }}
              rowHref={(row) => `/panel/borclar/${row.id}`}
              cardSubtitle={(row) => row.unitLabel}
              cardBadge={(row) => <Badge tone={row.statusTone}>{row.statusLabel}</Badge>}
              cardBreakpoint="lg"
              empty={
                <p className="px-4 py-10 text-center text-sm text-fg-subtle">{labels.empty}</p>
              }
            />

            {/* Gerekçe alanı: iptal aksiyonu bunu okur. Yalnız seçim varken. */}
            {anySelected ? (
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
                {canForgive ? (
                  <>
                    <label
                      className="mt-3 block text-xs font-medium text-fg-muted"
                      htmlFor="bulk-forgive-decision"
                    >
                      {labels.decisionLabel}
                    </label>
                    <Input
                      id="bulk-forgive-decision"
                      value={decisionRef}
                      onChange={(event) => setDecisionRef(event.target.value)}
                      placeholder={labels.decisionPlaceholder}
                      maxLength={120}
                      className="mt-1"
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        );
      }}
    </BulkSelection>
  );
}
