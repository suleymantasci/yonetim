"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge, DataCard, SortableTh, tableClasses as tc } from "@yonetim/ui";

import { BulkSelection } from "@/components/list/bulk-selection";
import { buildListHref, type ListParams } from "@/lib/list-params";
import { bulkPatchUnits, restoreUnits, softDeleteUnits } from "./actions";

/**
 * Birim tablosu (istemci katmanı) — GAP 4.3.1 / 4.4.4.
 *
 * İki görünüm: `md` ve üstünde tablo, altında kart listesi. Yatay kaydırma
 * yerine kart tercih edildi; 720px genişlikte bir tabloyu telefonda kaydırmak
 * yöneticinin fiilen kullanamadığı bir arayüz üretiyordu.
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
          run: (ids: string[]) =>
            bulkPatchUnits({ ids, multiplierFactor: 1.1 }),
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
          {/* Masaüstü tablosu */}
          <div className="hidden md:block">
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className="w-10 px-4 py-2">
                      {headerCheckbox}
                    </th>
                    <SortableTh
                      label={labels.number}
                      columnKey="number"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      linkComponent={Link as never}
                    />
                    <th scope="col" className={tc.th}>
                      {labels.block}
                    </th>
                    <SortableTh
                      label={labels.floor}
                      columnKey="floor"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      linkComponent={Link as never}
                    />
                    <SortableTh
                      label={labels.type}
                      columnKey="type"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      linkComponent={Link as never}
                    />
                    <SortableTh
                      label={labels.area}
                      columnKey="area"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      align="right"
                      linkComponent={Link as never}
                    />
                    <SortableTh
                      label={labels.landShare}
                      columnKey="landShare"
                      activeKey={sort}
                      direction={direction}
                      hrefFor={hrefFor}
                      align="right"
                      linkComponent={Link as never}
                    />
                    <th scope="col" className={`${tc.th} text-right`}>
                      {labels.outstanding}
                    </th>
                    <th scope="col" className={tc.th}>
                      {labels.status}
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
                          href={`/panel/birimler/${row.id}`}
                          className="rounded hover:underline"
                        >
                          {row.number}
                        </Link>
                      </td>
                      <td className={tc.tdMuted}>{row.blockName ?? "—"}</td>
                      <td className={tc.td}>{row.floor}</td>
                      <td className={tc.td}>{row.typeLabel}</td>
                      <td className={tc.tdNum}>{row.area}</td>
                      <td className={tc.tdNum}>{row.landShare}</td>
                      <td
                        className={`${tc.tdNum} ${row.hasOutstanding ? "font-semibold text-danger-fg" : ""}`}
                      >
                        {row.outstanding}
                      </td>
                      <td className={tc.td}>
                        <Badge tone={row.statusBadge.tone}>
                          {row.statusBadge.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/panel/birimler/${row.id}/duzenle`}
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

          {/* Mobil kart listesi */}
          <div className="space-y-2 p-3 md:hidden">
            {rows.map((row) => (
              <DataCard
                key={row.id}
                title={row.number}
                subtitle={row.blockName ?? undefined}
                href={`/panel/birimler/${row.id}`}
                linkComponent={Link as never}
                leading={rowCheckbox(row.id)}
                badge={
                  <Badge tone={row.statusBadge.tone}>
                    {row.statusBadge.label}
                  </Badge>
                }
                rows={[
                  { label: labels.floor, value: String(row.floor) },
                  { label: labels.type, value: row.typeLabel },
                  { label: labels.area, value: row.area },
                  { label: labels.outstanding, value: row.outstanding },
                ]}
              />
            ))}
          </div>
        </>
      )}
    </BulkSelection>
  );
}
