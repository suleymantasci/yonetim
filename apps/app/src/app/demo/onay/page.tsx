import { getTranslations } from "next-intl/server";

import { BrandMark } from "@yonetim/ui";

import { ConfirmView } from "./confirm-view";

/**
 * Onay bağlantısının açıldığı sayfa: `/demo/onay#t=<token>`.
 *
 * Token adresin parça (#) kısmında: tarayıcı onu sunucuya hiç göndermiyor,
 * erişim kayıtlarında ve Referer başlığında görünmüyor. Sayfa onu istemcide
 * okuyup sunucu eylemiyle API'ye iletiyor.
 */
export async function generateMetadata() {
  const t = await getTranslations("app.demoConfirm");
  return { title: t("title"), robots: { index: false }, referrer: "no-referrer" as const };
}

export default function DemoConfirmPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mx-auto mb-6 w-fit">
          <BrandMark size={44} />
        </div>
        <ConfirmView />
      </div>
    </div>
  );
}
