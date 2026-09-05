import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Segment denetimi — iki-dört seçenek arasında geçiş (aylık/yıllık, görünüm
 * kipi, dönem aralığı).
 *
 * İKİ KİP:
 *  · `href` verilirse **bağlantı** üretir → durum URL'de kalır, paylaşılabilir,
 *    JS gerektirmez ve sunucu doğru sekmeyi render eder. Fiyatlandırma
 *    sayfasındaki dönem geçişi böyle çalışır.
 *  · `href` yoksa `role="radiogroup"` içinde buton üretir; durum çağıranındır.
 *
 * `linkComponent` enjeksiyonu `navigation.tsx` ile aynı gerekçe: paket Next'e
 * bağımlı değil.
 */

type AnchorLike = (props: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-current"?: "page";
  scroll?: boolean;
}) => ReactNode;

const defaultAnchor: AnchorLike = ({ href, className, children, ...rest }) => (
  <a href={href} className={className} {...rest}>
    {children}
  </a>
);

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  href?: string;
  /** Seçeneğin yanında görünen küçük etiket ("%20 indirim"). */
  badge?: ReactNode;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  /** Buton kipinde zorunlu; bağlantı kipinde kullanılmaz. */
  onChange?: (value: string) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
  linkComponent?: AnchorLike;
}

const SIZE = {
  sm: "text-xs px-3 py-1.5",
  md: "text-sm px-4 py-2",
} as const;

export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  size = "md",
  className,
  linkComponent: Link = defaultAnchor,
}: SegmentedControlProps) {
  const shell = cn(
    "inline-flex items-center gap-1 rounded-full bg-surface-sunken p-1",
    className,
  );

  const itemClass = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface-sunken",
      SIZE[size],
      active
        ? "bg-surface text-fg shadow-sm"
        : "text-fg-muted hover:text-fg",
    );

  const badge = (active: boolean, content: ReactNode) => (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-xs font-semibold",
        active ? "bg-success-soft text-success-fg" : "bg-surface text-fg-subtle",
      )}
    >
      {content}
    </span>
  );

  // Bağlantı kipi: gezinme olduğu için radyo grubu semantiği yanlış olurdu.
  if (options.every((option) => option.href)) {
    return (
      <nav aria-label={label} className={shell}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Link
              key={option.value}
              href={option.href!}
              aria-current={active ? "page" : undefined}
              scroll={false}
              className={itemClass(active)}
            >
              {option.label}
              {option.badge ? badge(active, option.badge) : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div role="radiogroup" aria-label={label} className={shell}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange?.(option.value)}
            className={itemClass(active)}
          >
            {option.label}
            {option.badge ? badge(active, option.badge) : null}
          </button>
        );
      })}
    </div>
  );
}
