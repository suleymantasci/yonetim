import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@yonetim/ui";

/** Panel içi 404 — kabuk korunur, kullanıcı modüle geri dönebilir. */
export default async function PanelNotFound() {
  const t = await getTranslations("app.notFound");

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
            {t("backToDashboard")}
          </Link>
        }
      />
    </div>
  );
}
