"use client";

import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert, Drawer, Textarea } from "@yonetim/ui";

import { voidPayment } from "@/app/panel/borclar/actions";
import { ActionForm, FormField } from "@/components/form/action-form";

/**
 * Tahsilat iptali — elle girilmiş, tamamlanmış ödeme satırında.
 *
 * Gerekçe zorunlu ve denetim kütüğüne yazılıyor; ekran iptalin ne yaptığını
 * açıkça söylüyor (silmiyor, ters kayıt) ki yönetici "makbuzu sileyim"
 * beklentisiyle yanlış işlem yapmasın.
 */
export function VoidPaymentButton({
  paymentId,
  summary,
}: {
  paymentId: string;
  /** Çekmecede gösterilecek "₺1.250,00 · 03.10.2026 · Havale". */
  summary: string;
}) {
  const t = useTranslations("app.payments");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong px-2.5 text-xs font-semibold text-danger-fg hover:bg-danger-soft"
      >
        <Ban aria-hidden className="h-3.5 w-3.5" />
        {t("voidAction")}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t("voidTitle")}
        description={summary}
        closeLabel={tCommon("action.close")}
        padded={false}
      >
        <ActionForm
          action={voidPayment}
          submitLabel={t("voidConfirm")}
          onSuccess={() => setOpen(false)}
          layout="modal"
          onCancel={() => setOpen(false)}
        >
          <input type="hidden" name="paymentId" value={paymentId} />
          <div className="space-y-4">
            <Alert tone="warning" title={t("voidWarningTitle")}>
              {t("voidWarning")}
            </Alert>
            <FormField name="reason" label={t("voidReason")} hint={t("voidReasonHint")} required>
              <Textarea name="reason" rows={3} minLength={10} maxLength={500} required />
            </FormField>
          </div>
        </ActionForm>
      </Drawer>
    </>
  );
}
