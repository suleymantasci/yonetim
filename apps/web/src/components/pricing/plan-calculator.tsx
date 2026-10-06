"use client";

import { ArrowRight, Check, Minus, Plus, Sparkles } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { formatMoney } from "@yonetim/i18n";
import {
  planForUnitCount,
  quoteForPlan,
  savingsVsCompetitorPct,
  type BillingPeriod,
} from "@yonetim/pricing";

import { DEFAULT_UNIT_COUNT, UNIT_STOPS, nearestStopIndex } from "@/lib/pricing-stops";

/**
 * Fiyat hesaplayıcı — **İlerici zenginleştirme (Progressive Enhancement)**.
 *
 * FORM MİMARİSİ:
 * Bileşen standart bir `<form method="get">` render eder. `daire` ve `donem`
 * alanları form parametreleri taşır. JavaScript yüklenmediğinde sayfa
 * `?daire=200&donem=yearly` ile yeniden yüklenir ve sunucu hesaplar.
 *
 * JAVASCRIPT ETKİNLEŞTİĞİNDE:
 * - Stepper butonları (−, +) ve hızlı önayar hapları (16, 40, 100, 200, 500, 1000)
 * - Anlık pürüzsüz slider ve reaktif fiyat güncellemesi
 * - Yıllık peşine tek tıkla geçiş fırsatı
 * - URL geçmişini kirletmeden `replaceState` ile senkronizasyon
 *
 * HESAPLAMA TUTARLILIĞI:
 * Kullanıcının seçtiği dönemin yıllık maliyeti ile karşılaştırma çubuğundaki
 * Yönetimcell tutarı HER ZAMAN birebir eşleşir. Asla iki farklı yıllık fiyat
 * gösterilerek kullanıcıda çelişki hissi yaratılmaz.
 */

export interface PlanCalculatorLabels {
  unitCountLabel: string;
  unitCountPlaceholder: string;
  sliderLabel: string;
  quickPresetsLabel?: string;
  unitsSuffix?: string;
  periodLabel: string;
  findPlan: string;
  /** `{count}` içerir. */
  recommendedFor: string;
  /** `{count}` içerir. */
  installmentCount: string;
  yearlyTotal: string;
  annualEquivalent?: string;
  annualUpfrontHint?: string;
  switchToYearly?: string;
  /** `{amount}` içerir. */
  surcharge: string;
  noSurcharge: string;
  annualSavings?: string;
  periodSavings?: string;
  flexiblePayment?: string;
  periodBadges?: Record<BillingPeriod, string>;
  perUnitMonthly: string;
  /** `{count}` içerir. */
  smsIncluded: string;
  /** `{pct}` içerir. */
  savingsBadge: string;
  comparePeer: string;
  compareUs: string;
  compareCaption: string;
  compareSubtitle?: string;
  compareSavingsBadge?: string;
  annualSwitchTip?: string;
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

/** Hızlı seçim için en sık kullanılan bina ölçekleri */
const QUICK_PRESETS = [16, 40, 100, 200, 500, 1000] as const;

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

  // Adres çubuğu senkronizasyonu — sayfa yenilense de seçim korunur
  useEffect(() => {
    if (!enhanced) return;
    const url = new URL(window.location.href);
    url.searchParams.set("daire", String(units));
    url.searchParams.set("donem", period);
    window.history.replaceState(null, "", url);
  }, [enhanced, units, period]);

  const plan = planForUnitCount(units);
  const quote = quoteForPlan(plan, period);
  const upfrontQuote = quoteForPlan(plan, "yearly");
  const isYearly = period === "yearly";

  const savingsPct = savingsVsCompetitorPct(plan);
  const perUnitKurus = Math.round(quote.monthlyEquivalentKurus / Math.max(1, units));

  // Yıllık peşine geçildiğinde sağlanacak ek tasarruf
  const switchSavingsKurus = Math.max(0, quote.yearlyTotalKurus - upfrontQuote.yearlyTotalKurus);

  // Karşılaştırma çubuğu hesaplaması:
  // Seçilen dönemin yıllık toplam maliyeti üzerinden muadille kıyaslama
  const competitorKurus = quote.competitorYearlyKurus;
  const netSavingsKurus = competitorKurus ? Math.max(0, competitorKurus - quote.yearlyTotalKurus) : null;
  const netSavingsPct =
    competitorKurus && netSavingsKurus
      ? Math.round((netSavingsKurus / competitorKurus) * 100)
      : savingsPct;

  const usWidthPct = competitorKurus
    ? Math.max(8, Math.min(100, Math.round((quote.yearlyTotalKurus / competitorKurus) * 100)))
    : 100;

  // Stepper fonksiyonları
  const handleStepDown = () => {
    const currentIndex = nearestStopIndex(units);
    if (currentIndex > 0) {
      setUnits(UNIT_STOPS[currentIndex - 1]!);
    } else {
      setUnits(Math.max(1, units - 1));
    }
  };

  const handleStepUp = () => {
    const currentIndex = nearestStopIndex(units);
    if (currentIndex < UNIT_STOPS.length - 1) {
      setUnits(UNIT_STOPS[currentIndex + 1]!);
    } else {
      setUnits(units + 50);
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-md">
      {/* ÜST PANEL: Daire Sayısı ve Ödeme Dönemi Kontrol Merkezi */}
      <form method="get" className="border-b border-border bg-surface-sunken/60 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          {/* Sol Kolon: Daire Sayısı Sayaç & Stepper */}
          <div className="lg:col-span-6">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={unitFieldId} className="text-sm font-bold tracking-tight text-fg">
                {labels.unitCountLabel}
              </label>
              <span className="text-xs font-semibold text-fg-subtle">
                {labels.unitsSuffix ?? "Bağımsız Bölüm"}
              </span>
            </div>

            {/* Stepper ve Sayı Girişi */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {enhanced ? (
                <button
                  type="button"
                  onClick={handleStepDown}
                  aria-label="Daire sayısını azalt"
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-fg transition-all hover:bg-hover active:scale-95"
                >
                  <Minus className="h-4 w-4" />
                </button>
              ) : null}

              <div className="relative min-w-0 flex-1">
                <input
                  id={unitFieldId}
                  type="number"
                  name="daire"
                  inputMode="numeric"
                  min={1}
                  max={100_000}
                  value={units}
                  onChange={(e) => setUnits(Math.max(1, Number(e.target.value) || 1))}
                  placeholder={labels.unitCountPlaceholder}
                  className="h-12 w-full rounded-xl border border-border-strong bg-surface px-4 text-center font-heading text-2xl font-extrabold tabular-nums text-fg shadow-inner transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {enhanced ? (
                <button
                  type="button"
                  onClick={handleStepUp}
                  aria-label="Daire sayısını artır"
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-fg transition-all hover:bg-hover active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}

              {/* JS'siz fallback için Submit Butonu */}
              <button
                type="submit"
                className="h-12 basis-full shrink-0 rounded-xl border border-border-strong bg-surface px-5 text-sm font-semibold text-fg transition-colors hover:bg-hover active:scale-[0.98] sm:basis-auto lg:hidden"
              >
                {labels.findPlan}
              </button>
            </div>

            {/* Hızlı Seçim Önayarları (Quick Presets) */}
            {enhanced ? (
              <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  {labels.quickPresetsLabel ?? "Hızlı:"}
                </span>
                {QUICK_PRESETS.map((preset) => {
                  const isActive = units === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setUnits(preset)}
                      className={
                        "rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums transition-all " +
                        (isActive
                          ? "bg-primary text-primary-fg shadow-sm scale-105"
                          : "border border-border/80 bg-surface text-fg-muted hover:border-primary/40 hover:text-fg")
                      }
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Kaydırıcı (Slider) */}
            {enhanced ? (
              <div className="mt-4">
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
                  onChange={(e) => setUnits(UNIT_STOPS[Number(e.target.value)]!)}
                  aria-valuetext={String(units)}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-border-strong accent-primary transition-colors focus-visible:outline-none"
                />
                <div className="mt-1.5 flex justify-between text-[11px] font-semibold tabular-nums text-fg-subtle">
                  <span>{UNIT_STOPS[0]} Bağımsız Bölüm</span>
                  <span>{UNIT_STOPS[UNIT_STOPS.length - 1]}+ Bölüm</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Sağ Kolon: Ödeme Periyodu Seçici */}
          <div className="lg:col-span-6 lg:border-l lg:border-border lg:pl-8">
            <fieldset className="min-w-0">
              <legend className="text-sm font-bold tracking-tight text-fg">
                {labels.periodLabel}
              </legend>

              {/* Segment Toggle */}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {periods.map((option) => {
                  const active = option.value === period;
                  const badge = labels.periodBadges?.[option.value];
                  const isYearlyOption = option.value === "yearly";

                  return (
                    <label
                      key={option.value}
                      className={
                        "relative flex cursor-pointer flex-col items-center justify-center rounded-xl p-2.5 text-center transition-all " +
                        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring " +
                        (active
                          ? "border-2 border-primary bg-surface shadow-sm ring-1 ring-primary/20"
                          : "border border-border/80 bg-surface/70 hover:border-border-strong hover:bg-surface")
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
                      <span className={"text-xs font-bold " + (active ? "text-fg" : "text-fg-muted")}>
                        {option.label}
                      </span>
                      {badge ? (
                        <span
                          className={
                            "mt-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase " +
                            (isYearlyOption
                              ? "bg-success-soft text-success-fg ring-1 ring-success/20"
                              : active
                              ? "bg-primary-soft text-primary-soft-fg"
                              : "bg-surface-sunken text-fg-subtle")
                          }
                        >
                          {badge}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>

              {/* Masaüstünde JS yokken görünen submit butonu */}
              <noscript>
                <div className="mt-4">
                  <button
                    type="submit"
                    className="w-full rounded-xl border border-border-strong bg-surface py-2.5 text-sm font-semibold text-fg shadow-sm"
                  >
                    {labels.findPlan}
                  </button>
                </div>
              </noscript>
            </fieldset>
          </div>
        </div>
      </form>

      {/* ORTA PANEL: Önerilen Paket Bilgisi ve 3 Finansal Kart */}
      <div className="p-6 sm:p-8">
        {/* Paket Başlığı & Tasarruf Rozeti */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {fill(labels.recommendedFor, { count: units })}
            </span>
            <div className="mt-1 flex items-center gap-3">
              <h3 className="font-heading text-3xl font-extrabold tracking-tight text-fg">
                {plan.minUnits}{plan.maxUnits ? `–${plan.maxUnits}` : "+"} {labels.unitsSuffix}
              </h3>

            </div>
          </div>

          {savingsPct ? (
            <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-3.5 py-1.5 text-success-fg shadow-sm">
              <Sparkles className="h-4 w-4" />
              <span className="font-heading text-sm font-extrabold">
                {fill(labels.savingsBadge, { pct: savingsPct })}
              </span>
            </div>
          ) : null}
        </div>

        {/* 3 Metrik Kartı */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {/* KART 1: Seçilen Dönem Ödemesi */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface-sunken/40 p-5 shadow-sm transition-all hover:border-border-strong">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-fg-subtle">
                {periods.find((o) => o.value === period)?.label ?? "Ödeme"}
              </p>
              <p className="mt-2 font-heading text-3xl font-black tabular-nums tracking-tight text-fg">
                {formatMoney(quote.installmentKurus, locale)}
              </p>
            </div>
            <p className="mt-3 text-xs font-medium text-fg-muted">
              {period === "yearly"
                ? "Yılda tek sefer peşin ödeme"
                : period === "semiannual"
                ? "6 ayda bir faturalandırılır (2 taksit)"
                : period === "quarterly"
                ? "3 ayda bir faturalandırılır (4 taksit)"
                : "Aylık düzenli fatura · İstediğiniz an iptal"}
            </p>
          </div>

          {/* KART 2: Yıllık Bütçe & Tasarruf Fırsatı (TUTARSIZLIĞI ÇÖZEN KART) */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface-sunken/40 p-5 shadow-sm transition-all hover:border-border-strong">
            <div>
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-bold uppercase tracking-wider text-fg-subtle">
                  {isYearly ? labels.yearlyTotal : (labels.annualEquivalent ?? "1 Yıllık Maliyet")}
                </p>
                {isYearly ? (
                  <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success-fg">
                    En Avantajlı
                  </span>
                ) : null}
              </div>
              <p className="mt-2 font-heading text-3xl font-black tabular-nums tracking-tight text-fg">
                {formatMoney(quote.yearlyTotalKurus, locale)}
              </p>
            </div>

            <div className="mt-3">
              {isYearly ? (
                <p className="text-xs font-bold text-success-fg">
                  {fill(labels.annualSavings ?? labels.noSurcharge, {
                    amount: formatMoney(upfrontQuote.savingsVsMonthlyKurus, locale),
                  })}
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs text-fg-muted">
                    {fill(labels.annualUpfrontHint ?? "Yıllık peşinde {amount} ({savings} kâr)", {
                      amount: formatMoney(upfrontQuote.yearlyTotalKurus, locale),
                      savings: formatMoney(switchSavingsKurus, locale),
                    })}
                  </p>
                  {enhanced && switchSavingsKurus > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPeriod("yearly")}
                      className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                    >
                      <span>{labels.switchToYearly ?? "Yıllık peşine geç"}</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* KART 3: Daire Başına Aylık Maliyet */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface-sunken/40 p-5 shadow-sm transition-all hover:border-border-strong">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-fg-subtle">
                {labels.perUnitMonthly}
              </p>
              <p className="mt-2 font-heading text-3xl font-black tabular-nums tracking-tight text-fg">
                {formatMoney(perUnitKurus, locale)}
              </p>
            </div>
            <p className="mt-3 text-xs font-medium text-fg-muted">
              {fill(labels.smsIncluded, { count: plan.smsQuotaYearly })} · Kurulum ücretsiz
            </p>
          </div>
        </div>

        {/* ALT KARŞILAŞTIRMA BÖLÜMÜ: ŞEFFAF VE TUTARLI PİYASA BENCHMARK'I */}
        {competitorKurus ? (
          <div className="mt-6 rounded-2xl border border-border/80 bg-surface-sunken/50 p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold tracking-tight text-fg">
                  {labels.compareCaption}
                </h4>
                <p className="text-xs text-fg-muted">
                  {labels.compareSubtitle ?? "Muadil yönetim yazılımlarına kıyasla yıllık net bütçe avantajınız"}
                </p>
              </div>

              {netSavingsKurus && netSavingsKurus > 0 ? (
                <span className="rounded-full border border-success/30 bg-success-soft px-3 py-1 text-xs font-extrabold text-success-fg">
                  {fill(labels.compareSavingsBadge ?? "{amount} Net Tasarruf (%{pct})", {
                    amount: formatMoney(netSavingsKurus, locale),
                    pct: netSavingsPct ?? 0,
                  })}
                </span>
              ) : null}
            </div>

            {/* İki Kıyaslama Çubuğu */}
            <div className="mt-5 space-y-3.5">
              {/* Muadil Yazılım (Apsiyon vb.) */}
              <div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-fg-muted">{labels.comparePeer}</span>
                  <span className="font-heading font-semibold tabular-nums text-fg-muted line-through">
                    {formatMoney(competitorKurus, locale)}
                  </span>
                </div>
                <div className="mt-1.5 h-3 w-full rounded-full bg-border-strong/50">
                  <div className="h-full w-full rounded-full bg-border-strong" />
                </div>
              </div>

              {/* Yönetimcell (Seçilen Dönemle Birebir Eşleşen Yıllık Tutar) */}
              <div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold text-fg">{labels.compareUs}</span>
                    <span className="text-xs text-fg-subtle">
                      ({periods.find((o) => o.value === period)?.label ?? "Seçilen Dönem"})
                    </span>
                  </div>
                  <span className="font-heading text-lg font-black tabular-nums text-fg">
                    {formatMoney(quote.yearlyTotalKurus, locale)}
                  </span>
                </div>
                <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-500 ease-out"
                    style={{ transform: `scaleX(${usWidthPct / 100})` }}
                  />
                </div>
              </div>
            </div>

            {/* Dönemlik veya Aylık Seçilmişse Peşine Yönlendiren İpucu */}
            {!isYearly && switchSavingsKurus > 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary-soft/40 px-3.5 py-2.5 text-xs text-primary-soft-fg">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                  <span>
                    {fill(labels.annualSwitchTip ?? "Yıllık peşin ödemeye geçerek {amount} ek tasarruf sağlayın", {
                      amount: formatMoney(switchSavingsKurus, locale),
                    })}
                  </span>
                </div>
                {enhanced ? (
                  <button
                    type="button"
                    onClick={() => setPeriod("yearly")}
                    className="font-bold underline hover:text-primary"
                  >
                    {labels.switchToYearly ?? "Yıllık peşine geç"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* CTA BUTONU VE GÜVEN İŞARETLERİ */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex flex-wrap items-center gap-4">
            <a
              href={`${signupUrl}?daire=${units}`}
              className="inline-flex items-center gap-2.5 rounded-2xl bg-primary px-7 py-3.5 font-heading text-base font-bold text-primary-fg shadow-md transition-all hover:bg-primary-hover hover:shadow-lg active:scale-[0.98]"
            >
              <span>{labels.ctaTrial}</span>
              <ArrowRight className="h-4 w-4" />
            </a>
            <span className="text-xs font-semibold text-fg-subtle">{labels.ctaNote}</span>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-success" />
              Kredi kartı gerekmez
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-success" />
              14 gün iade garantisi
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
