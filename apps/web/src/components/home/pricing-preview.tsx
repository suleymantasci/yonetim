"use client";

import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";

import { formatAmount } from "@yonetim/i18n";
import { planForUnitCount, quoteForPlan, savingsVsCompetitorPct } from "@yonetim/pricing";
import { SegmentedControl } from "@yonetim/ui";

/**
 * Ana sayfadaki fiyat önizlemesi.
 *
 * NEDEN KAYDIRICI: Onbeş kademeli bir tablo, ziyaretçiye "benim binam hangisi"
 * sorusunu bırakıyor. Kaydırıcı bu soruyu bir hareketle cevaplıyor; asıl tablo
 * `/fiyatlandirma` sayfasında duruyor ve kaldırılmıyor.
 *
 * HESAP SUNUCUYLA AYNI KAYNAKTAN: `planForUnitCount` ve `quoteForPlan`
 * `@yonetim/pricing` içinden geliyor — yani burada gösterilen rakam, kayıt
 * ekranında ve faturada çıkacak rakamla aynı fonksiyondan üretiliyor.
 * Pazarlama sayfasına ayrı bir fiyat mantığı yazmak, ikisinin sessizce
 * ayrışmasının en kısa yolu olurdu.
 *
 * Bu bileşen ilerici zenginleştirmedir: JS gelmezse ziyaretçi yine
 * `/fiyatlandirma` bağlantısını görür ve oradaki form JS'siz çalışır.
 */

export interface PricingPreviewLabels {
  units: string;
  plan: string;
  monthly: string;
  yearly: string;
  yearlyBadge: string;
  perUnit: string;
  cta: string;
  all: string;
  savings: string;
  periodLabel: string;
}

/** Kaydırıcı kademeleri — doğrusal değil: küçük binalarda çözünürlük daha önemli. */
const STOPS = [8, 12, 16, 24, 30, 40, 50, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500, 750, 1000];

export function PricingPreview({
  locale,
  labels,
  signupUrl,
  pricingHref,
}: {
  locale: string;
  labels: PricingPreviewLabels;
  signupUrl: string;
  pricingHref: string;
}) {
  const [stopIndex, setStopIndex] = useState(6);
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");
  const sliderId = useId();

  const units = STOPS[stopIndex]!;
  const plan = planForUnitCount(units);
  const quote = quoteForPlan(plan, period === "yearly" ? "yearly" : "monthly");
  const savings = savingsVsCompetitorPct(plan);

  const monthlyPerUnit = quote.yearlyTotalKurus / 12 / 100 / units;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor={sliderId} className="text-sm font-medium text-fg-muted">
            {labels.units}
          </label>
          <p className="mt-1 font-heading text-3xl font-extrabold tabular-nums text-fg">
            {units}
            {stopIndex === STOPS.length - 1 ? "+" : ""}
          </p>
        </div>

        <SegmentedControl
          label={labels.periodLabel}
          size="sm"
          value={period}
          onChange={(next) => setPeriod(next as "monthly" | "yearly")}
          options={[
            { value: "monthly", label: labels.monthly },
            { value: "yearly", label: labels.yearly, badge: labels.yearlyBadge },
          ]}
        />
      </div>

      <input
        id={sliderId}
        type="range"
        min={0}
        max={STOPS.length - 1}
        step={1}
        value={stopIndex}
        onChange={(event) => setStopIndex(Number(event.target.value))}
        aria-valuetext={`${units}`}
        className="mt-5 w-full accent-primary"
      />

      <div className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
        <div>
          <p className="text-sm text-fg-muted">{labels.plan}</p>
          <p className="mt-1 font-heading text-2xl font-bold text-fg">
            {formatAmount(quote.installmentKurus / 100, locale)}
            <span className="ms-1.5 text-sm font-medium text-fg-subtle">
              /{period === "yearly" ? labels.yearly.toLowerCase() : labels.monthly.toLowerCase()}
            </span>
          </p>
          <p className="mt-1 text-sm text-fg-subtle">
            ≈ {formatAmount(monthlyPerUnit, locale)} {labels.perUnit}
          </p>
          {savings ? (
            <p className="mt-3 inline-flex rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success-fg">
              {labels.savings.replace("{pct}", String(savings))}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col justify-end gap-2">
          <a
            href={`${signupUrl}?daire=${units}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            {labels.cta}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </a>
          <a
            href={pricingHref}
            className="inline-flex items-center justify-center rounded-lg border border-border-strong px-5 py-3 text-sm font-medium text-fg transition-colors hover:bg-hover"
          >
            {labels.all}
          </a>
        </div>
      </div>
    </div>
  );
}
