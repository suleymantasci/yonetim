import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Gezinme bileşenleri — GAP 4.3.1 (breadcrumb, sayfalama, sekme).
 *
 * Hepsi **sunucu bileşeni**: bağlantı tabanlı çalışırlar, JS gerektirmezler.
 * Sayfalama ve sekme durumu URL'de tutulur; böylece paylaşılabilir, geri
 * tuşuyla gezilebilir ve Server Component önbelleği bozulmaz.
 *
 * `linkComponent` ile Next `Link` enjekte edilir (paket Next'e bağımlı değil).
 */

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Enjekte edilen bağlantı bileşeninin tipi.
 *
 * Next'in `Link`'i bu tipe **doğrudan** uyar; çağrı yerlerindeki
 * `linkComponent={Link as never}` kaçamağı (Faz 3 hata listesi #9) gereksizdi
 * ve 11 dosyadan kaldırıldı. Kaçamağın maliyeti görünmezdi ama gerçekti:
 * `as never` yalnız bu uyumsuzluğu değil, ileride oluşabilecek **her**
 * uyumsuzluğu da susturuyordu.
 */
export type LinkLike = (props: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-current"?: "page";
  scroll?: boolean;
}) => ReactNode;

type AnchorLike = LinkLike;

const defaultAnchor: AnchorLike = ({ href, className, children, ...rest }) => (
  <a href={href} className={className} {...rest}>
    {children}
  </a>
);

export function Breadcrumb({
  items,
  label = "Konum",
  linkComponent: Link = defaultAnchor,
}: {
  items: Crumb[];
  label?: string;
  linkComponent?: AnchorLike;
}) {
  return (
    <nav aria-label={label} className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-fg-subtle">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <Link href={item.href} className="rounded hover:text-fg hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? "font-medium text-fg-muted" : undefined} aria-current={isLast ? "page" : undefined}>
                  {item.label}
                </span>
              )}
              {isLast ? null : <ChevronRight aria-hidden className="h-3 w-3" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  hrefFor,
  labels,
  linkComponent: Link = defaultAnchor,
}: {
  page: number;
  pageCount: number;
  total: number;
  hrefFor: (page: number) => string;
  labels: { previous: string; next: string; summary: string };
  linkComponent?: AnchorLike;
}) {
  if (pageCount <= 1) {
    return (
      <div className="flex items-center justify-end border-t border-border px-4 py-3 text-xs text-fg-subtle">
        {labels.summary}
      </div>
    );
  }

  const buttonClass =
    "inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong px-2.5 text-xs font-medium text-fg hover:bg-hover";
  const disabledClass = "pointer-events-none opacity-40";

  return (
    <nav
      aria-label={labels.summary}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3"
    >
      <span className="text-xs text-fg-subtle">{labels.summary}</span>
      <div className="flex items-center gap-2">
        <Link
          href={hrefFor(Math.max(1, page - 1))}
          className={cn(buttonClass, page <= 1 && disabledClass)}
          scroll={false}
        >
          <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
          {labels.previous}
        </Link>
        <span className="text-xs tabular-nums text-fg-muted">
          {page} / {pageCount}
        </span>
        <Link
          href={hrefFor(Math.min(pageCount, page + 1))}
          className={cn(buttonClass, page >= pageCount && disabledClass)}
          scroll={false}
        >
          {labels.next}
          <ChevronRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>
      <span className="sr-only">{total}</span>
    </nav>
  );
}

export interface TabItem {
  key: string;
  label: string;
  href: string;
  count?: number;
}

/** URL tabanlı sekmeler (detay sayfalarında: özet / borçlar / belgeler …). */
export function Tabs({
  items,
  activeKey,
  label = "Sekmeler",
  linkComponent: Link = defaultAnchor,
}: {
  items: TabItem[];
  activeKey: string;
  label?: string;
  linkComponent?: AnchorLike;
}) {
  return (
    <nav aria-label={label} className="-mb-px overflow-x-auto border-b border-border">
      <ul className="flex min-w-max gap-1">
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-fg"
                    : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {item.label}
                {item.count !== undefined ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                      active ? "bg-primary-soft text-primary-soft-fg" : "bg-surface-sunken text-fg-subtle",
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Sıralanabilir sütun başlığı — yön okunu ve `aria-sort`'u yönetir. */
export function SortableTh({
  label,
  columnKey,
  activeKey,
  direction,
  hrefFor,
  align = "left",
  linkComponent: Link = defaultAnchor,
  className,
}: {
  label: string;
  columnKey: string;
  activeKey?: string;
  direction?: "asc" | "desc";
  hrefFor: (key: string, direction: "asc" | "desc") => string;
  align?: "left" | "right";
  linkComponent?: AnchorLike;
  /** Verilirse varsayılan hücre sınıflarının **yerine** geçer (`DataTable`). */
  className?: string;
}) {
  const active = activeKey === columnKey;
  const nextDirection: "asc" | "desc" = active && direction === "asc" ? "desc" : "asc";

  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "desc" ? "descending" : "ascending") : "none"}
      className={cn(
        className ?? "px-[var(--row-px)] py-[var(--head-py)] font-medium",
        align === "right" && "text-right",
      )}
    >
      <Link
        href={hrefFor(columnKey, nextDirection)}
        scroll={false}
        className={cn(
          "inline-flex items-center gap-1 rounded hover:text-fg",
          active && "text-fg",
        )}
      >
        {label}
        <span aria-hidden className={cn("text-[10px]", !active && "opacity-30")}>
          {active && direction === "desc" ? "▼" : "▲"}
        </span>
      </Link>
    </th>
  );
}
