"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { ErrorState } from "@yonetim/ui";

/**
 * Panel hata sınırı — GAP 4.6.4 / TD-10.
 *
 * Kabuk (sidebar + header) ayakta kalır, yalnız içerik alanı hata ekranına
 * döner: kullanıcı başka bir modüle geçebilir, oturumu kaybetmez.
 *
 * `digest` Next.js'in ürettiği kararlı hata parmak izidir; sunucu logunda
 * aynı değerle eşleşir. Hata mesajının kendisi gösterilmez — üretimde
 * veritabanı/iç detay sızdırmamak için.
 */
export default function PanelError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const t = useTranslations("app.errorBoundary");

  useEffect(() => {
    console.error("[panel]", error);
  }, [error]);

  return (
    <div className="py-10">
      <ErrorState
        title={t("title")}
        description={t("description")}
        digest={error.digest}
        digestLabel={t("digestLabel")}
        retryLabel={t("retry")}
        onRetry={reset}
        secondaryAction={
          <Link
            href="/panel"
            className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold text-fg hover:bg-hover"
          >
            {t("backToDashboard")}
          </Link>
        }
      />
    </div>
  );
}
