"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Spinner, cn, useToast } from "@yonetim/ui";

import type { ActionState } from "@/lib/form";

/**
 * Tek tıklık server action — onay ve alan gerektirmeyen, geri alınabilir
 * işlemler (kodu pasifleştir, kampanyayı duraklat).
 *
 * `ActionForm`'un çekmece/sayfa düzeni burada fazla; ama aynı sözleşme
 * korunuyor: sonuç toast'la, başarıda `router.refresh()`.
 */
export function ActionButton({
  action,
  fields,
  label,
  tone = "neutral",
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  tone?: "neutral" | "danger" | "primary";
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const data = new FormData();
          for (const [key, value] of Object.entries(fields)) data.set(key, value);
          const state = await action({ status: "idle" }, data);
          if (state.status === "ok") {
            if (state.message) toast.success(state.message);
            router.refresh();
          } else if (state.message) {
            toast.error(state.message);
          }
        })
      }
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-60",
        tone === "danger" && "border border-danger-fg/40 text-danger-fg hover:bg-danger-soft",
        tone === "primary" && "bg-primary text-primary-fg hover:bg-primary-hover",
        tone === "neutral" && "border border-border-strong text-fg hover:bg-hover",
      )}
    >
      {pending ? <Spinner className="h-3 w-3" /> : null}
      {label}
    </button>
  );
}
