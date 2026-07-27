"use client";

import { MessageCircle, MessageCircleOff, Pencil } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge, DataCard, SortableTh, tableClasses as tc } from "@yonetim/ui";

import { BulkSelection } from "@/components/list/bulk-selection";
import { buildListHref, type ListParams } from "@/lib/list-params";
import { removeResidents, setWhatsappOptIn } from "./actions";

/**
 * Sakin tablosu.
 *
 * "Tek cari" görünürlüğü (GAP 4.1.2): bir kişinin birden fazla birimdeki
 * ilişkisi tek satırda, birim rozetleri olarak gösterilir. Rakiplerin
 * "aynı kişi 3 kez listelenir" davranışı burada bilinçli olarak yok.
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
              <table className={tc.table} style={{ minWidth: 860 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className="w-10 px-4 py-2">
                      {headerCheckbox}
                    </th>
                    <SortableTh
                      label={labels.fullName}
                      columnKey="name"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      linkComponent={Link as never}
                    />
                    <SortableTh
                      label={labels.units}
                      columnKey="unit"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      linkComponent={Link as never}
                    />
                    <th scope="col" className={tc.th}>
                      {labels.phone}
                    </th>
                    <th scope="col" className={tc.th}>
                      {labels.role}
                    </th>
                    <SortableTh
                      label={labels.outstanding}
                      columnKey="outstanding"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      align="right"
                      linkComponent={Link as never}
                    />
                    <th scope="col" className={tc.th}>
                      {labels.whatsapp}
                    </th>
                    <th scope="col" className="w-10 px-4 py-2">
                      <span className="sr-only">{t("action.edit")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`${tc.tr} ${isSelected(row.id) ? "bg-selected" : "hover:bg-hover"}`}
                    >
                      <td className="px-4 py-2.5">{rowCheckbox(row.id)}</td>
                      <td className={`${tc.td} font-medium`}>
                        <Link
                          href={`/panel/sakinler/${row.id}`}
                          className="hover:underline"
                        >
                          {row.name}
                        </Link>
                        {row.multiUnit ? (
                          <Badge tone="brand" className="ml-2">
                            {labels.multiUnitBadge}
                          </Badge>
                        ) : null}
                      </td>
                      <td className={tc.td}>
                        {row.units.length === 0 ? (
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
                                    unit.relation === "owner"
                                      ? "bg-primary"
                                      : "bg-info"
                                  }`}
                                />
                                {unit.label}
                              </Link>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className={`${tc.tdMuted} tabular-nums`}>
                        {row.phone}
                      </td>
                      <td className={tc.td}>{row.roleLabel}</td>
                      <td
                        className={`${tc.tdNum} ${row.hasOutstanding ? "font-semibold text-danger-fg" : ""}`}
                      >
                        {row.outstanding}
                      </td>
                      <td className={tc.td}>
                        {row.whatsappOptIn ? (
                          <span className="inline-flex items-center gap-1 text-xs text-success-fg">
                            <MessageCircle
                              aria-hidden
                              className="h-3.5 w-3.5"
                            />
                            {labels.whatsapp}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
                            <MessageCircleOff
                              aria-hidden
                              className="h-3.5 w-3.5"
                            />
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/panel/sakinler/${row.id}/duzenle`}
                          aria-label={t("action.edit")}
                          className="inline-flex rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg"
                        >
                          <Pencil aria-hidden className="h-3.5 w-3.5" />
                        </Link>
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
                title={row.name}
                subtitle={
                  row.units.map((unit) => unit.label).join(", ") || undefined
                }
                href={`/panel/sakinler/${row.id}`}
                linkComponent={Link as never}
                leading={rowCheckbox(row.id)}
                badge={
                  row.hasOutstanding ? (
                    <Badge tone="danger">{row.outstanding}</Badge>
                  ) : null
                }
                rows={[
                  { label: labels.phone, value: row.phone },
                  { label: labels.role, value: row.roleLabel },
                  { label: labels.outstanding, value: row.outstanding },
                  {
                    label: labels.whatsapp,
                    value: row.whatsappOptIn ? labels.optIn : "—",
                  },
                ]}
              />
            ))}
          </div>
        </>
      )}
    </BulkSelection>
  );
}
