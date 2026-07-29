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

  const { fees, online } = data;
  const transferable = data.bankAccounts.filter((a) => a.iban !== null);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 lg:p-6">
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
            {/*
              Komisyon satırları yalnız gerçekten bir ücret varken yazılıyor.
              "0,00 ₺ komisyon" satırı, olmayan bir kalemi varmış gibi gösterip
              ödenecek tutarı sorgulatırdı — kartla ödeme kapalıyken (oran
              tanımsız) kırılım da hesaplanmamış oluyor.
            */}
            {fees.platformFeeMinor > 0 ? (
              <Row label={t("platformFee")} value={f.money(fees.platformFeeMinor)} />
            ) : null}
            {fees.processorFeeMinor > 0 ? (
              <Row label={t("processorFee")} value={f.money(fees.processorFeeMinor)} />
            ) : null}
            <Row label={t("payableAmount")} value={f.money(fees.totalMinor)} strong />
          </div>

          {/*
            Sakinin sorduğu soru "neden 500 değil de 517 ödüyorum": cevabı
            aidatın tamamının siteye geçtiği. Tutarı yazmadan "komisyon
            eklenmiştir" demek, farkın bir kısmının aidattan kesildiği
            şüphesini bırakırdı.
          */}
          {fees.totalMinor > fees.amountMinor ? (
            <Alert tone="info">
              {t("feeAddedNote", { amount: f.money(fees.amountMinor) })}
            </Alert>
          ) : null}
        </CardBody>

        {/*
          Kartla ödeme kapalıysa düğme **hiç** render edilmiyor; devre dışı bir
          düğme göstermek "belki çalışır" izlenimi verirdi. Sebep de yazılıyor:
          "yönetiminiz açmamış" ile "şu an kullanılamıyor" sakinin atacağı
          adımı belirliyor.
        */}
        {online.available ? (
          <CardFooter className="flex-col items-stretch gap-2">
            <form action={startCheckout}>
              <button className="w-full rounded-lg bg-primary px-5 py-3 font-semibold text-primary-fg hover:bg-primary-hover">
                {t("payButton", { amount: f.money(fees.totalMinor) })}
              </button>
            </form>
            <p className="text-xs text-fg-subtle">{t("securityNote")}</p>
          </CardFooter>
        ) : online.reason !== "no_open_debt" ? (
          <CardFooter>
            <Alert tone="warning" title={t("onlineUnavailableTitle")}>
              {t(`onlineUnavailable.${online.reason}`)}
            </Alert>
          </CardFooter>
        ) : null}
      </Card>

      <Card>
        <CardHeader title={t("transferTitle")} description={t("transferDescription")} />
        <CardBody className="space-y-3 text-sm">
          {transferable.length === 0 ? (
            <Alert tone="warning">{t("noBankAccount")}</Alert>
          ) : (
            <>
              {transferable.map((account) => (
                <div key={account.id} className="rounded-lg border border-border p-3">
                  <p className="font-medium text-fg">{account.bankName}</p>
                  {account.accountName ? (
                    <p className="text-xs text-fg-subtle">{account.accountName}</p>
                  ) : (
                    <p className="text-xs text-fg-subtle">{data.tenantName}</p>
                  )}
                  {/* `select-all`: dokunuşla tamamı seçiliyor — IBAN elle
                      kopyalanırken en sık yapılan hata eksik seçmek. */}
                  <p className="mt-1 select-all font-mono text-sm tabular-nums text-fg">
                    {account.iban}
                  </p>
                </div>
              ))}
              {/*
                Açıklamaya daire numarası: havale eşleştirmesi bugün elle
                yapılıyor ve açıklamasız bir gönderi hangi daireye ait olduğu
                bilinmeden hesapta bekliyor.
              */}
              <Alert tone="info">
                {t("transferReference", { unit: data.unit.number })}
              </Alert>
            </>
          )}
        </CardBody>
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
