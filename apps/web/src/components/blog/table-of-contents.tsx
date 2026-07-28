"use client";

import { useEffect, useState } from "react";

import type { MarkdownHeading } from "@/lib/markdown";

/**
 * İçindekiler — okunan bölümü işaretler.
 *
 * BAĞLANTILAR SUNUCUDA DA DOĞRU: Liste `extractHeadings` çıktısından geliyor
 * ve kimlikler `renderMarkdown` ile aynı fonksiyondan üretiliyor. JavaScript
 * gelmezse bağlantılar yine çalışır; kaybolan tek şey "şu an buradasınız"
 * işareti.
 *
 * GÖZLEM PENCERESİ: `rootMargin` üst kenarı başlık yüksekliği kadar aşağı,
 * alt kenarı ekranın %70'i kadar yukarı çekiyor. Böylece "aktif" başlık,
 * ekranın üst şeridinde duran başlık oluyor; aksi hâlde uzun bir bölümün
 * ortasındayken bir sonraki başlık erkenden işaretleniyordu.
 */
export function TableOfContents({
  headings,
  label,
}: {
  headings: MarkdownHeading[];
  label: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        // Birden fazla başlık şeritteyse en yukarıdaki geçerli.
        const top = visible.reduce((best, entry) =>
          entry.boundingClientRect.top < best.boundingClientRect.top ? entry : best,
        );
        setActiveId(top.target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav aria-label={label} className="text-sm">
      <p className="font-heading text-xs font-bold uppercase tracking-wide text-fg-subtle">
        {label}
      </p>
      <ol className="mt-3 space-y-0.5 border-s border-border">
        {headings.map((heading) => {
          const active = heading.id === activeId;
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                aria-current={active ? "location" : undefined}
                className={
                  "-ms-px block border-s-2 py-1.5 pe-2 transition-colors " +
                  (heading.level === 3 ? "ps-7 text-xs" : "ps-4") +
                  (active
                    ? " border-primary font-medium text-fg"
                    : " border-transparent text-fg-muted hover:border-border-strong hover:text-fg")
                }
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
