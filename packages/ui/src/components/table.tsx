import type { ReactNode } from "react";

import { cn } from "../cn";
import { DataCard } from "./list-toolbar";
import { SortableTh, type LinkLike } from "./navigation";

/**
 * Liste tablosu — UI Faz 2.3.
 *
 * ÖNCEKİ DURUM: buradaki `DataTable` **hiçbir yerde kullanılmıyordu** (ölü
 * kod), buna karşılık `birimler`, `sakinler`, `borclar`, `giderler` aynı
 * reçeteyi dört kez kopyalamıştı: `BulkSelection` + `SortableTh` + `tc.*` +
 * `md` altı `DataCard`. Kopyalar birbirinden ayrışmıştı — biri `minWidth`
 * veriyordu, biri vermiyordu; biri "düzenle" sütunu koyuyordu, biri
 * koymuyordu. Bu dosya o dördünün **gerçek** ihtiyacına göre yeniden yazıldı.
 *
 * ÜÇ TASARIM KARARI, ÜÇÜ DE ÖLÇÜLMÜŞ BİR SORUNDAN:
 *
 * 1. **Yatay kaydırma kabı yok.** `overflow-x: auto` yazmak `overflow-y`'yi de
 *    `auto` yapar ve yeni bir kaydırma kutusu doğurur; o andan itibaren
 *    `sticky top-16` görüş alanından değil **kabın tepesinden** ölçülür ve
 *    yapışkan başlık sessizce ölür. Landing'de tam olarak bu ölçülmüştü.
 *    Bu yüzden geniş tablo dar ekranda kaydırılmaz, **karta düşer**
 *    (`cardBreakpoint`). Aynı nedenle "yapışkan ilk sütun" da yok: yatay
 *    kaydırma olmayınca çözdüğü bir sorun kalmıyor.
 * 2. **`border-separate border-spacing-0`.** Toplu kenarlık modelinde
 *    (`border-collapse`) kenarlık tabloya aittir ve yapışkan hücreyle
 *    hareket etmez; satırlar başlığın altına çizgisiz giriyordu.
 * 3. **Zemin tek yerden.** Başlık/satır hücresinde iki `bg-*` sınıfı çakışınca
 *    kazananı sınıf listesindeki sıra değil üretilen CSS'in sırası belirler.
 *    Bu yüzden zemin koşullu tek bir ifadeden geliyor.
 *
 * Satır yoğunluğu `--row-py` / `--row-px` değişkenlerinden okunuyor
 * (`tokens.css`); kullanıcı tercihi `<html data-density>` üzerinden gelir ve
 * **sunucuda** basıldığı için ilk boyama doğru yükseklikte olur.
 */

export interface DataColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Verilirse başlık sunucu sıralaması için bağlantıya döner. */
  sortKey?: string;
  /** Sayısal sütun: sağa hizalı + `tabular-nums`. */
  numeric?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
  headClassName?: string;
  /** Satırın kimliği — kart görünümünde başlık olur, tabloda kalın yazılır. */
  primary?: boolean;
  /** Kart görünümünde bu sütun listelenmez (ikon, satır içi aksiyon). */
  hideInCard?: boolean;
  /** Kart görünümündeki etiket; verilmezse `header` (string ise) kullanılır. */
  cardLabel?: string;
}

export interface DataTableSelection {
  isSelected: (id: string) => boolean;
  /** İyimser "işleniyor" durumu — satır soluklaşır ve tıklanamaz olur. */
  isBusy?: (id: string) => boolean;
  headerCheckbox: ReactNode;
  rowCheckbox: (id: string) => ReactNode;
}

export interface DataTableProps<T extends { id: string }> {
  columns: DataColumn<T>[];
  rows: T[];
  /** Satır yokken gösterilecek blok — genelde `EmptyState`. */
  empty: ReactNode;
  caption?: string;
  /** Sunucu sıralaması; üçü birlikte verilir. */
  sort?: string;
  direction?: "asc" | "desc";
  hrefFor?: (key: string, direction: "asc" | "desc") => string;
  linkComponent?: LinkLike;
  selection?: DataTableSelection;
  /** Satır tıklanabilirse kart görünümü ve birincil sütun bağlantı olur. */
  rowHref?: (row: T) => string | undefined;
  /** Satır sonundaki ikon aksiyonları (düzenle, sil). */
  rowActions?: (row: T) => ReactNode;
  rowActionsLabel?: string;
  cardSubtitle?: (row: T) => ReactNode;
  cardBadge?: (row: T) => ReactNode;
  /** Tablonun karta düştüğü kırılım. Geniş tablolarda `lg`. */
  cardBreakpoint?: "md" | "lg";
  /** Yapışkan başlık kapatılabilir (kart içi küçük tablolar). */
  stickyHeader?: boolean;
  className?: string;
}

const HEAD_BASE =
  "sticky z-20 border-b border-border bg-surface-sunken px-[var(--row-px)] " +
  "py-[var(--head-py)] text-left text-[11px] font-semibold uppercase " +
  "tracking-wide text-fg-subtle first:rounded-ss-lg last:rounded-se-lg";

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
  caption,
  sort,
  direction,
  hrefFor,
  linkComponent,
  selection,
  rowHref,
  rowActions,
  rowActionsLabel,
  cardSubtitle,
  cardBadge,
  cardBreakpoint = "md",
  stickyHeader = true,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0) return <>{empty}</>;

  const tableVisible = cardBreakpoint === "lg" ? "hidden lg:block" : "hidden md:block";
  const cardVisible = cardBreakpoint === "lg" ? "lg:hidden" : "md:hidden";

  /**
   * Yapışkan başlık kabuğun 64px'lik üst barının **altına** oturur; ikisi de
   * aynı ölçekten geliyor (`h-16` / `top-16`). Ham piksel yazmak, bar
   * yüksekliği değişince başlığın barın altında kaybolmasına yol açardı.
   */
  const headSticky = stickyHeader ? "top-16" : "top-0";

  const primary = columns.find((column) => column.primary) ?? columns[0]!;
  const cardColumns = columns.filter(
    (column) => !column.hideInCard && column.key !== primary.key,
  );

  const alignOf = (column: DataColumn<T>) =>
    column.numeric ? "right" : (column.align ?? "left");

  return (
    <div className={className}>
      <div className={tableVisible}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {selection ? (
                <th scope="col" className={cn(HEAD_BASE, headSticky, "w-10")}>
                  {selection.headerCheckbox}
                </th>
              ) : null}

              {columns.map((column) =>
                column.sortKey && hrefFor ? (
                  <SortableTh
                    key={column.key}
                    label={typeof column.header === "string" ? column.header : column.key}
                    columnKey={column.sortKey}
                    activeKey={sort}
                    direction={direction}
                    hrefFor={hrefFor}
                    align={alignOf(column) === "right" ? "right" : "left"}
                    linkComponent={linkComponent}
                    className={cn(HEAD_BASE, headSticky, column.headClassName)}
                  />
                ) : (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      HEAD_BASE,
                      headSticky,
                      alignOf(column) === "right" && "text-right",
                      alignOf(column) === "center" && "text-center",
                      column.headClassName,
                    )}
                  >
                    {column.header}
                  </th>
                ),
              )}

              {rowActions ? (
                <th scope="col" className={cn(HEAD_BASE, headSticky, "w-10")}>
                  <span className="sr-only">{rowActionsLabel}</span>
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const selected = selection?.isSelected(row.id) ?? false;
              const busy = selection?.isBusy?.(row.id) ?? false;
              return (
                <tr
                  key={row.id}
                  aria-busy={busy || undefined}
                  className={cn(
                    "transition-colors",
                    selected ? "bg-selected" : "hover:bg-hover",
                    // İşlem sürerken satır soluk ve tıklanamaz: kullanıcı aynı
                    // toplu işlemi ikinci kez tetikleyemesin.
                    busy && "pointer-events-none opacity-50",
                    "[&>td]:border-b [&>td]:border-border",
                    "last:[&>td]:border-b-0",
                  )}
                >
                  {selection ? (
                    <td className="px-[var(--row-px)] py-[var(--row-py)]">
                      {selection.rowCheckbox(row.id)}
                    </td>
                  ) : null}

                  {columns.map((column) => {
                    const align = alignOf(column);
                    const content = column.render(row);
                    const href = column.primary ? rowHref?.(row) : undefined;
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          "px-[var(--row-px)] py-[var(--row-py)] align-middle text-fg",
                          column.numeric && "tabular-nums",
                          align === "right" && "text-right",
                          align === "center" && "text-center",
                          column.primary && "font-medium",
                          column.className,
                        )}
                      >
                        {href && linkComponent ? (
                          <LinkCell href={href} linkComponent={linkComponent}>
                            {content}
                          </LinkCell>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}

                  {rowActions ? (
                    <td className="px-[var(--row-px)] py-[var(--row-py)] text-right">
                      {rowActions(row)}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
       * Kart görünümü: telefonda 10 sütunlu bir tabloyu yana kaydırarak
       * okumak, başlık satırı görüş alanından çıkınca hangi sayının ne
       * olduğunu kaybettiriyor. Kartta her değer kendi etiketiyle geliyor.
       */}
      <div className={cn("space-y-2 p-3", cardVisible)}>
        {rows.map((row) => (
          <DataCard
            key={row.id}
            title={primary.render(row)}
            subtitle={cardSubtitle?.(row)}
            href={rowHref?.(row)}
            linkComponent={linkComponent}
            leading={selection?.rowCheckbox(row.id)}
            badge={cardBadge?.(row)}
            rows={cardColumns.map((column) => ({
              label:
                column.cardLabel ??
                (typeof column.header === "string" ? column.header : column.key),
              value: column.render(row),
            }))}
            actions={rowActions?.(row)}
          />
        ))}
      </div>
    </div>
  );
}

function LinkCell({
  href,
  linkComponent: Link,
  children,
}: {
  href: string;
  linkComponent: LinkLike;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
}

/**
 * Ham `<table>` kullanan ekranlar için ortak sınıflar.
 *
 * 25 dosya bunu kullanıyor ve hepsini `DataTable`'a taşımak bu fazın işi
 * değildi (çoğu tek kullanımlık özet tablosu). Dikey boşluk artık yoğunluk
 * değişkenlerinden geliyor; böylece "sıkışık" tercihi bu tablolarda da
 * geçerli oluyor.
 */
export const tableClasses = {
  wrapper: "overflow-x-auto",
  table: "w-full border-collapse text-sm",
  thead: "border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle",
  th: "px-[var(--row-px)] py-[var(--head-py)] font-medium",
  tr: "border-b border-border last:border-0",
  td: "px-[var(--row-px)] py-[var(--row-py)] text-fg",
  tdMuted: "px-[var(--row-px)] py-[var(--row-py)] text-fg-muted",
  tdNum: "px-[var(--row-px)] py-[var(--row-py)] text-right tabular-nums text-fg",
  empty: "px-4 py-8 text-center text-fg-subtle",
} as const;
