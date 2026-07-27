import { getTranslations } from "next-intl/server";

import { portalPaymentSummary } from "@yonetim/contracts";
import { Alert, Card, CardBody, CardFooter, CardHeader } from "@yonetim/ui";

import { apiGet } from "@/lib/api/server";
import { formatters } from "@/lib/format";
import { startCheckout } from "./actions";

/**
 * Ödeme ekranı — SPEC Bölüm 1.2 (şeffaf komisyon göstergesi) + 7.1.
 *
 * Komisyon kırılımı sunucudan geliyor, burada hesaplanmıyor: ekranda gösterilen
 * ile tahsil edilen tutar arasındaki bir kuruş fark, şeffaflık vaadini bozardı
 * ve iki yerde hesaplamak o farkın en kolay yolu.
 *
 * Formda tutar alanı **yok**: ödenecek miktarı sunucu açık borçlardan yeniden
 * türetiyor. Gizli bir `amountKurus` alanı, tutarı istemciye belirletmekti.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.payment");
  return { title: t("summaryTitle") };
}

export default async function PaymentPage() {
  const t = await getTranslations("app.payment");
  const f = await formatters();

  const data = await apiGet("/v1/panel/portal/payment", portalPaymentSummary);

  if (!data.unit || data.items.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Alert tone="success" title={t("noDebtTitle")}>
          {t("noDebtBody")}
        </Alert>
      </div>
    );
  }

  const { fees } = data;

  return (
    <div className="mx-auto max-w-lg p-4 lg:p-6">
      <Card>
        <CardHeader
          title={t("summaryTitle")}
          description={`${data.unit.number} · ${data.tenantName}`}
        />
        <CardBody className="space-y-3 text-sm">
          <ul className="space-y-1">
            {data.items.map((d) => (
              <li key={d.id} className="flex justify-between">
                <span className="text-fg-muted">{d.description}</span>
                <span className="tabular-nums">{f.money(d.outstandingMinor)}</span>
              </li>
            ))}
          </ul>

          <div className="border-t border-border pt-3">
            <Row label={t("debtAmount")} value={f.money(fees.amountMinor)} />
            <Row label={t("platformFee")} value={f.money(fees.platformFeeMinor)} />
            <Row label={t("processorFee")} value={f.money(fees.processorFeeMinor)} />
            <Row label={t("payableAmount")} value={f.money(fees.totalMinor)} strong />
          </div>

          <Alert tone="info">
            {fees.paidBy === "management" ? t("feeByManagement") : t("feeByResident")}
          </Alert>
          <p className="text-xs text-fg-subtle">{t("securityNote")}</p>
        </CardBody>
        <CardFooter>
          <form action={startCheckout}>
            <button className="w-full rounded-lg bg-primary px-5 py-3 font-semibold text-primary-fg hover:bg-primary-hover">
              {t("payButton", { amount: f.money(fees.totalMinor) })}
            </button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className={strong ? "font-semibold text-fg" : "text-fg-muted"}>{label}</span>
      <span className={strong ? "font-bold tabular-nums text-fg" : "tabular-nums"}>{value}</span>
    </div>
  );
}
