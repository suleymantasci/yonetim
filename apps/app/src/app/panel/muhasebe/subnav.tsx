import { getTranslations } from "next-intl/server";

import Link from "@/components/link";

/** Muhasebe raporları arası gezinme — mizan, yevmiye, açılış fişi. */
export async function AccountingSubnav({ active }: { active: "mizan" | "journal" | "opening" }) {
  const t = await getTranslations("app.accounting");
  const items = [
    { key: "mizan", href: "/panel/muhasebe", label: t("tabMizan") },
    { key: "journal", href: "/panel/muhasebe/yevmiye", label: t("tabJournal") },
    { key: "opening", href: "/panel/muhasebe/acilis", label: t("tabOpening") },
  ] as const;
  return (
    <nav aria-label={t("title")} className="relative -mb-px mb-4 flex gap-1 overflow-x-auto border-b border-border print:hidden">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === active ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            item.key === active ? "border-primary text-fg" : "border-transparent text-fg-subtle hover:text-fg"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
