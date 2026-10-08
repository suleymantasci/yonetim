"use client";

import { useTranslations } from "next-intl";

import type { RequestDetail } from "@yonetim/contracts";
import { Alert } from "@yonetim/ui";

import { RequestDetailPanel } from "../../../talepler/request-detail-panel";

/**
 * Çekmece içindeki talep detayı.
 *
 * Kayıt düzenleme alanları **burada yok**, yalnız durum, atama ve yorum —
 * hepsi tek formda, tek "Kaydet". Sebep: çekmeceden bir talebe bakan kişi sırayla iş kapatıyor;
 * başlık/kategori düzeltmek nadir bir iş ve tam sayfa detayda duruyor.
 * İkisini de koymak çekmeceyi iki farklı niyetin çakıştığı bir yer yapardı.
 *
 * Çekmece kayıttan sonra **kapanmıyor**: durum değiştirip aynı talebe yorum
 * yazmak tek bir işin iki adımı. `router.refresh()` `ActionForm` tarafından
 * zaten yapılıyor, yani ekran güncel kalıyor.
 */
export function RequestDrawerFlow({
  detail,
  assignees,
  canWrite,
  canAssign,
}: {
  detail: RequestDetail;
  assignees: { id: string; name: string; role: string }[];
  canWrite: boolean;
  canAssign: boolean;
}) {
  const t = useTranslations("app.requests");

  if (!canWrite) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-6">
        <Alert tone="info">{t("readOnlyNotice")}</Alert>
      </div>
    );
  }

  // `layout="modal"`: alanlar kayar, tek "Kaydet" panelin alt kenarında.
  return (
    <RequestDetailPanel
      detail={detail}
      assignees={assignees}
      canAssign={canAssign}
      layout="modal"
    />
  );
}
