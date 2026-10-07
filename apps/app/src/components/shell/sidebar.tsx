"use client";

import {
  Activity, BadgeCheck, Banknote, Building2, CalendarClock, ChevronDown, ClipboardList, Cog, FileText,
  Gauge, Gavel, Handshake, LayoutDashboard, LineChart, Megaphone, MessageSquare, Package, Pin, PinOff,
  Receipt, Scale, ScrollText, ShieldCheck, Sparkles, Store, Truck, Users, Vote, Wallet, Wrench, X,
  Landmark, PiggyBank,
} from "lucide-react";
import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType } from "react";

import { cn } from "@yonetim/ui";

import type { NavGroup } from "./nav";

/**
 * Panel kenar menüsü — GAP 4.4.1 / 4.4.2.
 *
 * TEK BİLEŞEN, İKİ GÖRÜNÜM: masaüstünde kalıcı (`lg:` ve üstü), mobilde
 * soldan açılan çekmece. Aynı işaretleme kullanıldığı için aktif link,
 * rozet ve pin davranışı iki yerde ayrı ayrı bakım gerektirmez.
 *
 * Çekmece davranışı: backdrop tıklaması ve ESC kapatır, rota değişince
 * kendiliğinden kapanır, açıkken gövde kaydırması kilitlenir ve odak
 * çekmecenin içinde döner.
 *
 * Sık kullanılanlar `localStorage`'da tutulur — sunucu tarafı tercihi
 * gerektirmeyen, kullanıcıya özel ve kaybı zararsız bir veri.
 */

const PIN_STORAGE_KEY = "yonetim.sidebar.pins";
const COLLAPSE_STORAGE_KEY = "yonetim.sidebar.collapsed";

const ICONS: Record<string, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  dashboard: LayoutDashboard,
  units: Building2,
  residents: Users,
  migration: Truck,
  duesPlans: Wallet,
  debts: Receipt,
  certificate: BadgeCheck,
  expenses: Banknote,
  bank: LineChart,
  simulator: Sparkles,
  announcements: Megaphone,
  polls: Vote,
  meetings: Handshake,
  messages: MessageSquare,
  requests: ClipboardList,
  maintenance: Wrench,
  meters: Gauge,
  reservations: CalendarClock,
  staff: Users,
  documents: FileText,
  legal: Gavel,
  kvkk: ShieldCheck,
  audit: ScrollText,
  reports: Activity,
  settings: Cog,
  vendors: Store,
  frontdesk: Package,
  accounting: Scale,
  cash: Landmark,
  budget: PiggyBank,
};

export interface SidebarItem {
  href: string;
  key: string;
  label: string;
  group: NavGroup;
  badgeCount?: number;
  /** Rozet acil mi (SLA ihlali, gecikmiş bakım) — renk buna göre. */
  badgeTone?: "danger" | "warning" | "info";
}

export interface SidebarProps {
  items: SidebarItem[];
  groupLabels: Record<NavGroup, string>;
  groupOrder: NavGroup[];
  labels: {
    modules: string;
    pinned: string;
    pin: string;
    unpin: string;
    close: string;
  };
  header: React.ReactNode;
  /** Mobil çekmece durumu — `AppHeader` tarafından kontrol edilir. */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({
  items,
  groupLabels,
  groupOrder,
  labels,
  header,
  open,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const [pins, setPins] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<NavGroup[]>([]);

  // Tercihler yalnız istemcide okunur; ilk render sunucu ile aynı kalır.
  useEffect(() => {
    try {
      const rawPins = localStorage.getItem(PIN_STORAGE_KEY);
      if (rawPins) setPins(JSON.parse(rawPins) as string[]);
      const rawCollapsed = localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (rawCollapsed) setCollapsed(JSON.parse(rawCollapsed) as NavGroup[]);
    } catch {
      // Bozuk/erişilemez depolama sessizce yok sayılır — menü çalışmaya devam eder.
    }
  }, []);

  // Rota değişince çekmece kapanır.
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız pathname tetiklemeli
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  function togglePin(key: string) {
    setPins((current) => {
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      try {
        localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* depolama kotası — pin oturumluk kalır */
      }
      return next;
    });
  }

  function toggleGroup(group: NavGroup) {
    setCollapsed((current) => {
      const next = current.includes(group)
        ? current.filter((g) => g !== group)
        : [...current, group];
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* yok sayılır */
      }
      return next;
    });
  }

  const isActive = (href: string) =>
    pathname === href || (href !== "/panel" && pathname.startsWith(`${href}/`));

  const grouped = useMemo(
    () =>
      groupOrder
        .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
        .filter((entry) => entry.items.length > 0),
    [groupOrder, items],
  );

  const pinnedItems = pins
    .map((key) => items.find((item) => item.key === key))
    .filter((item): item is SidebarItem => item !== undefined);

  const nav = (
    <nav aria-label={labels.modules} className="space-y-4 p-3">
      {pinnedItems.length > 0 ? (
        <div>
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            {labels.pinned}
          </div>
          <ul className="space-y-0.5">
            {pinnedItems.map((item) => (
              <SidebarLink
                key={`pinned-${item.key}`}
                item={item}
                active={isActive(item.href)}
                pinned
                onTogglePin={() => togglePin(item.key)}
                labels={labels}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {grouped.map((entry) => {
        const isCollapsed = collapsed.includes(entry.group);
        const groupBadge = entry.items.reduce((sum, item) => sum + (item.badgeCount ?? 0), 0);
        return (
          <div key={entry.group}>
            <button
              type="button"
              onClick={() => toggleGroup(entry.group)}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center gap-1 rounded px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle transition-colors hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown
                aria-hidden
                className={cn("h-3 w-3 transition-transform", isCollapsed && "-rotate-90")}
              />
              {groupLabels[entry.group]}
              {isCollapsed && groupBadge > 0 ? (
                <span className="ml-auto rounded-full bg-danger-soft px-1.5 text-[10px] font-bold text-danger-fg">
                  {groupBadge}
                </span>
              ) : null}
            </button>
            {isCollapsed ? null : (
              <ul className="space-y-0.5">
                {entry.items.map((item) => (
                  <SidebarLink
                    key={item.key}
                    item={item}
                    active={isActive(item.href)}
                    pinned={pins.includes(item.key)}
                    onTogglePin={() => togglePin(item.key)}
                    labels={labels}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Masaüstü: kalıcı sütun */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
        <div className="sticky top-0 max-h-dvh overflow-y-auto">
          {header}
          {nav}
        </div>
      </aside>

      {/* Mobil: çekmece + backdrop */}
      {open ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label={labels.close}
            onClick={onClose}
            className="absolute inset-0 bg-overlay motion-safe:animate-[overlay-fade_120ms_ease-out]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={labels.modules}
            className="relative flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-surface shadow-xl motion-safe:animate-[overlay-slide-left_180ms_ease-out]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">{header}</div>
              <button
                type="button"
                onClick={onClose}
                aria-label={labels.close}
                className="m-3 rounded-lg p-1.5 text-fg-subtle hover:bg-hover hover:text-fg"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}
    </>
  );
}

function SidebarLink({
  item,
  active,
  pinned,
  onTogglePin,
  labels,
}: {
  item: SidebarItem;
  active: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  labels: { pin: string; unpin: string };
}) {
  const Icon = ICONS[item.key] ?? LayoutDashboard;
  const badgeTone = item.badgeTone ?? "info";

  return (
    <li className="group relative">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg py-[var(--row-py)] pl-3 pr-8 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-selected font-semibold text-fg before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-primary"
            : "text-fg-muted hover:bg-hover hover:text-fg",
        )}
      >
        <Icon
          aria-hidden
          className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-fg-subtle")}
        />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.badgeCount && item.badgeCount > 0 ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 text-[10px] font-bold tabular-nums",
              badgeTone === "danger" && "bg-danger-soft text-danger-fg",
              badgeTone === "warning" && "bg-warning-soft text-warning-fg",
              badgeTone === "info" && "bg-primary-soft text-primary-soft-fg",
            )}
          >
            {item.badgeCount > 99 ? "99+" : item.badgeCount}
          </span>
        ) : null}
      </Link>
      <button
        type="button"
        onClick={onTogglePin}
        aria-label={pinned ? labels.unpin : labels.pin}
        title={pinned ? labels.unpin : labels.pin}
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle transition-opacity hover:bg-hover hover:text-fg",
          pinned ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
        )}
      >
        {pinned ? (
          <PinOff aria-hidden className="h-3 w-3" />
        ) : (
          <Pin aria-hidden className="h-3 w-3" />
        )}
      </button>
    </li>
  );
}
