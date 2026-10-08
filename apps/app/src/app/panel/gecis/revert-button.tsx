"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog, useToast } from "@yonetim/ui";

import { revertMigration } from "./actions";

/** Aktarım geçmişinde "Geri al" — onaylı; tahsilat görmüş aktarımda API reddeder. */
export function RevertMigrationButton({ jobId }: { jobId: string }) {
  const t = useTranslations("app.migration");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-border-strong px-2 py-1 text-xs font-semibold text-fg hover:bg-hover"
      >
        {t("revert")}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("revertTitle")}
        description={t("revertDescription")}
        confirmLabel={t("revert")}
        cancelLabel={tCommon("action.cancel")}
        pending={pending}
        onConfirm={() =>
          start(async () => {
            const result = await revertMigration(jobId);
            if (result.ok) toast.success(result.message);
            else toast.error(result.message);
            setOpen(false);
            router.refresh();
          })
        }
      />
    </>
  );
}
