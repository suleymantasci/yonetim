"use client";

import { CalendarDays, StickyNote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Spinner, useToast } from "@yonetim/ui";

import Link from "@/components/link";
import type { ActionState } from "@/lib/form";

export interface NoteMenuItem {
  id: string;
  title: string;
  body: string | null;
  /** Biçimlenmiş gün (ör. "12.10.2026") ya da null. */
  day: string | null;
  unitLabel: string | null;
}

/**
 * Üst bardaki not menüsü — zilin yanında.
 *
 * Hızlı not: ilk satır başlık olur; gün seçilirse o gün 09:00'da zile
 * hatırlatma düşer. Liste ajandadaki son notlar (kişisel + paylaşılan);
 * tıklayınca takvimde o kayda gidilir.
 */
export function NotesMenu({
  notes,
  action,
  labels,
}: {
  notes: NoteMenuItem[];
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  labels: {
    trigger: string;
    title: string;
    placeholder: string;
    day: string;
    save: string;
    empty: string;
    openCalendar: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const router = useRouter();

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

  const submit = (data: FormData) =>
    startTransition(async () => {
      const state = await action({ status: "idle" }, data);
      if (state.status === "ok") {
        if (state.message) toast.success(state.message);
        formRef.current?.reset();
        router.refresh();
      } else if (state.message) {
        toast.error(state.message);
      }
    });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={labels.trigger}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong text-fg-muted hover:bg-hover hover:text-fg"
      >
        <StickyNote aria-hidden className="h-4 w-4" />
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg">
          <div className="border-b border-border px-3 py-2 text-sm font-semibold text-fg">{labels.title}</div>

          <form ref={formRef} action={submit} className="space-y-2 border-b border-border p-3">
            <label className="sr-only" htmlFor="quick-note-text">
              {labels.placeholder}
            </label>
            <textarea
              id="quick-note-text"
              name="text"
              required
              maxLength={5000}
              rows={3}
              placeholder={labels.placeholder}
              className="w-full resize-y rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none"
            />
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1 text-xs text-fg-subtle">
                {labels.day}
                <input
                  type="date"
                  name="day"
                  className="mt-0.5 block h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm text-fg"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
              >
                {pending ? <Spinner className="h-3 w-3" /> : null}
                {labels.save}
              </button>
            </div>
          </form>

          {notes.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-fg-subtle">{labels.empty}</p>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto">
              {notes.map((note) => (
                <li key={note.id}>
                  <Link
                    href={`/panel/takvim?kayit=${note.id}`}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2.5 hover:bg-hover"
                  >
                    <div className="truncate text-sm font-semibold text-fg">{note.title}</div>
                    {note.body ? <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{note.body}</p> : null}
                    {note.day || note.unitLabel ? (
                      <div className="mt-1 text-[11px] text-fg-subtle">
                        {[note.day, note.unitLabel].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/panel/takvim"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 border-t border-border px-3 py-2 text-sm font-semibold text-primary hover:bg-hover"
          >
            <CalendarDays aria-hidden className="h-4 w-4" />
            {labels.openCalendar}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
