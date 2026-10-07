"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FileInput, Spinner } from "@yonetim/ui";

import { finalizeAttachment, prepareAttachment } from "@/lib/attachments";

type Category = Parameters<typeof finalizeAttachment>[0]["category"];

/**
 * Form eki — dosya seçilince arka planda yüklenir, forma yalnız referansı
 * (`document:<id>`) gizli alan olarak yazılır.
 *
 * Depo kapalıysa ya da yükleme başarısız olursa form **engellenmez**: alan boş
 * kalır ve kısa bir not gösterilir. Depo açıldığında aynı bileşen hiçbir
 * değişiklik olmadan çalışır.
 */
export function AttachmentField({
  name,
  category,
  title,
  accept = "image/*,application/pdf",
  maxSizeMb = 20,
}: {
  /** Gizli alan adı — sunucu eylemi bunu bağlantı alanının yerine kullanır. */
  name: string;
  category: Category;
  /** Belgeler listesinde görünecek başlık (ör. "Gider faturası"). */
  title: string;
  accept?: string;
  maxSizeMb?: number;
}) {
  const t = useTranslations("common.attachment");
  const tCommon = useTranslations("common");
  const [ref, setRef] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "done" | "skipped" | "failed">("idle");

  async function upload(files: File[]) {
    setRef("");
    const file = files[0];
    if (!file) {
      setState("idle");
      return;
    }
    setState("uploading");
    try {
      const prepared = await prepareAttachment({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      if (prepared.status === "disabled") return setState("skipped");
      if (prepared.status !== "ok") return setState("failed");

      const put = await fetch(prepared.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type || "application/octet-stream" },
      }).catch(() => null);
      if (!put?.ok) return setState("failed");

      const created = await finalizeAttachment({
        key: prepared.key,
        title: `${title} · ${file.name}`.slice(0, 200),
        category,
      });
      if (created.status !== "ok") return setState("failed");
      setRef(created.ref);
      setState("done");
    } catch {
      setState("failed");
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={ref} />
      <FileInput
        accept={accept}
        maxSizeMb={maxSizeMb}
        onFilesChange={(files) => void upload(files)}
        labels={{
          prompt: t("prompt"),
          hint: t("hint", { size: maxSizeMb }),
          tooLarge: t("tooLarge", { size: maxSizeMb }),
          remove: tCommon("action.delete"),
        }}
      />
      <p aria-live="polite" className="mt-1 min-h-4 text-xs text-fg-subtle">
        {state === "uploading" ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner label={t("uploading")} />
            {t("uploading")}
          </span>
        ) : state === "done" ? (
          <span className="text-success-fg">{t("done")}</span>
        ) : state === "skipped" ? (
          t("skipped")
        ) : state === "failed" ? (
          t("failed")
        ) : null}
      </p>
    </div>
  );
}
