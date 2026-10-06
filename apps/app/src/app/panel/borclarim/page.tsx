import { CreditCard } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { portalDebtsResponse } from "@yonetim/contracts";
import {
  Badge, Card, CardBody, CardHeader, EmptyState, Stat,
  pageActionClasses, tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

/**
 * "Borçlarım" — sakinin kendi borç dökümü (SPEC Bölüm 6.1).
 *
 * Yönetimin `/panel/borclar` ekranıyla aynı veriyi göstermiyor: orada site
 * genelindeki tüm borçlar var ve `debt:read` gerekiyor. Buradaki uç
 * (`/v1/panel/portal/debts`) yalnız oturumdaki kullanıcının dairesini
 * döndürür; kapsam istemciden değil sunucudan geliyor.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.myDebts");
  return { title: t("title") };
}

export default async function MyDebtsPage() {
  await requirePermission("debt:read_own");
  const t = await getTranslations("app.myDebts");
  const tEnum = await getTranslations("enum");
  // Düzeltme türü etiketleri yönetim ekranıyla ortak: aynı olguya iki farklı
  // ad vermek, sakinle yönetici aynı kaydı konuşurken kafa karıştırırdı.
  const tChange = await getTranslations("app.debts.changeType");
  const f = await formatters();

  const { totals, rows, changes } = await apiGet(
    "/v1/panel/portal/debts",
    portalDebtsResponse,
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        /*
         * Ödeme bağlantısı yalnız açık borç varken: borcu olmayan sakine
         * "öde" demek, ekranı boşuna açtırmaktan başka bir şey değil.
         * Hangi kanalların açık olduğuna (kart / havale) ödeme ekranı karar
         * veriyor — burada o kararı ikinci kez vermek, iki ekranın
         * ayrışmasının yolu olurdu.
         */
        action={
          totals.outstandingMinor > 0 ? (
            <Link href="/odeme" className={pageActionClasses.primary}>
              <CreditCard aria-hidden className="h-4 w-4" />
              {t("payAction")}
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
        <Stat
          label={t("outstanding")}
          value={f.money(totals.outstandingMinor)}
          tone={totals.outstandingMinor > 0 ? "warning" : "success"}
        />
        <Stat
          label={t("overdue")}
          value={f.money(totals.overdueMinor)}
          tone={totals.overdueMinor > 0 ? "danger" : "success"}
        />
        <Stat label={t("lateFee")} value={f.money(totals.lateFeeMinor)} />
      </div>

      <Card className="mt-4">
        <CardHeader title={t("listTitle")} />
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th className={tc.th}>{t("col.description")}</th>
                    <th className={tc.th}>{t("col.dueDate")}</th>
                    <th className={`${tc.th} text-right`}>{t("col.amount")}</th>
                    <th className={`${tc.th} text-right`}>{t("col.paid")}</th>
                    <th className={`${tc.th} text-right`}>{t("col.remaining")}</th>
                    <th className={tc.th}>{t("col.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id} className={tc.tr}>
                      <td className={tc.td}>
                        <span className="font-medium text-fg">{d.description}</span>
                        {d.period ? (
                          <span className="ml-2 text-xs text-fg-subtle">
                            {f.period(d.period)}
                          </span>
                        ) : null}
                      </td>
                      <td className={tc.td}>
                        {f.date(d.dueDate)}
                        {d.overdue ? (
                          <span className="ml-2 text-xs text-danger">
                            {t("daysLate", { days: Math.abs(d.daysToDue) })}
                          </span>
                        ) : null}
                      </td>
                      <td className={tc.tdNum}>{f.money(d.amountMinor)}</td>
                      <td className={tc.tdNum}>{f.money(d.paidMinor)}</td>
                      <td className={tc.tdNum}>
                        <span className={d.remainingMinor > 0 ? "font-semibold text-fg" : ""}>
                          {f.money(d.remainingMinor)}
                        </span>
                      </td>
                      <td className={tc.td}>
                        <Badge
                          tone={
                            d.status === "paid"
                              ? "success"
                              : d.overdue
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {tEnum(`debtStatus.${d.status}`)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/*
        Düzeltmeler ayrı bir bölüm: "borcum neden değişti" sorusunun cevabı
        tablo satırında görünmüyor. Yalnız sakine açık işaretlenmiş düzeltmeler
        geliyor — yönetimin iç notları bu listede yok.
      */}
      {changes.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title={t("changesTitle")} description={t("changesDescription")} />
          <CardBody className="space-y-2">
            {changes.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-baseline gap-2 rounded-lg border border-border p-3 text-sm"
              >
                <Badge tone="info">{tChange(c.changeType)}</Badge>
                <span className="text-fg-muted">
                  {f.money(c.oldAmountMinor)} → <strong className="text-fg">{f.money(c.newAmountMinor)}</strong>
                </span>
                {c.reason ? <span className="text-fg-subtle">· {c.reason}</span> : null}
                <span className="ml-auto text-xs text-fg-subtle">{f.date(c.createdAt)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
