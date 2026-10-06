import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@yonetim/ui";

/**
 * Yetkisiz sayfa — `requirePermission` sayfa render'ında `forbidden()`
 * çağırınca. Önceden rol izni yetmeyen her ekran genel "Bir şeyler ters
 * gitti + referans kodu" hata sınırına düşüyordu; kullanıcı bunu arıza
 * sanıyordu.
 */
export async function ForbiddenView() {
  const t = await getTranslations("app.forbiddenPage");

  return (
    <div className="py-10">
      <EmptyState
        title={t("title")}
        description={t("description")}
        action={
          <Link
            href="/panel"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            {t("back")}
          </Link>
        }
      />
    </div>
  );
}
