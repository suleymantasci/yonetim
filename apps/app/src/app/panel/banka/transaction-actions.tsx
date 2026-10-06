"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Input, useToast } from "@yonetim/ui";

import { confirmBankTransaction, ignoreBankTransaction } from "./actions";

/**
 * Hareket satırı eylemleri: önerilen daireyi onayla (tahsilat açar) / yok say.
 *
 * Onay yalnız **öneri varken** (`canConfirm`): daire seçimi gerektiren
 * eşleşmemiş hareket için elle tahsilat ekranı kullanılıyor; burada daire
 * listesi taşımak satırı ağırlaştırırdı. Yok saymak gerekçe istiyor ve
 * `window.prompt` yerine satır içi alan: tarayıcı diyalogları otomasyonu ve
 * ekran okuyucuyu kilitliyor.
 */
export function TransactionActions({
  id,
  canConfirm,
}: {
  id: string;
  canConfirm: boolean;
}) {
  const t = useTranslations("app.bank");
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [ignoring, setIgnoring] = useState(false);
  const [reason, setReason] = useState("");

  const run = (job: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await job();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      if (result.ok) {
        setIgnoring(false);
        setReason("");
        router.refresh();
      }
    });

  if (ignoring) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("ignoreReasonPlaceholder")}
          aria-label={t("ignoreReasonPlaceholder")}
          maxLength={300}
          className="h-8 w-44"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => ignoreBankTransaction(id, reason))}
          className="rounded-lg border border-border-strong px-2 py-1 text-xs font-medium hover:bg-hover disabled:opacity-50"
        >
          {t("ignore")}
        </button>
        <button
          type="button"
          onClick={() => setIgnoring(false)}
          className="text-xs text-fg-subtle hover:text-fg"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {canConfirm ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => confirmBankTransaction(id))}
          className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
        >
          {t("confirm")}
        </button>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => setIgnoring(true)}
        className="rounded-lg border border-border-strong px-2.5 py-1 text-xs font-medium hover:bg-hover disabled:opacity-50"
      >
        {t("ignore")}
      </button>
    </div>
  );
}
