"use client";

import { useTranslations } from "next-intl";

import type { RequestDetail } from "@yonetim/contracts";
import { Alert } from "@yonetim/ui";

import { RequestDetailPanel } from "../../../talepler/request-detail-panel";

/**
 * Çekmece içindeki talep detayı.
 *
 * Kayıt düzenleme formu **burada yok**, yalnız eylemler (durum, atama,
 * yorum) var. Sebep: çekmeceden bir talebe bakan kişi sırayla iş kapatıyor;
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
      <div className="p-5 sm:p-6">
        <Alert tone="info">{t("readOnlyNotice")}</Alert>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6">
      <RequestDetailPanel
        detail={detail}
        assignees={assignees}
        canAssign={canAssign}
      />
    </div>
  );
}
