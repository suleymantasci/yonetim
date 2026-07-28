"use client";

import { MessageCircle, MessageCircleOff, Pencil } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge, DataTable, type DataColumn } from "@yonetim/ui";

import { BulkSelection } from "@/components/list/bulk-selection";
import { buildListHref, type ListParams } from "@/lib/list-params";
import { removeResidents, setWhatsappOptIn } from "./actions";

/**
 * Sakin tablosu.
 *
 * "Tek cari" görünürlüğü (GAP 4.1.2): bir kişinin birden fazla birimdeki
 * ilişkisi tek satırda, birim rozetleri olarak gösterilir. Rakiplerin
 * "aynı kişi 3 kez listelenir" davranışı burada bilinçli olarak yok.
 *
 * Tablo iskeleti `DataTable`'da; burada yalnız sakine özgü sütunlar ve
 * toplu işlemler duruyor.
 */
export interface ResidentRowView {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  units: {
    unitId: string;
    label: string;
    relation: string;
    relationLabel: string;
  }[];
  roleLabel: string;
  whatsappOptIn: boolean;
  outstanding: string;
  hasOutstanding: boolean;
  multiUnit: boolean;
}

export function ResidentsTable({
  rows,
  sort,
  direction,
  basePath,
  params,
  labels,
}: {
  rows: ResidentRowView[];
  sort: string;
  direction: "asc" | "desc";
  basePath: string;
  params: ListParams;
  labels: {
    fullName: string;
    units: string;
    phone: string;
    role: string;
    whatsapp: string;
    outstanding: string;
    empty: string;
    removeTitle: string;
    removeDescription: string;
    optIn: string;
    optOut: string;
    multiUnitBadge: string;
  };
}) {
  const t = useTranslations("common");

  const hrefFor = (key: string, direction: "asc" | "desc") =>
    buildListHref(basePath, params, { sirala: key, yon: direction, sayfa: 1 });

  const actions = [
    {
      key: "optIn",
      label: labels.optIn,
      run: (ids: string[]) => setWhatsappOptIn(ids, true),
    },
    {
      key: "optOut",
      label: labels.optOut,
      run: (ids: string[]) => setWhatsappOptIn(ids, false),
    },
    {
      key: "remove",
      label: t("action.delete"),
      tone: "danger" as const,
      confirm: {
        title: labels.removeTitle,
        description: labels.removeDescription,
        confirmLabel: t("action.delete"),
      },
      run: removeResidents,
    },
  ];

  const columns: DataColumn<ResidentRowView>[] = [
    {
      key: "name",
      header: labels.fullName,
      sortKey: "name",
      primary: true,
      render: (row) => (
        <>
          {row.name}
          {row.multiUnit ? (
            <Badge tone="brand" className="ml-2">
              {labels.multiUnitBadge}
            </Badge>
          ) : null}
        </>
      ),
    },
    {
      key: "units",
      header: labels.units,
      sortKey: "unit",
      render: (row) =>
        row.units.length === 0 ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {row.units.map((unit) => (
              <Link
                key={`${unit.unitId}-${unit.relation}`}
                href={`/panel/birimler/${unit.unitId}`}
                title={unit.relationLabel}
                className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs text-fg-muted hover:bg-hover hover:text-fg"
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${
                    unit.relation === "owner" ? "bg-primary" : "bg-info"
                  }`}
                />
                {unit.label}
              </Link>
            ))}
          </span>
        ),
    },
    {
      key: "phone",
      header: labels.phone,
      render: (row) => <span className="tabular-nums text-fg-muted">{row.phone}</span>,
    },
    { key: "role", header: labels.role, render: (row) => row.roleLabel },
    {
      key: "outstanding",
      header: labels.outstanding,
      sortKey: "outstanding",
      numeric: true,
      render: (row) => (
        <span className={row.hasOutstanding ? "font-semibold text-danger-fg" : undefined}>
          {row.outstanding}
        </span>
      ),
    },
    {
      key: "whatsapp",
      header: labels.whatsapp,
      render: (row) =>
        row.whatsappOptIn ? (
          <span className="inline-flex items-center gap-1 text-xs text-success-fg">
            <MessageCircle aria-hidden className="h-3.5 w-3.5" />
            {labels.whatsapp}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
            <MessageCircleOff aria-hidden className="h-3.5 w-3.5" />—
          </span>
        ),
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
          rowHref={(row) => `/panel/sakinler/${row.id}`}
          cardSubtitle={(row) => row.units.map((unit) => unit.label).join(", ") || undefined}
          cardBadge={(row) =>
            row.hasOutstanding ? <Badge tone="danger">{row.outstanding}</Badge> : null
          }
          rowActionsLabel={t("action.edit")}
          rowActions={(row) => (
            <Link
              href={`/panel/sakinler/${row.id}/duzenle`}
              aria-label={t("action.edit")}
              className="inline-flex rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg"
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
