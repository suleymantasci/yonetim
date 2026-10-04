import { getTranslations } from "next-intl/server";

import { portalPaymentsResponse } from "@yonetim/contracts";
import {
  Badge, Card, CardBody, CardHeader, EmptyState, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

/**
 * "Ödemelerim" — sakinin kendi ödeme geçmişi (SPEC Bölüm 6.1).
 *
 * Tamamlanmamış ödemeler de listede: sakin kartla ödeyip ekranda göremeyince
 * "para gitti mi" diye yönetimi arıyor. Beklemedeki kaydı göstermek o aramayı
 * bitiriyor — durum rozeti ne olduğunu zaten söylüyor.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.myPayments");
  return { title: t("title") };
}

export default async function MyPaymentsPage() {
  await requirePermission("payment:read_own");
  const t = await getTranslations("app.myPayments");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const { totals, rows } = await apiGet(
    "/v1/panel/portal/payments",
    portalPaymentsResponse,
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2">
        <Stat label={t("thisYear")} value={f.money(totals.thisYearMinor)} />
        <Stat label={t("allTime")} value={f.money(totals.allTimeMinor)} />
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
                    <th className={tc.th}>{t("col.date")}</th>
                    <th className={tc.th}>{t("col.method")}</th>
                    <th className={tc.th}>{t("col.receipt")}</th>
                    <th className={`${tc.th} text-right`}>{t("col.amount")}</th>
                    <th className={tc.th}>{t("col.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className={tc.tr}>
                      <td className={tc.td}>
                        {p.paidAt ? f.date(p.paidAt) : <span className="text-fg-subtle">—</span>}
                        {p.paidByName ? (
                          <span className="ml-2 text-xs text-fg-subtle">
                            {t("paidBy", { name: p.paidByName })}
                          </span>
                        ) : null}
                      </td>
                      <td className={tc.tdMuted}>{tEnum(`paymentMethod.${p.method}`)}</td>
                      <td className={tc.tdMuted}>{p.receiptNo ?? "—"}</td>
                      <td className={tc.tdNum}>{f.money(p.amountMinor)}</td>
                      <td className={tc.td}>
                        <Badge
                          tone={
                            p.status === "completed"
                              ? "success"
                              : p.status === "failed" || p.status === "chargeback"
                                ? "danger"
                                : "info"
                          }
                        >
                          {tEnum(`paymentStatus.${p.status}`)}
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
    </>
  );
}
