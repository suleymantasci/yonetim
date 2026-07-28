"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * Pazarlama sitesi hata sınırı — daha önce hiç yoktu.
 *
 * `common` namespace'i kullanılıyor, `marketing` değil: hata sınırı bir
 * istemci bileşeni ve `tests/i18n-client.test.ts` yalnız `common`ı istemciye
 * göndermeye izin veriyor (19 kB'lık pazarlama paketini her ziyaretçiye
 * yollamamak için).
 *
 * Hata **mesajı** gösterilmiyor, yalnız `digest` referansı: mesaj sunucu
 * tarafı bir yığın izinden gelebiliyor ve dışarı sızmamalı.
 */
export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.errorPage");

  useEffect(() => {
    // Sunucu tarafı zaten Sentry'ye yazıyor; buradaki kayıt tarayıcı
    // konsolunda hata ayıklamak için.
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="font-heading text-3xl font-extrabold text-fg">{t("title")}</h1>
      <p className="mt-3 text-fg-muted">{t("body")}</p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
        >
          <RotateCcw aria-hidden className="h-4 w-4" />
          {t("retry")}
        </button>
        <a
          href="/"
          className="inline-flex items-center rounded-lg border border-border-strong px-5 py-3 text-sm font-medium text-fg transition-colors hover:bg-hover"
        >
          {t("home")}
        </a>
      </div>

      {error.digest ? (
        <p className="mt-8 text-xs text-fg-subtle">
          {t("reference")}: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
    </section>
  );
}
