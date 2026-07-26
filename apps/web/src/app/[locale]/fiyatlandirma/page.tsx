import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { CAMPAIGN_TEMPLATES } from "@yonetim/campaigns";
import { siteConfig } from "@yonetim/config";
import { formatAmount, formatMoney } from "@yonetim/i18n";
import {
  BILLING_PERIODS, STANDARD_PLANS, planForUnitCount, quoteForPlan, savingsVsCompetitorPct,
  type BillingPeriod,
} from "@yonetim/pricing";
import type { Locale } from "@yonetim/i18n";
import { faqSchema, jsonLdScript, pageMeta } from "@yonetim/seo";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { getContent } from "@/content";
import { richTags } from "@/components/rich-text";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.pricing" });
  return pageMeta({
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale: locale as Locale,
    path: localizedPath("/fiyatlandirma", locale as Locale),
    alternatePaths: alternatePaths("/fiyatlandirma"),
  });
}

/** Fiyatlandırma soruları — SSS içeriğinden fiyatla ilgili olanlar seçilir. */
const PRICING_FAQ_INDEXES = [4, 6, 7];

export default async function PricingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ daire?: string; donem?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const query = await searchParams;
  const t = await getTranslations("marketing.pricing");
  const tCampaign = await getTranslations("marketing.campaigns");
  const tEnumPeriod = await getTranslations("enum.billingPeriod");

  const unitCount = Number(query.daire ?? "") || 0;
  const period: BillingPeriod =
    query.donem && query.donem in BILLING_PERIODS ? (query.donem as BillingPeriod) : "yearly";
  const highlighted = unitCount > 0 ? planForUnitCount(unitCount) : null;

  const content = getContent(locale);
  const pricingFaqs = PRICING_FAQ_INDEXES.map((i) => content.faqs[i]).filter(
    (f): f is NonNullable<typeof f> => Boolean(f),
  );

  const activeCampaigns = CAMPAIGN_TEMPLATES.filter((c) =>
    ["yeni_site_hosgeldin", "yillik_pesin_indirim", "gecis_kampanyasi"].includes(c.key),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqSchema(pricingFaqs)) }}
      />

      <section className="border-b border-border bg-surface-sunken px-4 py-14">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="font-heading text-4xl font-extrabold">{t("title")}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-fg-muted">
            {t.rich("subtitle", richTags)}
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {activeCampaigns.map((c) => (
              <span
                key={c.key}
                className="rounded-full border border-accent-soft bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-soft-fg"
              >
                {c.badge ? `${tCampaign(`badge.${c.badge}`)} · ` : ""}
                {tCampaign(`template.${c.key}.headline`)}
              </span>
            ))}
          </div>

          <form className="mt-8 flex flex-wrap items-end justify-center gap-3">
            <label className="text-left text-sm">
              <span className="mb-1 block font-medium text-fg">{t("unitCountLabel")}</span>
              <input
                type="number"
                name="daire"
                min={1}
                defaultValue={unitCount || undefined}
                placeholder={t("unitCountPlaceholder")}
                className="w-40 rounded border border-border-strong bg-surface px-3 py-2 text-fg"
              />
            </label>
            <label className="text-left text-sm">
              <span className="mb-1 block font-medium text-fg">{t("periodLabel")}</span>
              <select
                name="donem"
                defaultValue={period}
                className="w-52 rounded border border-border-strong bg-surface px-3 py-2 text-fg"
              >
                {(Object.keys(BILLING_PERIODS) as BillingPeriod[]).map((key) => (
                  <option key={key} value={key}>
                    {tEnumPeriod(key)}
                    {BILLING_PERIODS[key].surchargePct > 0
                      ? ` (+${BILLING_PERIODS[key].surchargePct}%)`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-fg hover:bg-primary-hover">
              {t("findPlan")}
            </button>
          </form>
        </div>
      </section>

      {highlighted ? (
        <section className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-lg border-2 border-primary p-6">
            {(() => {
              const q = quoteForPlan(highlighted, period);
              return (
                <>
                  <div className="text-sm text-fg-subtle">
                    {t("recommendedFor", { count: unitCount })}
                  </div>
                  <div className="mt-1 font-heading text-2xl font-extrabold">{highlighted.name}</div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-fg-subtle">
                        {tEnumPeriod(period)}
                      </div>
                      <div className="text-xl font-bold tabular-nums">
                        {formatMoney(q.installmentKurus, locale)}
                      </div>
                      <div className="text-xs text-fg-subtle">
                        {t("installmentCount", { count: q.installmentCount })}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-fg-subtle">
                        {t("yearlyTotal")}
                      </div>
                      <div className="text-xl font-bold tabular-nums">
                        {formatMoney(q.yearlyTotalKurus, locale)}
                      </div>
                      {q.surchargeKurus > 0 ? (
                        <div className="text-xs text-warning-fg">
                          {t("surcharge", { amount: formatMoney(q.surchargeKurus, locale) })}
                        </div>
                      ) : (
                        <div className="text-xs text-success-fg">{t("noSurcharge")}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-fg-subtle">
                        {t("perUnitMonthly")}
                      </div>
                      <div className="text-xl font-bold tabular-nums">
                        {formatMoney(
                          Math.round(q.monthlyEquivalentKurus / Math.max(1, unitCount)),
                          locale,
                        )}
                      </div>
                      <div className="text-xs text-fg-subtle">
                        {t("smsIncluded", { count: highlighted.smsQuotaYearly })}
                      </div>
                    </div>
                  </div>
                  {q.savingsVsCompetitorKurus ? (
                    <p className="mt-4 rounded bg-success-soft p-3 text-sm text-success-fg">
                      {t.rich("savingsNote", {
                        ...richTags,
                        amount: formatMoney(q.savingsVsCompetitorKurus, locale),
                      })}
                    </p>
                  ) : null}
                </>
              );
            })()}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <caption className="sr-only">{t("tableCaption")}</caption>
            <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-fg-subtle">
              <tr>
                <th scope="col" className="px-4 py-3">{t("planColumn")}</th>
                <th scope="col" className="px-4 py-3">{t("unitsColumn")}</th>
                <th scope="col" className="px-4 py-3">{t("smsColumn")}</th>
                <th scope="col" className="px-4 py-3 text-right">{t("yearlyColumn")}</th>
                <th scope="col" className="px-4 py-3 text-right">{t("monthlyColumn")}</th>
                <th scope="col" className="px-4 py-3 text-right">{t("savingsColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {STANDARD_PLANS.map((p) => {
                const q = quoteForPlan(p, "yearly");
                const savings = savingsVsCompetitorPct(p);
                const isHit = highlighted?.code === p.code;
                return (
                  <tr
                    key={p.code}
                    className={`border-t border-border ${isHit ? "bg-selected" : ""}`}
                  >
                    <td className="px-4 py-3 font-semibold text-fg">
                      {p.name}
                      {isHit ? (
                        <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-fg">
                          {t("suitableBadge")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {p.minUnits}
                      {p.maxUnits ? `–${p.maxUnits}` : "+"}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{p.smsQuotaYearly}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-fg">
                      {formatAmount(p.yearlyPriceTl, locale)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-muted">
                      {formatMoney(q.monthlyEquivalentKurus, locale)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {savings ? (
                        <span className="rounded bg-success-soft px-2 py-0.5 text-xs font-semibold text-success-fg">
                          {t("savingsBadge", { pct: savings })}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-border bg-surface-sunken">
                <td className="px-4 py-3 font-semibold text-fg">{t("enterprise")}</td>
                <td className="px-4 py-3 text-fg-muted">{t("unlimited")}</td>
                <td className="px-4 py-3 text-fg-muted">{t("negotiated")}</td>
                <td className="px-4 py-3 text-fg-muted" colSpan={3}>
                  {t("enterpriseNote")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul className="mt-6 grid gap-2 text-sm text-fg-muted sm:grid-cols-2">
          <li>✓ {t("guarantee1")}</li>
          <li>✓ {t("guarantee2", { days: siteConfig.billing.refundPeriodDays })}</li>
          <li>✓ {t("guarantee3", { pct: siteConfig.billing.maxYearlyPriceIncreasePct })}</li>
          <li>
            ✓ {t("guarantee4", { price: formatAmount(siteConfig.billing.smsOverageUnitCost, locale) })}
          </li>
          <li>✓ {t("guarantee5", { days: siteConfig.billing.graceDaysAfterExpiry })}</li>
          <li>✓ {t("guarantee6")}</li>
        </ul>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="font-heading text-2xl font-extrabold">{t("faqTitle")}</h2>
        <dl className="mt-6 space-y-5">
          {pricingFaqs.map((f) => (
            <div key={f.question} className="rounded-lg border border-border p-4">
              <dt className="font-semibold text-fg">{f.question}</dt>
              <dd className="mt-1.5 text-sm text-fg-muted">{f.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
