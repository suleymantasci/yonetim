"use client";

import { ArrowUpRight, Check, MessageCircle } from "lucide-react";

import { Counter } from "@yonetim/ui/motion";

import { m } from "@/components/motion";

/**
 * Hero'daki canlı ürün gösterimi.
 *
 * NEDEN EKRAN GÖRÜNTÜSÜ DEĞİL: Bir PNG, tema değiştiğinde yanlış renkte kalır,
 * dilde donar, retina'da bulanıklaşır ve ürün her değiştiğinde bayatlar.
 * Burada gösterilen şey gerçek token'larla, gerçek tipografiyle kurulmuş
 * bileşenler — yani ziyaretçinin gördüğü arayüz, panelde göreceğiyle aynı.
 *
 * VERİ TEMSİLİ: Rakamlar örnek; "gerçek müşteri verisi" gibi sunulmuyor.
 * Bölümün başlığı ve `aria-label` bunu açıkça söylüyor.
 *
 * PERFORMANS: LCP öğesi bu değil — hero başlığı ve birincil buton sunucuda
 * render ediliyor. Burası hidrasyondan sonra canlanır.
 */

export interface ProductMockLabels {
  /** Ekran okuyucu için: "Ürün arayüzü önizlemesi (örnek veri)". */
  caption: string;
  collectionRate: string;
  collected: string;
  openRequests: string;
  trend: string;
  chatPrompt: string;
  chatReply: string;
  /**
   * Örnek daire satırları. Kişi adı **kullanılmıyor**: uydurma isimler
   * gerçek müşteri verisi izlenimi yaratıyor ve KVKK açısından da gereksiz
   * bir çağrışım. Daire no + tutar aynı işi görüyor.
   */
  units: Array<{ door: string; amount: string; state: "paid" | "due" }>;
  paid: string;
  due: string;
}

/** Örnek tahsilat eğrisi — 12 ay, 0-1 aralığında normalize. */
const CURVE = [0.34, 0.41, 0.38, 0.52, 0.58, 0.55, 0.67, 0.72, 0.7, 0.81, 0.88, 0.94];

const WIDTH = 320;
const HEIGHT = 72;

function areaPath(values: number[]): { line: string; area: string } {
  const step = WIDTH / (values.length - 1);
  const points = values.map((value, index) => [index * step, HEIGHT - value * (HEIGHT - 6) - 3]);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x!.toFixed(1)},${y!.toFixed(1)}`).join(" ");
  return { line, area: `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z` };
}

export function ProductMock({ locale, labels }: { locale: string; labels: ProductMockLabels }) {
  const { line, area } = areaPath(CURVE);

  return (
    <figure
      className="relative rounded-3xl border border-border bg-surface p-4 shadow-lg transition-all duration-300 hover:border-border-strong sm:p-5"
      aria-label={labels.caption}
    >
      {/* Pencere çubuğu — Tarayıcı / İşletim Sistemi Hissi */}
      <div className="mb-4 flex items-center justify-between border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-surface-sunken px-3 py-1 text-xs font-mono text-fg-subtle">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span>yonetimcell.app / canlı mizan</span>
        </div>
        <div className="text-xs font-medium text-fg-subtle">
          SLA &lt; 4s
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-5">
        <div className="space-y-4 sm:col-span-3">
          <div className="rounded-xl bg-surface-sunken/50 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-fg-muted">{labels.collectionRate}</p>
                <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-fg">
                  <Counter value={94} locale={locale} suffix="%" />
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-success-fg">
                  <ArrowUpRight aria-hidden className="h-3 w-3" />
                  {labels.trend}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-fg-muted">{labels.openRequests}</p>
                <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-fg">
                  <Counter value={3} locale={locale} />
                </p>
                <p className="mt-1 text-xs text-fg-subtle">SLA 4s</p>
              </div>
            </div>

            <div className="mt-5 border-t border-border/70 pt-4">
              <p className="text-xs font-medium text-fg-muted">{labels.collected}</p>
              <p className="mt-0.5 font-heading text-xl font-bold tabular-nums text-fg">
                <Counter
                  value={182450}
                  locale={locale}
                  format={{ style: "currency", currency: "TRY", maximumFractionDigits: 0 }}
                />
              </p>
              <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="mt-2 w-full"
                role="img"
                aria-label={labels.collected}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="mock-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={area} fill="url(#mock-area)" />
                <m.path
                  d={line}
                  fill="none"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="space-y-4 sm:col-span-2">
          <ul className="divide-y divide-border/80 rounded-xl bg-surface-sunken/50 p-2">
            {labels.units.map((unit) => (
              <li key={unit.door} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">{unit.door}</p>
                  <p className="truncate text-xs tabular-nums text-fg-subtle">{unit.amount}</p>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " +
                    (unit.state === "paid"
                      ? "bg-success-soft text-success-fg"
                      : "bg-warning-soft text-warning-fg")
                  }
                >
                  {unit.state === "paid" ? labels.paid : labels.due}
                </span>
              </li>
            ))}
          </ul>

          {/* WhatsApp akışı */}
          <div className="rounded-xl bg-surface-sunken/50 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
              <MessageCircle aria-hidden className="h-3.5 w-3.5 text-success" />
              WhatsApp
            </p>
            <m.p
              className="mt-2.5 w-fit rounded-lg bg-primary-soft px-3 py-1.5 text-xs text-primary-soft-fg"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.32 }}
            >
              {labels.chatPrompt}
            </m.p>
            <m.p
              className="mt-1.5 ms-auto w-fit rounded-lg bg-surface px-3 py-1.5 text-xs text-fg"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.15, duration: 0.32 }}
            >
              <Check aria-hidden className="me-1 inline h-3 w-3 text-success" />
              {labels.chatReply}
            </m.p>
          </div>
        </div>
      </div>

    </figure>
  );
}
