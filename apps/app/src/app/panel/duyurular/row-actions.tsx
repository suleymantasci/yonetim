"use client";

import Link from "@/components/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Drawer, Textarea } from "@yonetim/ui";

import { ActionButton } from "@/components/form/action-button";
import { ActionForm, FormField } from "@/components/form/action-form";

import { deleteAnnouncementDraft, withdrawAnnouncement } from "./actions";

/**
 * Duyuru satırı işlemleri. Taslak: düzenle, sil. Yayımlanmış: yayından kaldır
 * (gerekçeli). Yayımlanmış duyurunun metni değiştirilemez — sakinlere gitti.
 */
export function AnnouncementRowActions({
  id,
  published,
  withdrawn,
}: {
  id: string;
  published: boolean;
  withdrawn: boolean;
}) {
  const t = useTranslations("app.announcements");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  if (!published) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          href={`/panel/duyurular?duzenle=${id}`}
          className="inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-xs font-semibold text-fg hover:bg-hover"
        >
          {t("editDraft")}
        </Link>
        <ActionButton action={deleteAnnouncementDraft} fields={{ id }} label={t("deleteDraft")} tone="danger" />
      </div>
    );
  }
  if (withdrawn) return null;

  return (
    <>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-xs font-semibold text-fg hover:bg-hover"
        >
          {t("withdraw")}
        </button>
      </div>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t("withdrawTitle")}
        description={t("withdrawHint")}
        closeLabel={tCommon("action.close")}
        padded={false}
      >
        <ActionForm
          action={withdrawAnnouncement}
          submitLabel={t("withdraw")}
          onSuccess={() => setOpen(false)}
          layout="modal"
          onCancel={() => setOpen(false)}
        >
          <input type="hidden" name="id" value={id} />
          <FormField name="reason" label={t("withdrawReason")} required>
            <Textarea name="reason" rows={3} minLength={10} maxLength={500} required />
          </FormField>
        </ActionForm>
      </Drawer>
    </>
  );
}
