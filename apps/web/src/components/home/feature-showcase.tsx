"use client";

import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";

import { AnimatePresence, m } from "@/components/motion";

/**
 * Sekmeli özellik gösterimi.
 *
 * NEDEN SEKME: On özelliği alt alta on kutu olarak dizmek, ziyaretçiyi
 * okumaya değil kaydırmaya davet ediyor. Sekme, aynı içeriği bir seferde bir
 * fikir olacak şekilde sunuyor ve her fikrin yanında ne yaptığını gösteren
 * bir görsel bırakıyor.
 *
 * ERİŞİLEBİLİRLİK: Gerçek `tablist`/`tab`/`tabpanel` semantiği, ok tuşlarıyla
 * gezinme ve `aria-selected`. Panel içeriği DOM'da tek seferde bir tane;
 * hepsi birden basılıp gizlenseydi ekran okuyucu on kez aynı bölümü okurdu.
 *
 * SEO: Sekme içerikleri ana sayfada da metin olarak var; özellik başlıkları
 * ve açıklamaları `/ozellikler` sayfasında tam hâliyle duruyor — bu bölüm
 * o sayfanın yerine geçmiyor, ona köprü kuruyor.
 */

export interface ShowcaseItem {
  slug: string;
  title: string;
  description: string;
  detail: string;
}

export interface FeatureShowcaseProps {
  items: ShowcaseItem[];
  detailHref: string;
  detailLabel: string;
  tablistLabel: string;
}

export function FeatureShowcase({
  items,
  detailHref,
  detailLabel,
  tablistLabel,
}: FeatureShowcaseProps) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const current = items[active];

  // Ok tuşu dinleyicisi sekmelerin **kendisinde**: WAI-ARIA'da `tablist`
  // odaklanabilir değildir, odak dönüşümlü olarak sekmeler arasında gezer
  // (roving tabindex). Dinleyiciyi kaba koymak hem yanlış hem de
  // `jsx-a11y/interactive-supports-focus` kuralını kırıyordu.
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (active + delta + items.length) % items.length;
    setActive(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  if (!current) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-10">
      <div
        role="tablist"
        aria-label={tablistLabel}
        aria-orientation="vertical"
        className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        {items.map((item, index) => {
          const selected = index === active;
          return (
            <button
              key={item.slug}
              id={`${baseId}-tab-${index}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={onKeyDown}
              className={
                "relative shrink-0 rounded-xl px-4 py-3 text-start text-sm font-medium transition-colors " +
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-full " +
                (selected
                  ? "bg-surface text-fg shadow-sm"
                  : "text-fg-muted hover:bg-hover hover:text-fg")
              }
            >
              {/* Kayan gösterge `layoutId` isterdi; o da `domMax` özellik
                  paketini (~15 kB) zorunlu kılıyor. Sabit işaret aynı bilgiyi
                  taşıyor — sekmenin zemini zaten CSS ile yumuşak geçiyor. */}
              {selected ? (
                <span
                  aria-hidden
                  className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-primary"
                />
              ) : null}
              {item.title}
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${active}`}
        // `self-start`: panel içeriği kısa olduğunda ızgara onu sekme
        // listesinin boyuna esnetip yarısı boş bir kutu üretiyordu.
        className="self-start rounded-2xl border border-border bg-surface p-6 sm:p-8"
      >
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={current.slug}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <h3 className="font-heading text-xl font-bold text-fg">{current.title}</h3>
            <p className="mt-3 text-fg-muted">{current.description}</p>
            <p className="mt-4 rounded-xl border border-border bg-canvas p-4 text-sm leading-relaxed text-fg-muted">
              {current.detail}
            </p>
            <a
              href={`${detailHref}#${current.slug}`}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              {detailLabel}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </a>
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
