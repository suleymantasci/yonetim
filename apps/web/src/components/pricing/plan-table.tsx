import { getTranslations } from "next-intl/server";

import { formatAmount, formatMoney } from "@yonetim/i18n";
import { STANDARD_PLANS, quoteForPlan, savingsVsCompetitorPct } from "@yonetim/pricing";

/**
 * Tam paket listesi — 15 kademe.
 *
 * İKİ GÖRÜNÜM, YATAY KAYDIRMA YOK. Önceki hâlde tablo `overflow-x-auto` içinde
 * `min-w-[720px]` ile duruyordu: telefonda altı sütun yana kaydırılarak
 * okunuyordu ve başlık satırı görüş alanından çıkınca hangi sayının ne olduğu
 * kayboluyordu. Artık `md` altında kart, `md` üstünde tablo var.
 *
 * `md` üstünde tablo bir kaydırma kabına konmadığı için `sticky` başlık gerçekten
 * çalışıyor — `overflow-x: auto` verilseydi dikey yapışma sessizce ölürdü
 * (yatay taşma kuralı dikeyi de `auto` yapar). Başlık site başlığının altına,
 * `top-16`'ya yapışıyor.
 */

export async function PlanTable({
  locale,
  highlightedCode,
}: {
  locale: string;
  highlightedCode: string | null;
}) {
  const t = await getTranslations("marketing.pricing");

  const rows = STANDARD_PLANS.map((plan) => ({
    plan,
    quote: quoteForPlan(plan, "yearly"),
    savings: savingsVsCompetitorPct(plan),
    isHit: plan.code === highlightedCode,
  }));

  /*
    İKİ AYRINTI, İKİSİ DE YAPIŞKAN BAŞLIĞIN ÇALIŞMASI İÇİN GEREKLİ:

    1. Sarmalayıcıda `overflow-hidden` yok. `overflow: hidden` bir kaydırma
       kabı yaratıyor ve yapışkan öğe ona göre konumlanıyor: `top: 64px`
       görüş alanından değil tablonun tepesinden ölçülüyor, başlık 64px aşağı
       kayıp ilk satırın üstüne biniyordu. Köşeleri artık hücreler yuvarlıyor.

    2. `border-separate`. `border-collapse` ile kenarlıklar tabloya aittir ve
       yapışkan hücreyle birlikte hareket etmez; başlığın alt çizgisi yerinde
       kalır, satırlar başlığın altına çizgisiz girer. `border-spacing-0`
       görünümü değiştirmiyor, kenarlığı hücrenin kendisine bağlıyor.
  */
  const headCell = "sticky top-16 z-10 border-b border-border bg-surface-sunken px-4 py-3 font-semibold";

  return (
    <>
      <div className="hidden rounded-2xl border border-border bg-surface p-2 shadow-xs md:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{t("tableCaption")}</caption>
          <thead className="text-left text-xs font-semibold text-fg-subtle">
            <tr>
              <th scope="col" className={`${headCell} rounded-ss-2xl`}>{t("planColumn")}</th>
              <th scope="col" className={headCell}>{t("unitsColumn")}</th>
              <th scope="col" className={headCell}>{t("smsColumn")}</th>
              <th scope="col" className={`${headCell} text-right`}>{t("yearlyColumn")}</th>
              <th scope="col" className={`${headCell} text-right`}>{t("monthlyColumn")}</th>
              <th scope="col" className={`${headCell} rounded-se-2xl text-right`}>
                {t("savingsColumn")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ plan, quote, savings, isHit }, index) => {
              // Ayırıcı çizgi hücrelerde: ayrık kenarlık modelinde `<tr>`
              // üzerindeki `border-t` hiç boyanmaz.
              const cell = "px-4 py-3" + (index === 0 ? "" : " border-t border-border");
              return (
                <tr
                  key={plan.code}
                  className={"transition-colors " + (isHit ? "bg-selected" : "hover:bg-hover")}
                >
                  <td className={`${cell} font-semibold text-fg`}>
                    {plan.name}
                    {isHit ? (
                      <span className="ms-2 rounded bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-fg">
                        {t("suitableBadge")}
                      </span>
                    ) : null}
                  </td>
                  <td className={`${cell} tabular-nums text-fg-muted`}>
                    {plan.minUnits}
                    {plan.maxUnits ? `–${plan.maxUnits}` : "+"}
                  </td>
                  <td className={`${cell} tabular-nums text-fg-muted`}>{plan.smsQuotaYearly}</td>
                  <td className={`${cell} text-right font-semibold tabular-nums text-fg`}>
                    {formatAmount(plan.yearlyPriceTl, locale)}
                  </td>
                  <td className={`${cell} text-right tabular-nums text-fg-muted`}>
                    {formatMoney(quote.monthlyEquivalentKurus, locale)}
                  </td>
                  <td className={`${cell} text-right`}>
                    {savings && quote.competitorYearlyKurus ? (
                      <span className="inline-flex items-baseline gap-2">
                        <span className="tabular-nums text-fg-subtle line-through">
                          {formatAmount(plan.competitorYearlyTl!, locale)}
                        </span>
                        <span className="rounded bg-success-soft px-2 py-0.5 text-xs font-semibold text-success-fg">
                          {t("savingsBadge", { pct: savings })}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-surface-sunken">
              <td className="rounded-es-2xl border-t border-border px-4 py-3 font-semibold text-fg">
                {t("enterprise")}
              </td>
              <td className="border-t border-border px-4 py-3 text-fg-muted">{t("unlimited")}</td>
              <td className="border-t border-border px-4 py-3 text-fg-muted">{t("negotiated")}</td>
              <td className="rounded-ee-2xl border-t border-border px-4 py-3 text-fg-muted" colSpan={3}>
                {t("enterpriseNote")}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 md:hidden">
        {rows.map(({ plan, quote, savings, isHit }) => (
          <li
            key={plan.code}
            className={
              "rounded-xl border p-4 " +
              (isHit ? "border-primary bg-selected" : "border-border bg-surface")
            }
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-heading font-bold text-fg">{plan.name}</span>
              {isHit ? (
                <span className="rounded bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-fg">
                  {t("suitableBadge")}
                </span>
              ) : savings ? (
                <span className="rounded bg-success-soft px-2 py-0.5 text-xs font-semibold text-success-fg">
                  {t("savingsBadge", { pct: savings })}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              {plan.minUnits}
              {plan.maxUnits ? `–${plan.maxUnits}` : "+"} · {plan.smsQuotaYearly} {t("smsColumn")}
            </p>
            <p className="mt-3 font-heading text-xl font-extrabold tabular-nums text-fg">
              {formatAmount(plan.yearlyPriceTl, locale)}
              <span className="ms-1 text-xs font-medium text-fg-subtle">
                /{t("yearlyColumn").toLocaleLowerCase(locale)}
              </span>
            </p>
            <p className="text-xs tabular-nums text-fg-subtle">
              {formatMoney(quote.monthlyEquivalentKurus, locale)} · {t("monthlyColumn")}
            </p>
          </li>
        ))}
        <li className="rounded-xl border border-border bg-surface-sunken p-4 sm:col-span-2">
          <span className="font-heading font-bold text-fg">{t("enterprise")}</span>
          <p className="mt-1 text-sm text-fg-muted">{t("enterpriseNote")}</p>
        </li>
      </ul>
    </>
  );
}
