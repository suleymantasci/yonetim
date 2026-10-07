import { getTranslations } from "next-intl/server";

import { baBsResponse, mizanResponse } from "@yonetim/contracts";
import { Alert, Card, CardBody, CardHeader, Input, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { apiGet, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Muhasebe raporları — sentetik mizan (dönem hareketleri) ve aylık BA/BS.
 * Resmî defter değil: mali müşavire verilecek dönem özeti. Filtreler adres
 * çubuğunda (`?from=&to=&period=`), böylece rapor bağlantısı paylaşılabiliyor.
 */
export default async function AccountingPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("report:read");
  const t = await getTranslations("app.accounting");
  const f = await formatters();
  const params = await searchParams;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const from = params.from && DATE.test(params.from) ? params.from : `${now.getFullYear()}-01-01`;
  const to = params.to && DATE.test(params.to) ? params.to : today;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const period =
    params.period && PERIOD.test(params.period)
      ? params.period
      : `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

  const [mizan, baBs] = await Promise.all([
    apiGet(`/v1/panel/reports/accounting/mizan${toQuery({ from, to })}`, mizanResponse),
    apiGet(`/v1/panel/reports/accounting/ba-bs${toQuery({ period })}`, baBsResponse),
  ]);
  const balanced = mizan.totals.debitMinor === mizan.totals.creditMinor;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={<PrintButton label={t("print")} />}
      />

      <div className="mb-4 print:hidden">
        <Alert tone="info">{t("syntheticNote")}</Alert>
      </div>

      <Card className="mb-4">
        <CardHeader
          title={t("mizanTitle")}
          description={t("mizanRange", { from: f.date(new Date(`${from}T12:00:00`)), to: f.date(new Date(`${to}T12:00:00`)) })}
          action={
            <form method="get" className="flex flex-wrap items-end gap-2 print:hidden">
              <input type="hidden" name="period" value={period} />
              <label className="text-xs text-fg-subtle">
                {t("from")}
                <Input name="from" type="date" defaultValue={from} className="mt-0.5 h-9" />
              </label>
              <label className="text-xs text-fg-subtle">
                {t("to")}
                <Input name="to" type="date" defaultValue={to} className="mt-0.5 h-9" />
              </label>
              <button type="submit" className="h-9 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover">
                {t("apply")}
              </button>
            </form>
          }
        />
        <CardBody className="p-0">
          {mizan.rows.length === 0 ? (
            <p className="p-4 text-sm text-fg-muted">{t("mizanEmpty")}</p>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 560 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("code")}</th>
                    <th scope="col" className={tc.th}>{t("account")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("debit")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("credit")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {mizan.rows.map((r) => (
                    <tr key={r.code} className={`${tc.tr} ${r.sub ? "text-fg-muted" : ""}`}>
                      <td className={`${tc.td} tabular-nums ${r.sub ? "pl-8" : "font-medium"}`}>{r.code}</td>
                      <td className={tc.td}>{r.name}</td>
                      <td className={tc.tdNum}>{r.debitMinor ? f.money(r.debitMinor) : ""}</td>
                      <td className={tc.tdNum}>{r.creditMinor ? f.money(r.creditMinor) : ""}</td>
                      <td className={tc.tdNum}>
                        {r.balanceMinor === 0
                          ? "—"
                          : `${f.money(Math.abs(r.balanceMinor))} ${r.balanceMinor > 0 ? t("debitShort") : t("creditShort")}`}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border-strong font-semibold">
                    <td className={tc.td} colSpan={2}>{t("total")}</td>
                    <td className={tc.tdNum}>{f.money(mizan.totals.debitMinor)}</td>
                    <td className={tc.tdNum}>{f.money(mizan.totals.creditMinor)}</td>
                    <td className={tc.tdNum}>{balanced ? t("balanced") : t("unbalanced")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("babsTitle")}
          description={t("babsHint", { threshold: f.money(baBs.thresholdMinor) })}
          action={
            <form method="get" className="flex flex-wrap items-end gap-2 print:hidden">
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <label className="text-xs text-fg-subtle">
                {t("period")}
                <Input name="period" type="month" defaultValue={period} className="mt-0.5 h-9" />
              </label>
              <button type="submit" className="h-9 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover">
                {t("apply")}
              </button>
            </form>
          }
        />
        <CardBody className="space-y-4">
          {baBs.missingTaxNumbers > 0 ? (
            <Alert tone="warning">{t("missingTaxNumbers", { count: baBs.missingTaxNumbers })}</Alert>
          ) : null}
          {(
            [
              ["ba", baBs.ba],
              ["bs", baBs.bs],
            ] as const
          ).map(([kind, list]) => (
            <section key={kind}>
              <h3 className="text-sm font-semibold text-fg">{t(`${kind}Title`)}</h3>
              <p className="text-xs text-fg-subtle">{t(`${kind}Hint`)}</p>
              {list.length === 0 ? (
                <p className="mt-2 text-sm text-fg-muted">{t("nothingOverThreshold")}</p>
              ) : (
                <div className={`${tc.wrapper} mt-2`}>
                  <table className={tc.table} style={{ minWidth: 480 }}>
                    <thead className={tc.thead}>
                      <tr>
                        <th scope="col" className={tc.th}>{t("counterparty")}</th>
                        <th scope="col" className={tc.th}>{t("taxNumber")}</th>
                        <th scope="col" className={`${tc.th} text-right`}>{t("documents")}</th>
                        <th scope="col" className={`${tc.th} text-right`}>{t("net")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r, i) => (
                        <tr key={`${r.counterpartyId ?? r.name}-${i}`} className={tc.tr}>
                          <td className={tc.td}>{r.name}</td>
                          <td className={tc.tdMuted}>{r.taxNumber ?? (kind === "ba" ? t("taxNumberMissing") : "—")}</td>
                          <td className={tc.tdNum}>{r.documentCount}</td>
                          <td className={tc.tdNum}>{f.money(r.netMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
