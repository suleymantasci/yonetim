"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useToast } from "@yonetim/ui";

import { documentDownloadUrl, removeDocument } from "./actions";

/**
 * Satır eylemleri: indir ve kaldır.
 *
 * İNDİRME ADRESİ TIKLAMADA ÜRETİLİYOR. Listeyle birlikte gönderilseydi sayfa
 * kaynağında onlarca imzalı bağlantı dururdu — birkaç dakika geçerli, ama o
 * dakikalarda kopyalanıp paylaşılabilir. Kullanıcı tıkladığında imzalamak,
 * adresin ömrünü gerçekten ihtiyaç duyulan ana sıkıştırıyor.
 */
export function DocumentRowActions({
  id,
  canWrite,
}: {
  id: string;
  canWrite: boolean;
}) {
  const t = useTranslations("app.documents");
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("id", id);
      const state = await documentDownloadUrl({ status: "idle" }, form);
      if (state.status !== "ok" || !state.data) {
        toast.error(state.message || t("downloadFailed"));
        return;
      }
      // `noopener`: imzalı adres yeni sekmede açılıyor ve o sekme bizim
      // pencereye erişemiyor.
      window.open(state.data.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("id", id);
      const state = await removeDocument({ status: "idle" }, form);
      if (state.status !== "ok") {
        toast.error(state.message || t("removeFailed"));
        return;
      }
      toast.success(state.message ?? t("removed"));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex gap-2">
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-fg hover:bg-hover disabled:opacity-60"
      >
        {t("download")}
      </button>
      {canWrite ? (
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-danger-fg hover:bg-hover disabled:opacity-60"
        >
          {t("remove")}
        </button>
      ) : null}
    </span>
  );
}
