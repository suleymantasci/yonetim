"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@yonetim/ui";

export function PlatformNav({
  label,
  items,
}: {
  label: string;
  items: Array<{ href: string; label: string; exact?: boolean }>;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="order-last -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-medium",
              active ? "bg-primary-soft text-primary-soft-fg" : "text-fg-muted hover:bg-hover hover:text-fg",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
