"use client";

import { Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input, cn } from "@yonetim/ui";
import Link from "../../../components/link";

export interface ReportNavigationItem {
  key: string;
  href: string;
  label: string;
}

export interface ReportNavigationGroup {
  key: string;
  label: string;
  items: ReportNavigationItem[];
}

function searchable(value: string) {
  return value
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i");
}

/** A compact current-report bar with a searchable, grouped report directory. */
export function ReportNavigator({
  active,
  groups,
  summary,
  labels,
}: {
  active: string;
  groups: ReportNavigationGroup[];
  summary: ReportNavigationItem;
  labels: {
    nav: string;
    choose: string;
    close: string;
    search: string;
    empty: string;
    clear: string;
  };
}) {
  const [open, setOpen] = useState(active === summary.key);
  const [query, setQuery] = useState("");
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const activeGroup = groups.find((group) =>
    group.items.some((item) => item.key === active),
  );
  const current = activeGroup?.items.find((item) => item.key === active);
  const needle = searchable(query.trim());
  const filtered = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        searchable(`${group.label} ${item.label}`).includes(needle),
      ),
    }))
    .filter((group) => group.items.length > 0);

  function close() {
    setOpen(false);
    setQuery("");
    toggleRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        panelRef.current?.contains(event.target as Node)
      ) {
        event.preventDefault();
        setOpen(false);
        setQuery("");
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <nav
      aria-label={labels.nav}
      className="mb-4 min-w-0 rounded-lg border border-border bg-surface print:hidden"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2 sm:px-3">
        <Link
          href={summary.href}
          aria-current={active === summary.key ? "page" : undefined}
          className={cn(
            "inline-flex min-h-9 shrink-0 items-center rounded px-2 text-sm font-semibold outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring",
            active === summary.key ? "bg-selected text-fg" : "text-fg-muted",
          )}
        >
          {summary.label}
        </Link>
        {current ? (
          <div className="order-3 flex w-full min-w-0 items-center gap-2 border-t border-border px-2 pt-2 text-sm sm:order-none sm:w-auto sm:flex-1 sm:border-0 sm:p-0">
            <ChevronRight
              aria-hidden
              className="hidden h-3.5 w-3.5 shrink-0 text-fg-subtle sm:block"
            />
            <span className="shrink-0 text-xs text-fg-subtle">
              {activeGroup?.label}
            </span>
            <span aria-hidden className="text-fg-subtle">
              /
            </span>
            <span className="min-w-0 font-semibold text-fg">
              {current.label}
            </span>
          </div>
        ) : null}
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            if (open) close();
            else {
              setOpen(true);
              requestAnimationFrame(() =>
                searchRef.current?.querySelector("input")?.focus(),
              );
            }
          }}
          className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-3 rounded-lg border border-border-strong bg-surface px-3 pr-2.5 text-sm font-medium text-fg transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? labels.close : labels.choose}
          <ChevronDown
            aria-hidden
            className={cn(
              "h-4 w-4 text-fg-subtle transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      <div
        id={panelId}
        hidden={!open}
        ref={panelRef}
        className="border-t border-border"
      >
        <div ref={searchRef} className="relative m-3 sm:max-w-sm">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.search}
            aria-label={labels.search}
            className="h-9 pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              aria-label={labels.clear}
              onClick={() => {
                setQuery("");
                searchRef.current?.querySelector("input")?.focus();
              }}
              className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-fg-subtle hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {filtered.length ? (
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-3 pb-3 sm:grid-cols-2 xl:grid-cols-4">
            {filtered.map((group) => (
              <section
                key={group.key}
                aria-labelledby={`${panelId}-${group.key}`}
                className="min-w-0"
              >
                <h2
                  id={`${panelId}-${group.key}`}
                  className="mb-1 border-b border-border px-2 pb-2 text-xs font-semibold text-fg-muted"
                >
                  {group.label}
                </h2>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        prefetch={false}
                        aria-current={active === item.key ? "page" : undefined}
                        className={cn(
                          "flex min-h-9 items-center justify-between gap-2 rounded px-2 py-2 text-sm outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring",
                          active === item.key
                            ? "bg-selected font-semibold text-fg"
                            : "text-fg-muted",
                        )}
                      >
                        <span className="min-w-0">{item.label}</span>
                        {active === item.key ? (
                          <Check
                            aria-hidden
                            className="h-4 w-4 shrink-0 text-primary"
                          />
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p role="status" className="px-5 pb-4 text-sm text-fg-subtle">
            {labels.empty}
          </p>
        )}
      </div>
    </nav>
  );
}
