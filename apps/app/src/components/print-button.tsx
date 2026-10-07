"use client";

import { Printer } from "lucide-react";

/** Sayfayı yazdır — hazirun cetveli gibi imzaya açılan çıktılar için. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover print:hidden"
    >
      <Printer aria-hidden className="h-4 w-4" />
      {label}
    </button>
  );
}
