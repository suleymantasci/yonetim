"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SubscriptionQuote } from "@yonetim/contracts";
import { Alert, Checkbox, DateInput, Input, Select, Textarea } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";

import { assignSubscription, quoteSubscription, type QuoteInput } from "../actions";

type DiscountKind = "none" | "promo" | "special";

const PERIODS = ["yearly", "semiannual", "quarterly", "monthly"] as const;

function money(minor: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(minor / 100);
}

/**
 * Manuel paket atama — havale/elden tahsilattan sonra.
 *
 * Fiyat alan değiştikçe sunucudan isteniyor (400 ms gecikmeli); gösterilen
 * tutar API'nin hesabı, burada fiyat hesaplanmıyor. Kayıt sırasında sunucu
 * fiyatı kilit altında yeniden hesaplıyor — önizleme eskimişse (kod bu
 * arada tükendiyse) kayıt reddediliyor.
 */
export function AssignPackageForm({
  sites,
  plans,
}: {
  sites: Array<{ id: string; name: string; unitCount: number }>;
  plans: Array<{ id: string; name: string; yearlyPriceMinor: number; minUnits: number; maxUnits: number | null }>;
}) {
  const t = useTranslations("app.platformAccounts");
  const [tenantId, setTenantId] = useState(sites[0]?.id ?? "");
  const unitCount = sites.find((site) => site.id === tenantId)?.unitCount ?? 0;
  const fits = (plan: (typeof plans)[number]) =>
    unitCount >= plan.minUnits && (plan.maxUnits === null || unitCount <= plan.maxUnits);
  const recommended = useMemo(
    () => plans.find(fits)?.id ?? plans[0]?.id ?? "",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, unitCount],
  );
  const [planId, setPlanId] = useState(recommended);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("yearly");
  const [periodCount, setPeriodCount] = useState(1);
  const [kind, setKind] = useState<DiscountKind>("none");
  const [promoCode, setPromoCode] = useState("");
  const [specialType, setSpecialType] = useState<"percent" | "amount">("percent");
  const [specialValue, setSpecialValue] = useState("");
  const [specialNote, setSpecialNote] = useState("");
  const [quote, setQuote] = useState<SubscriptionQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  // Site değişince o sitenin önerilen kademesine geç.
  useEffect(() => setPlanId(recommended), [recommended]);

  useEffect(() => {
    if (!tenantId || !planId) return;
    const discount: QuoteInput["discount"] =
      kind === "promo" && promoCode.trim().length >= 3
        ? { kind: "promo", code: promoCode.trim().toUpperCase() }
        : kind === "special" && Number(specialValue.replace(",", ".")) > 0
          ? { kind: "special", type: specialType, value: Number(specialValue.replace(",", ".")), note: specialNote.length >= 10 ? specialNote : "önizleme için açıklama" }
          : { kind: "none" };
    const id = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await quoteSubscription({ tenantId, planId, period, periodCount, discount });
      if (id === seq.current) {
        setQuote(result);
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [tenantId, planId, period, periodCount, kind, promoCode, specialType, specialValue, specialNote]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <ActionForm action={assignSubscription} submitLabel={t("assignSubmit")} resetOnSuccess={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        {sites.length > 1 ? (
          <FormField name="tenantId" label={t("field.site")} required>
            <Select name="tenantId" value={tenantId} onChange={(e) => setTenantId(e.target.value)} required>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.unitCount})
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <input type="hidden" name="tenantId" value={tenantId} />
        )}

        <FormField name="planId" label={t("field.plan")} required>
          <Select name="planId" value={planId} onChange={(e) => setPlanId(e.target.value)} required>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} — {money(plan.yearlyPriceMinor)}
                {fits(plan) ? ` · ${t("recommended")}` : ""}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField name="period" label={t("field.period")} required>
          <Select name="period" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} required>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`period.${p}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField name="periodCount" label={t("field.periodCount")} hint={t("field.periodCountHint")} required>
          <Input
            name="periodCount"
            type="number"
            min={1}
            max={36}
            value={periodCount}
            onChange={(e) => setPeriodCount(Math.max(1, Math.min(36, Number(e.target.value) || 1)))}
            required
          />
        </FormField>

        <FormField name="startsAt" label={t("field.startsAt")} required>
          <DateInput name="startsAt" defaultValue={today} required />
        </FormField>

        <FormField name="discountKind" label={t("field.discount")} required>
          <Select name="discountKind" value={kind} onChange={(e) => setKind(e.target.value as DiscountKind)} required>
            <option value="none">{t("discount.none")}</option>
            <option value="promo">{t("discount.promo")}</option>
            <option value="special">{t("discount.special")}</option>
          </Select>
        </FormField>

        {kind === "promo" ? (
          <FormField name="promoCode" label={t("field.promoCode")} required>
            <Input
              name="promoCode"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              className="font-mono uppercase"
              maxLength={30}
              required
            />
          </FormField>
        ) : null}

        {kind === "special" ? (
          <>
            <FormField name="specialType" label={t("field.specialType")} required>
              <Select name="specialType" value={specialType} onChange={(e) => setSpecialType(e.target.value as "percent" | "amount")}>
                <option value="percent">{t("discountType.percent")}</option>
                <option value="amount">{t("discountType.amount")}</option>
              </Select>
            </FormField>
            <FormField name="specialValue" label={t("field.specialValue")} required>
              <Input name="specialValue" inputMode="decimal" value={specialValue} onChange={(e) => setSpecialValue(e.target.value)} required />
            </FormField>
            <div className="sm:col-span-2">
              <FormField name="specialNote" label={t("field.specialNote")} hint={t("field.specialNoteHint")} required>
                <Textarea name="specialNote" rows={2} minLength={10} maxLength={500} value={specialNote} onChange={(e) => setSpecialNote(e.target.value)} required />
              </FormField>
            </div>
          </>
        ) : null}

        <div className="sm:col-span-2">
          <FormField name="note" label={t("field.assignNote")} hint={t("field.assignNoteHint")}>
            <Input name="note" maxLength={500} />
          </FormField>
        </div>

        <div className="sm:col-span-2">
          <Checkbox name="markPaid" defaultChecked label={t("field.markPaid")} description={t("field.markPaidHint")} />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface-sunken p-4 text-sm" aria-live="polite">
        {quote ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-fg-muted">{t("quote.list", { months: quote.months })}</dt>
            <dd className="text-right tabular-nums">{money(quote.listPriceMinor)}</dd>
            <dt className="text-fg-muted">{quote.discountLabel ?? t("quote.discount")}</dt>
            <dd className="text-right tabular-nums text-success-fg">− {money(quote.discountMinor)}</dd>
            <dt className="font-semibold text-fg">{t("quote.total")}</dt>
            <dd className={`text-right text-lg font-bold tabular-nums ${loading ? "opacity-50" : ""}`}>{money(quote.finalPriceMinor)}</dd>
            <dt className="text-xs text-fg-subtle">{t("quote.vat")}</dt>
            <dd className="text-right text-xs tabular-nums text-fg-subtle">{money(quote.vatMinor)}</dd>
          </dl>
        ) : (
          <p className="text-fg-subtle">{loading ? t("quote.loading") : t("quote.unavailable")}</p>
        )}
        {kind === "promo" && quote?.promoError ? (
          <div className="mt-3">
            <Alert tone="warning">{t(`promoError.${quote.promoError}`)}</Alert>
          </div>
        ) : null}
      </div>
    </ActionForm>
  );
}
