"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import { Input, Spinner, useToast } from "@yonetim/ui";

import type { ActionState } from "@/lib/form";

import { purgeDemo } from "./actions";

/**
 * "Şimdi sil" — iki adımlı: önce düğme, sonra demo kodunu yazarak onay.
 * Liste ekranında yanlış satıra tıklamak tek başına veri sildirmesin.
 */
export function PurgeDemoForm({ id, code }: { id: string; code: string }) {
  const t = useTranslations("app.platformDemo");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(purgeDemo, { status: "idle" });
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "ok") {
      if (state.message) toast.success(state.message);
      setOpen(false);
      router.refresh();
    } else if (state.status === "error" && state.message) {
      toast.error(state.message);
    }
    // toast/router kararlı; yalnız yeni sonuçta çalışsın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center rounded-lg border border-danger-fg/40 px-3 text-xs font-semibold text-danger-fg hover:bg-danger-soft"
      >
        {t("purge")}
      </button>
    );
  }

  return (
    <form action={action} className="w-64 max-w-full space-y-2">
      <input type="hidden" name="id" value={id} />
      <p className="text-xs text-fg-muted">{t("purgeHint", { code })}</p>
      <Input
        name="confirmCode"
        aria-label={t("purgeCode")}
        placeholder={code}
        autoComplete="off"
        required
        className="h-8 font-mono text-xs"
      />
      {state.status === "error" && state.message ? (
        <p role="alert" className="text-xs text-danger-fg">
          {state.message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-danger px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Spinner className="h-3 w-3" /> : null}
          {t("purgeSubmit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-xs text-fg hover:bg-hover"
        >
          ×
        </button>
      </div>
    </form>
  );
}
