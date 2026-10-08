import { getTranslations } from "next-intl/server";

import Link from "@/components/link";

export type EvrakTab = "notice" | "meeting" | "letter" | "labels";

/** Hukuki evrak sekmeleri. */
export async function EvrakNav({ active }: { active: EvrakTab }) {
  const t = await getTranslations("app.letters");
  const items: { key: EvrakTab; href: string }[] = [
    { key: "notice", href: "/panel/evrak" },
    { key: "meeting", href: "/panel/evrak/genel-kurul" },
    { key: "letter", href: "/panel/evrak/antetli" },
    { key: "labels", href: "/panel/evrak/etiket" },
  ];
  return (
    <nav aria-label={t("navLabel")} className="relative mb-4 flex gap-1 overflow-x-auto border-b border-border">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === active ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            item.key === active ? "border-primary text-fg" : "border-transparent text-fg-subtle hover:text-fg"
          }`}
        >
          {t(`tab.${item.key}`)}
        </Link>
      ))}
    </nav>
  );
}
