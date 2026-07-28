"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { formatMoney } from "@yonetim/i18n";
import {
  BILLING_PERIODS,
  planForUnitCount,
  quoteForPlan,
  savingsVsCompetitorPct,
  type BillingPeriod,
} from "@yonetim/pricing";

import { DEFAULT_UNIT_COUNT, UNIT_STOPS, nearestStopIndex } from "@/lib/pricing-stops";

/**
 * Fiyat hesaplayıcı — **ilerici zenginleştirme**.
 *
 * ALTTAKİ FORM GERÇEKTİR. Bileşen bir `<form method="get">` render eder;
 * daire sayısı ve dönem alanları `name` taşır, gönder düğmesi sayfayı
 * `?daire=48&donem=yearly` ile yeniden yükler ve sunucu sonucu üretir.
 * JavaScript gelmezse sayfa bugünkü gibi çalışır — bu davranış planın
 * korunacaklar listesindeydi.
 *
 * JavaScript geldiğinde iki şey eklenir: kaydırıcı ve anlık sonuç. Sonuç
 * paneli yalnız burada duruyor; sunucuda ikinci bir kopyası yok, yoksa aynı
 * rakam iki ayrı yerde hesaplanır ve sessizce ayrışabilirdi. İlk render
 * sunucuda bu bileşenle yapılır, dolayısıyla JS'siz ziyaretçi de paneli görür.
 *
 * KAYDIRICI YALNIZ BAĞLANDIKTAN SONRA: `name` taşımadığı için JS'siz bir
 * ziyaretçide hiçbir işe yaramazdı. Ölü bir denetim göstermektense hiç
 * göstermemek doğru; sayı alanı her koşulda duruyor.
 *
 * Hesap `@yonetim/pricing` içinden geliyor — kayıt ekranı ve fatura ile aynı
 * fonksiyon. Pazarlama sayfasına ayrı bir fiyat mantığı yazmak, ikisinin
 * ayrışmasının en kısa yolu olurdu.
 */

export interface PlanCalculatorLabels {
  unitCountLabel: string;
  unitCountPlaceholder: string;
  sliderLabel: string;
  periodLabel: string;
  findPlan: string;
  /** `{count}` içerir. */
  recommendedFor: string;
  /** `{count}` içerir. */
  installmentCount: string;
  yearlyTotal: string;
  /** `{amount}` içerir. */
  surcharge: string;
  noSurcharge: string;
  perUnitMonthly: string;
  /** `{count}` içerir. */
  smsIncluded: string;
  /** `{pct}` içerir. */
  savingsBadge: string;
  comparePeer: string;
  compareUs: string;
  compareCaption: string;
  ctaTrial: string;
  ctaNote: string;
}

export interface PeriodOption {
  value: BillingPeriod;
  label: string;
}

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );

export function PlanCalculator({
  locale,
  initialUnits,
  initialPeriod,
  periods,
  labels,
  signupUrl,
}: {
  locale: string;
  initialUnits: number;
  initialPeriod: BillingPeriod;
  periods: PeriodOption[];
  labels: PlanCalculatorLabels;
  signupUrl: string;
}) {
  const [units, setUnits] = useState(initialUnits || DEFAULT_UNIT_COUNT);
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod);
  const [enhanced, setEnhanced] = useState(false);
  const unitFieldId = useId();
  const sliderId = useId();

  useEffect(() => setEnhanced(true), []);

  // Durum paylaşılabilir kalsın diye adres çubuğu güncellenir. `replaceState`,
  // çünkü kaydırıcıyı sürüklerken geri tuşuna onlarca adım yığmak istemiyoruz.
  useEffect(() => {
    if (!enhanced) return;
    const url = new URL(window.location.href);
    url.searchParams.set("daire", String(units));
    url.searchParams.set("donem", period);
    window.history.replaceState(null, "", url);
  }, [enhanced, units, period]);

  // Yüzde işaretinin yeri dile göre değişiyor: tr "%4", en "4%". Elle
  // yazılınca İngilizce sayfada Türkçe biçim görünüyordu.
  const percent = new Intl.NumberFormat(locale, { style: "percent" });

  const plan = planForUnitCount(units);
  const quote = quoteForPlan(plan, period);
  const savingsPct = savingsVsCompetitorPct(plan);
  const perUnitKurus = Math.round(quote.monthlyEquivalentKurus / Math.max(1, units));

  // Karşılaştırma çubuğunda muadil fiyat tam genişlik; bizimki oranı kadar.
  const usWidthPct = quote.competitorYearlyKurus
    ? Math.max(6, Math.round((quote.listYearlyKurus / quote.competitorYearlyKurus) * 100))
    : 100;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <form className="border-b border-border bg-surface-sunken p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
          <div className="min-w-0">
            <label htmlFor={unitFieldId} className="block text-sm font-medium text-fg-muted">
              {labels.unitCountLabel}
            </label>
            <input
              id={unitFieldId}
              type="number"
              name="daire"
              inputMode="numeric"
              min={1}
              max={100_000}
              value={units}
              onChange={(event) => setUnits(Math.max(1, Number(event.target.value) || 1))}
              placeholder={labels.unitCountPlaceholder}
              className="mt-1.5 w-32 rounded-lg border border-border-strong bg-surface px-3 py-2.5 font-heading text-2xl font-extrabold tabular-nums text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <fieldset className="min-w-0">
            <legend className="mb-1.5 text-sm font-medium text-fg-muted">
              {labels.periodLabel}
            </legend>
            {/*
              Segment görünümü ama altında gerçek radyo düğmeleri: forma
              katılırlar, klavyeyle ok tuşlarında gezilirler ve JS'siz de
              seçilebilirler. Görsel bir segment denetimi yazmak bunların
              üçünü de elle taklit etmeyi gerektirirdi.
            */}
            <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-surface p-1">
              {periods.map((option) => {
                const active = option.value === period;
                const surcharge = BILLING_PERIODS[option.value].surchargePct;
                return (
                  <label
                    key={option.value}
                    className={
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors " +
                      "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring " +
                      (active ? "bg-primary text-primary-fg" : "text-fg-muted hover:text-fg")
                    }
                  >
                    <input
                      type="radio"
                      name="donem"
                      value={option.value}
                      checked={active}
                      onChange={() => setPeriod(option.value)}
                      className="sr-only"
                    />
                    {option.label}
                    {surcharge > 0 ? (
                      <span className={active ? "opacity-80" : "text-fg-subtle"}>
                        +{percent.format(surcharge / 100)}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/*
            JS varken sonuç zaten canlı; düğme yalnız adresi tazeler. JS yokken
            hesabı yapan tek şey bu düğme, o yüzden her koşulda görünür.
          */}
          <button
            type="submit"
            className="rounded-lg border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-hover"
          >
            {labels.findPlan}
          </button>
        </div>

        {enhanced ? (
          <div className="mt-6">
            <label htmlFor={sliderId} className="sr-only">
              {labels.sliderLabel}
            </label>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={UNIT_STOPS.length - 1}
              step={1}
              value={nearestStopIndex(units)}
              onChange={(event) => setUnits(UNIT_STOPS[Number(event.target.value)]!)}
              aria-valuetext={String(units)}
              className="w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-xs tabular-nums text-fg-subtle">
              <span>{UNIT_STOPS[0]}</span>
              <span>{UNIT_STOPS[UNIT_STOPS.length - 1]}+</span>
            </div>
          </div>
        ) : null}
      </form>

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <p className="text-sm text-fg-subtle">
              {fill(labels.recommendedFor, { count: units })}
            </p>
            <p className="mt-0.5 font-heading text-2xl font-extrabold text-fg">{plan.name}</p>
          </div>
          {savingsPct ? (
            <span className="rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success-fg">
              {fill(labels.savingsBadge, { pct: savingsPct })}
            </span>
          ) : null}
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-surface-sunken p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              {periods.find((option) => option.value === period)?.label}
            </dt>
            <dd className="mt-1 font-heading text-xl font-bold tabular-nums text-fg">
              {formatMoney(quote.installmentKurus, locale)}
            </dd>
            <dd className="mt-0.5 text-xs text-fg-subtle">
              {fill(labels.installmentCount, { count: quote.installmentCount })}
            </dd>
          </div>

          <div className="rounded-xl bg-surface-sunken p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              {labels.yearlyTotal}
            </dt>
            <dd className="mt-1 font-heading text-xl font-bold tabular-nums text-fg">
              {formatMoney(quote.yearlyTotalKurus, locale)}
            </dd>
            <dd
              className={
                "mt-0.5 text-xs " + (quote.surchargeKurus > 0 ? "text-warning-fg" : "text-success-fg")
              }
            >
              {quote.surchargeKurus > 0
                ? fill(labels.surcharge, { amount: formatMoney(quote.surchargeKurus, locale) })
                : labels.noSurcharge}
            </dd>
          </div>

          <div className="rounded-xl bg-surface-sunken p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              {labels.perUnitMonthly}
            </dt>
            <dd className="mt-1 font-heading text-xl font-bold tabular-nums text-fg">
              {formatMoney(perUnitKurus, locale)}
            </dd>
            <dd className="mt-0.5 text-xs text-fg-subtle">
              {fill(labels.smsIncluded, { count: plan.smsQuotaYearly })}
            </dd>
          </div>
        </dl>

        {/*
          Tasarruf iddiası cümle yerine iki çubukla anlatılıyor: "yarı fiyat"
          bir kez okunup unutulan bir söz, iki çubuk ise bakışta ölçülüyor.
          Rakamlar çubukların yanında yazılı — renk ya da uzunluk tek başına
          bilgi taşımıyor.
        */}
        {quote.competitorYearlyKurus ? (
          <div className="mt-6 rounded-xl border border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              {labels.compareCaption}
            </p>
            <div className="mt-3 space-y-2.5">
              <div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-fg-muted">{labels.comparePeer}</span>
                  <span className="font-semibold tabular-nums text-fg-muted line-through">
                    {formatMoney(quote.competitorYearlyKurus, locale)}
                  </span>
                </div>
                <div className="mt-1 h-2.5 w-full rounded-full bg-surface-sunken">
                  <div className="h-full w-full rounded-full bg-border-strong" />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-fg">{labels.compareUs}</span>
                  <span className="font-heading font-bold tabular-nums text-fg">
                    {formatMoney(quote.listYearlyKurus, locale)}
                  </span>
                </div>
                <div className="mt-1 h-2.5 w-full rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${usWidthPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href={`${signupUrl}?daire=${units}`}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            {labels.ctaTrial}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </a>
          <span className="text-sm text-fg-subtle">{labels.ctaNote}</span>
        </div>
      </div>
    </div>
  );
}
