"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "../cn";

/**
 * Liste araç çubuğu — GAP 4.3.1 (arama + filtre çipleri).
 *
 * Durum URL'de tutulur: arama alanı 350 ms debounce ile `onQueryChange`
 * çağırır, sayfa bunu `router.replace` ile querystring'e yazar. Böylece
 * filtreli liste paylaşılabilir ve sunucu tarafında sayfalanır — istemcide
 * 200 satır tutmaya gerek kalmaz.
 */
export function ListToolbar({
  defaultQuery = "",
  onQueryChange,
  placeholder,
  clearLabel = "Temizle",
  searchable = true,
  children,
  trailing,
}: {
  defaultQuery?: string;
  onQueryChange: (query: string) => void;
  placeholder: string;
  clearLabel?: string;
  /**
   * Arama kutusunu gizler.
   *
   * Her liste ucu arama kabul etmiyor (örn. borçların daire özeti bir toplam
   * görünümü). Çalışmayan bir arama kutusu göstermek, kullanıcıya olmayan bir
   * yetenek vaat etmek olurdu — filtreler tek başına da anlamlı.
   */
  searchable?: boolean;
  /** Filtre kontrolleri (select, çipler). */
  children?: ReactNode;
  /** Sağ uçta ek aksiyon (dışa aktar, sütun seçimi). */
  trailing?: ReactNode;
}) {
  const [value, setValue] = useState(defaultQuery);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(onQueryChange);
  latest.current = onQueryChange;

  useEffect(() => () => clearTimeout(timer.current), []);

  function update(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(next), 350);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {searchable ? (
        <div className="relative min-w-48 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            type="search"
            value={value}
            onChange={(event) => update(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="w-full rounded-lg border border-border-strong bg-surface py-2 pl-9 pr-9 text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          {value ? (
            <button
              type="button"
              onClick={() => update("")}
              aria-label={clearLabel}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}
      {children}
      {trailing ? <div className="ml-auto flex items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

/**
 * Toplu seçim aksiyon çubuğu — GAP 4.2.6.
 *
 * Seçim varken ekranın altında sabitlenir (mobilde de erişilebilir).
 * Aksiyonların kendisi Server Action'a bağlanır; bu bileşen yalnızca
 * seçili kimlikleri gizli input olarak forma taşır.
 */
export function BulkActionBar({
  selected,
  onClear,
  labels,
  children,
}: {
  selected: string[];
  onClear: () => void;
  labels: { selected: string; clear: string };
  children: ReactNode;
}) {
  if (selected.length === 0) return null;

  return (
    <div
      role="region"
      aria-label={labels.selected}
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 motion-safe:animate-[overlay-slide-up_160ms_ease-out]"
    >
      <div className="pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-raised p-3 shadow-xl">
        <span className="text-sm font-semibold text-fg">{labels.selected}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {children}
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg px-2 py-1.5 text-sm text-fg-muted hover:bg-hover hover:text-fg"
          >
            {labels.clear}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Tablo satırı seçim kutusu — başlıkta "tümünü seç" için de kullanılır. */
export function SelectCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked;
  }, [indeterminate, checked]);

  // Görünen kutu 16 px kalıyor; dolgulu etiket tıklama alanını 28 px'e
  // çıkarıyor (WCAG 2.2 — 2.5.8 hedef boyutu, en az 24×24).
  return (
    <label className="-m-1.5 inline-flex cursor-pointer items-center justify-center p-1.5">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
        className="h-4 w-4 cursor-pointer rounded border-border-strong accent-primary"
      />
    </label>
  );
}

/**
 * Mobil veri kartı — GAP 4.4.4.
 *
 * `< md` genişlikte tablolar yatay kaydırma yerine karta dönüşür.
 * Kullanım: tabloyu `hidden md:block`, kart listesini `md:hidden` sar.
 */
export function DataCard({
  title,
  subtitle,
  href,
  badge,
  rows,
  actions,
  leading,
  linkComponent: Link,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  href?: string;
  badge?: ReactNode;
  rows: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  leading?: ReactNode;
  linkComponent?: (props: { href: string; className?: string; children: ReactNode }) => ReactNode;
}) {
  const heading = (
    <>
      <span className="block truncate text-sm font-semibold text-fg">{title}</span>
      {subtitle ? <span className="block truncate text-xs text-fg-muted">{subtitle}</span> : null}
    </>
  );

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start gap-2">
        {leading}
        <div className="min-w-0 flex-1">
          {href && Link ? (
            <Link href={href} className="block rounded hover:underline">
              {heading}
            </Link>
          ) : (
            heading
          )}
        </div>
        {badge}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{row.label}</dt>
            <dd className="truncate text-sm text-fg">{row.value}</dd>
          </div>
        ))}
      </dl>
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Filtre grubu etiketi + kontrol sarmalayıcı (araç çubuğu içinde). */
export function ToolbarSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className={cn(
          "rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm text-fg",
          "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40",
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
