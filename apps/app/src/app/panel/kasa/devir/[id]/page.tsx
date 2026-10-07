import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { cashHandoverRow } from "@yonetim/contracts";
import { Card, CardBody, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Kasa devir tutanağı — yazdırılıp devreden ve devralan yönetici tarafından
 * imzalanır. Rakamlar tutanak oluşturulduğu anda dondurulmuş (`snapshot`).
 */
export default async function HandoverPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("bank:read");
  const t = await getTranslations("app.cash");
  const f = await formatters();
  const h = await apiGet(
    `/v1/panel/cash/handovers/${id}`,
    cashHandoverRow,
  ).catch(() => null);
  if (!h) notFound();
  const s = h.snapshot;

  const rows: [string, number][] = [
    [t("snapReceivables"), s.receivablesMinor],
    [t("snapAdvances"), s.advancesMinor],
    [t("snapVendorPayables"), -s.vendorPayablesMinor],
    [t("snapStaffPayables"), -s.staffPayablesMinor],
  ];

  return (
    <>
      <PageHeader
        title={t("handoverDocTitle")}
        description={t("handoverDocSubtitle", {
          site: ctx.tenantName,
          date: f.date(h.date),
        })}
        action={<PrintButton label={t("print")} />}
      />
      <Card>
        <CardBody className="space-y-6 text-sm">
          <p className="leading-relaxed text-fg">
            {t("handoverDocIntro", {
              date: f.date(h.date),
              from: h.fromName,
              to: h.toName,
            })}
          </p>

          <section>
            <h2 className="mb-2 font-semibold text-fg">{t("snapCashTitle")}</h2>
            <table className={tc.table}>
              <tbody>
                {s.accounts.map((a) => (
                  <tr key={a.code} className={tc.tr}>
                    <td className={tc.td}>
                      {a.code} · {a.label}
                    </td>
                    <td className={tc.tdNum}>{f.money(a.balanceMinor)}</td>
                  </tr>
                ))}
                <tr className={`${tc.tr} font-semibold`}>
                  <td className={tc.td}>{t("snapCashTotal")}</td>
                  <td className={tc.tdNum}>{f.money(s.cashTotalMinor)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-fg">
              {t("snapPositionTitle")}
            </h2>
            <table className={tc.table}>
              <tbody>
                {rows.map(([label, v]) => (
                  <tr key={label} className={tc.tr}>
                    <td className={tc.td}>{label}</td>
                    <td className={tc.tdNum}>{f.money(v)}</td>
                  </tr>
                ))}
                <tr className={`${tc.tr} font-semibold`}>
                  <td className={tc.td}>{t("snapNet")}</td>
                  <td className={tc.tdNum}>{f.money(s.netMinor)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {s.debtors.length > 0 ? (
            <section>
              <h2 className="mb-2 font-semibold text-fg">
                {t("snapDebtorsTitle", { count: s.openDebtorCount })}
              </h2>
              <table className={tc.table}>
                <tbody>
                  {s.debtors.map((d) => (
                    <tr key={d.unit} className={tc.tr}>
                      <td className={tc.td}>{d.unit}</td>
                      <td className={tc.tdNum}>{f.money(d.balanceMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {h.note ? (
            <section>
              <h2 className="mb-1 font-semibold text-fg">
                {t("handoverNote")}
              </h2>
              <p className="whitespace-pre-line text-fg-muted">{h.note}</p>
            </section>
          ) : null}

          <p className="text-xs text-fg-subtle">{t("handoverDocDisclaimer")}</p>

          <div className="grid grid-cols-1 gap-8 pt-6 sm:grid-cols-2 print:grid-cols-2">
            {[
              [t("handoverFrom"), h.fromName],
              [t("handoverTo"), h.toName],
            ].map(([role, name]) => (
              <div key={role} className="border-t border-border-strong pt-2">
                <div className="font-semibold text-fg">{name}</div>
                <div className="text-xs text-fg-subtle">
                  {role} · {t("signature")}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
