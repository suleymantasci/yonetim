"use client";

import { ArrowRight, CornerDownLeft, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { foldTurkish } from "@yonetim/core";
import { CommandOverlay, cn } from "@yonetim/ui";

/**
 * Komut paleti (⌘K / Ctrl+K) — GAP 4.3.1 / 4.4.2.
 *
 * 26 menü öğesi arasında fare ile gezinmek yavaş; palet sayfa **ve** hızlı
 * işlemleri tek arama alanında birleştirir.
 *
 * Arama Türkçe'ye duyarlı: `foldTurkish` ile "İ/ı/ş/ğ" farkları eritilir, yani
 * "sakin" yazarken "Sakinler", "gider" yazarken "Giderler" bulunur. Basit
 * alt-dizi eşleşmesi yeterli — liste sabit ve küçük, fuzzy kütüphanesi gereksiz.
 */

export interface PaletteEntry {
  id: string;
  label: string;
  group: string;
  href: string;
  keywords?: string;
  kind: "page" | "action";
}

export function CommandPalette({
  entries,
  labels,
}: {
  entries: PaletteEntry[];
  labels: {
    trigger: string;
    placeholder: string;
    empty: string;
    pages: string;
    actions: string;
    hintOpen: string;
    close: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      // "/" kısayolu yalnız bir metin alanına yazılmıyorken paleti açar.
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    const needle = foldTurkish(query.trim());
    if (!needle) return entries.slice(0, 12);
    return entries
      .map((entry) => {
        const haystack = foldTurkish(`${entry.label} ${entry.keywords ?? ""}`);
        const index = haystack.indexOf(needle);
        if (index === -1) return null;
        // Baştan eşleşme daha alakalı; hızlı işlemler sayfalardan önce gelir.
        return { entry, score: index + (entry.kind === "action" ? -2 : 0) };
      })
      .filter((hit): hit is { entry: PaletteEntry; score: number } => hit !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12)
      .map((hit) => hit.entry);
  }, [entries, query]);

  useEffect(() => setCursor(0), [query]);

  function go(entry: PaletteEntry | undefined) {
    if (!entry) return;
    setOpen(false);
    setQuery("");
    router.push(entry.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={labels.trigger}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong px-2.5 text-sm text-fg-subtle hover:bg-hover hover:text-fg md:min-w-52"
      >
        <Search aria-hidden className="h-4 w-4" />
        <span className="hidden md:inline">{labels.trigger}</span>
        <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </button>

      <CommandOverlay open={open} onOpenChange={setOpen} label={labels.trigger}>
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-fg-subtle" />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- palet açılışında odak beklenen davranış */}
          <input autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                go(results[cursor]);
              }
              // ESC artık Radix'in işi: odak tetikleyici düğmeye geri döner.
            }}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            aria-controls="command-palette-results"
            className="w-full bg-transparent py-3.5 text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-subtle">
            ESC
          </kbd>
        </div>

        <ul
          ref={listRef}
          id="command-palette-results"
          role="listbox"
          className="min-h-0 flex-1 overflow-y-auto py-1"
        >
          {results.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-fg-subtle">{labels.empty}</li>
          ) : (
            results.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(entry)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm",
                    index === cursor ? "bg-hover text-fg" : "text-fg-muted",
                  )}
                >
                  {entry.kind === "action" ? (
                    <Plus aria-hidden className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-fg-subtle" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.label}</span>
                  <span className="shrink-0 text-[11px] text-fg-subtle">{entry.group}</span>
                  {index === cursor ? (
                    <CornerDownLeft aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="shrink-0 border-t border-border bg-surface-sunken px-3 py-2 text-[11px] text-fg-subtle">
          {labels.hintOpen}
        </div>
      </CommandOverlay>
    </>
  );
}
