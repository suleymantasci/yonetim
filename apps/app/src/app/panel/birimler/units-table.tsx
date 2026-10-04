"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge, DataTable, type DataColumn } from "@yonetim/ui";

import { BulkSelection } from "@/components/list/bulk-selection";
import { buildListHref, type ListParams } from "@/lib/list-params";
import { bulkPatchUnits, restoreUnits, softDeleteUnits } from "./actions";

/**
 * Birim tablosu (istemci katmanı) — GAP 4.3.1 / 4.4.4.
 *
 * Tablo iskeleti artık `DataTable`'da: yapışkan başlık, sıralama bağlantısı,
 * yoğunluk, seçim ve `md` altı kart görünümü tek yerden geliyor. Bu dosyada
 * kalan tek şey **birimlere özgü** olan: hangi sütunlar, hangi toplu işlemler.
 *
 * Sıralama ve sayfalama sunucu tarafında; bu bileşen yalnız seçim ve toplu
 * aksiyonları yönetir.
 */

export interface UnitRowView {
  id: string;
  number: string;
  blockName: string | null;
  floor: number;
  typeLabel: string;
  area: string;
  landShare: string;
  statusBadge: {
    label: string;
    tone: "neutral" | "warning" | "success" | "danger";
  };
  outstanding: string;
  hasOutstanding: boolean;
  occupantCount: number;
  multiplier: string | null;
}

export function UnitsTable({
  rows,
  sort,
  direction,
  basePath,
  params,
  trashed,
  labels,
}: {
  rows: UnitRowView[];
  sort: string;
  direction: "asc" | "desc";
  basePath: string;
  params: ListParams;
  trashed: boolean;
  labels: {
    number: string;
    block: string;
    floor: string;
    type: string;
    area: string;
    landShare: string;
    status: string;
    outstanding: string;
    occupants: string;
    empty: string;
    deleteTitle: string;
    deleteDescription: string;
    raise: string;
    exempt: string;
  };
}) {
  const t = useTranslations("common");

  const hrefFor = (key: string, direction: "asc" | "desc") =>
    buildListHref(basePath, params, { sirala: key, yon: direction, sayfa: 1 });

  const actions = trashed
    ? [
        {
          key: "restore",
          label: t("action.restore"),
          run: restoreUnits,
        },
      ]
    : [
        {
          key: "raise",
          label: labels.raise,
          // %10 zam: en sık istenen toplu işlem (GAP 4.1.1). Oransal uygulanır.
          run: (ids: string[]) => bulkPatchUnits({ ids, multiplierFactor: 1.1 }),
        },
        {
          key: "exempt",
          label: labels.exempt,
          run: (ids: string[]) => bulkPatchUnits({ ids, duesExempt: true }),
        },
        {
          key: "delete",
          label: t("action.delete"),
          tone: "danger" as const,
          confirm: {
            title: labels.deleteTitle,
            description: labels.deleteDescription,
            confirmLabel: t("action.delete"),
          },
          run: softDeleteUnits,
        },
      ];

  const columns: DataColumn<UnitRowView>[] = [
    {
      key: "number",
      header: labels.number,
      sortKey: "number",
      primary: true,
      render: (row) => row.number,
    },
    {
      key: "block",
      header: labels.block,
      render: (row) => <span className="text-fg-muted">{row.blockName ?? "—"}</span>,
    },
    { key: "floor", header: labels.floor, sortKey: "floor", render: (row) => row.floor },
    { key: "type", header: labels.type, sortKey: "type", render: (row) => row.typeLabel },
    { key: "area", header: labels.area, sortKey: "area", numeric: true, render: (row) => row.area },
    {
      key: "landShare",
      header: labels.landShare,
      sortKey: "landShare",
      numeric: true,
      render: (row) => row.landShare,
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
      key: "status",
      header: labels.status,
      // Kartta rozet zaten başlık satırında; ikinci kez listelenmesin.
      hideInCard: true,
      render: (row) => <Badge tone={row.statusBadge.tone}>{row.statusBadge.label}</Badge>,
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
          rowHref={(row) => `/panel/birimler/${row.id}`}
          cardSubtitle={(row) => row.blockName ?? undefined}
          cardBadge={(row) => <Badge tone={row.statusBadge.tone}>{row.statusBadge.label}</Badge>}
          rowActionsLabel={t("action.edit")}
          rowActions={(row) => (
            <Link
              href={`/panel/birimler/${row.id}/duzenle`}
              aria-label={t("action.edit")}
              className="inline-flex rounded p-1.5 text-fg-subtle hover:bg-hover hover:text-fg"
            >
              <Pencil aria-hidden className="h-3.5 w-3.5" />
            </Link>
          )}
          empty={<p className="px-4 py-10 text-center text-sm text-fg-subtle">{labels.empty}</p>}
        />
      )}
    </BulkSelection>
  );
}
