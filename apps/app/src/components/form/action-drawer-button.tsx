"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { Alert, Drawer } from "@yonetim/ui";

import { ActionForm, type ServerAction } from "@/components/form/action-form";

/**
 * Satır düzeyinde "çekmecede küçük form" düğmesi — okuma düzelt/sil, belge
 * iptali, toplantı iptali, rezervasyon iptali gibi gerekçeli işlemler.
 *
 * `VoidPaymentButton` ile aynı desen; her ekran için ayrı bileşen yazmak
 * yerine form alanları `children` ile geliyor, eylem sunucu bileşeninden
 * prop olarak veriliyor (Server Action'lar istemciye geçirilebilir).
 */
export function ActionDrawerButton<T = undefined>({
  action,
  hidden,
  icon,
  label,
  title,
  description,
  warning,
  submitLabel,
  tone = "neutral",
  children,
}: {
  action: ServerAction<T>;
  /** Gizli alanlar (ör. `{ id }`). */
  hidden: Record<string, string>;
  /**
   * Render edilmiş ikon (`<Plus aria-hidden />`), bileşenin kendisi değil:
   * sunucu bileşeninden istemci bileşenine fonksiyon geçirilemiyor ve sayfa
   * "Functions cannot be passed directly to Client Components" ile çöküyordu.
   */
  icon?: ReactNode;
  label: string;
  title: string;
  description?: string;
  warning?: string;
  submitLabel: string;
  tone?: "neutral" | "danger" | "primary";
  children?: ReactNode;
}) {
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          tone === "primary"
            ? "inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            : tone === "danger"
              ? "inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong px-2.5 text-xs font-semibold text-danger-fg hover:bg-danger-soft"
              : "inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong px-2.5 text-xs font-semibold text-fg hover:bg-hover"
        }
      >
        {icon ? (
          <span aria-hidden className="inline-flex [&>svg]:h-3.5 [&>svg]:w-3.5">
            {icon}
          </span>
        ) : null}
        {label}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        closeLabel={tCommon("action.close")}
        padded={false}
      >
        <ActionForm
          action={action}
          submitLabel={submitLabel}
          onSuccess={() => setOpen(false)}
          layout="modal"
          onCancel={() => setOpen(false)}
        >
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <div className="space-y-4">
            {warning ? <Alert tone="warning">{warning}</Alert> : null}
            {children}
          </div>
        </ActionForm>
      </Drawer>
    </>
  );
}
