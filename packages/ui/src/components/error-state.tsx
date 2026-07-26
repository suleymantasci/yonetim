"use client";

import { AlertOctagon, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Hata ekranı — GAP 4.6.4.
 *
 * Next.js `error.tsx` sınırlarının paylaştığı gövde. İki şey yapar:
 * kullanıcıya anlaşılır bir çıkış yolu verir ("tekrar dene", "panele dön") ve
 * `digest` değerini gösterir — destek kaydında hangi hata olduğunu bulmanın
 * tek güvenli yolu bu, çünkü mesajın kendisi üretimde gizlenir.
 */
export function ErrorState({
  title,
  description,
  digest,
  digestLabel,
  retryLabel,
  onRetry,
  secondaryAction,
}: {
  title: string;
  description: string;
  digest?: string;
  digestLabel?: string;
  retryLabel: string;
  onRetry: () => void;
  secondaryAction?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-center rounded-lg border border-danger-border bg-danger-soft p-8 text-center"
    >
      <AlertOctagon aria-hidden className="h-8 w-8 text-danger" />
      <h2 className="mt-3 font-heading text-lg font-bold text-fg">{title}</h2>
      <p className="mt-1 text-sm text-fg-muted">{description}</p>

      {digest ? (
        <p className="mt-3 rounded border border-border bg-surface px-2 py-1 font-mono text-xs text-fg-subtle">
          {digestLabel}: {digest}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
        >
          <RotateCcw aria-hidden className="h-4 w-4" />
          {retryLabel}
        </button>
        {secondaryAction}
      </div>
    </div>
  );
}
