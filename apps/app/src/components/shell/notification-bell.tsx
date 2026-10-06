"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "@/components/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { Badge, cn } from "@yonetim/ui";

/**
 * Bildirim merkezi — GAP 4.6.5.
 *
 * Uygulama içi bildirimler `notifications` tablosundaki `channel = 'in_app'`
 * satırlarıdır; okunma `read_at` ile işaretlenir. Panel açılışında sunucu ilk
 * sayfayı verir, "okundu" işlemleri Server Action ile yürür — polling yok
 * (kalıcı bağlantı maliyeti bu ölçekte gereksiz; sayfa gezinmesi tazeliyor).
 */

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  read: boolean;
  href: string | null;
  category: "debt" | "request" | "announcement" | "system";
}

export function NotificationBell({
  items,
  unreadCount,
  markAllRead,
  markRead,
  labels,
}: {
  items: NotificationItem[];
  unreadCount: number;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  labels: {
    trigger: string;
    title: string;
    empty: string;
    markAll: string;
    viewAll: string;
    category: Record<NotificationItem["category"], string>;
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={
          unreadCount > 0 ? `${labels.trigger} (${unreadCount})` : labels.trigger
        }
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong text-fg-muted hover:bg-hover hover:text-fg"
      >
        <Bell aria-hidden className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-primary-fg">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-fg">{labels.title}</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => void markAllRead())}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-50"
              >
                <CheckCheck aria-hidden className="h-3.5 w-3.5" />
                {labels.markAll}
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-fg-subtle">{labels.empty}</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {items.map((item) => {
                const content = (
                  <>
                    <div className="flex items-start gap-2">
                      {item.read ? null : (
                        <span
                          aria-hidden
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              "truncate text-sm",
                              item.read ? "text-fg-muted" : "font-semibold text-fg",
                            )}
                          >
                            {item.title}
                          </span>
                          <time className="shrink-0 text-[11px] tabular-nums text-fg-subtle">
                            {item.createdAt}
                          </time>
                        </div>
                        {item.body ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{item.body}</p>
                        ) : null}
                        <Badge tone="neutral" className="mt-1.5">
                          {labels.category[item.category]}
                        </Badge>
                      </div>
                    </div>
                  </>
                );

                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        onClick={() => {
                          setOpen(false);
                          if (!item.read) startTransition(() => void markRead(item.id));
                        }}
                        className="block px-3 py-2.5 hover:bg-hover"
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.read) startTransition(() => void markRead(item.id));
                        }}
                        className="block w-full px-3 py-2.5 text-left hover:bg-hover"
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
