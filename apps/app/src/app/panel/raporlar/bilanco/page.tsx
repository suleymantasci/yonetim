import { getTranslations } from "next-intl/server";

import { balanceSheetResponse } from "@yonetim/contracts";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Input,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { parseDay, ReportsSubnav } from "../report-tools";
import { PdfButton } from "../pdf-button";
import { pdfHref } from "../pdf-route";

export const dynamic = "force-dynamic";

/**
 * Bilanço — seçilen günün sonundaki varlıklar, borçlar ve özkaynak. Sonuç
 * hesapları kapanış yapılmış gibi özkaynağa aktarılmış: aktif = pasif.
 */
export default async function BalanceSheetPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("report:read");
  const t = await getTranslations("app.reportsHub");
  const f = await formatters();
  const at = parseDay((await searchParams).at);
  const data = await apiGet(
    `/v1/panel/reports/accounting/balance-sheet?${toQuery({ at })}`,
    balanceSheetResponse,
  );
  const passive = data.totals.liabilitiesMinor + data.totals.equityMinor;

  const block = (title: string, lines: typeof data.assets, total: number) => (
    <table className={tc.table}>
      <thead className={tc.thead}>
        <tr>
          <th scope="col" className={tc.th}>
            {title}
          </th>
          <th scope="col" className={`${tc.th} text-right`}>
            {t("amount")}
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 ? (
          <tr className={tc.tr}>
            <td className={tc.tdMuted} colSpan={2}>
              —
            </td>
          </tr>
        ) : (
          lines.map((l) => (
            <tr key={l.code} className={tc.tr}>
              <td className={l.sub ? `${tc.tdMuted} pl-8` : tc.td}>
                <span className="tabular-nums text-fg-subtle">{l.code}</span>{" "}
                {l.name}
              </td>
              <td
                className={`${tc.tdNum} ${l.sub ? "text-fg-muted" : ""} ${l.amountMinor < 0 ? "text-danger-fg" : ""}`}
              >
                {f.money(l.amountMinor)}
              </td>
            </tr>
          ))
        )}
        <tr className="font-semibold">
          <td className={tc.td}>{t("sectionTotal", { section: title })}</td>
          <td className={tc.tdNum}>{f.money(total)}</td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <>
      <PageHeader
        title={t("balanceSheetTitle")}
        description={t("balanceSheetHint")}
        action={
          <PdfButton
            href={pdfHref("/panel/raporlar/bilanco", { at })}
            label={t("pdf")}
            title={t("pdfTitle")}
          />
        }
      />
      <ReportsSubnav active="balanceSheet" />

      {data.totals.assetsMinor !== passive ? (
        <div className="mb-4">
          <Alert tone="danger">{t("unbalanced")}</Alert>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={t("balanceAt", { date: f.date(new Date(`${at}T12:00:00`)) })}
          action={
            <form method="get" className="flex items-end gap-2 print:hidden">
              <label className="text-xs text-fg-subtle">
                {t("date")}
                <Input
                  name="at"
                  type="date"
                  defaultValue={at}
                  className="mt-0.5 h-9"
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
              >
                {t("apply")}
              </button>
            </form>
          }
        />
        <CardBody className="grid grid-cols-1 gap-6 lg:grid-cols-2 print:grid-cols-2">
          <div className={tc.wrapper}>
            {block(t("assets"), data.assets, data.totals.assetsMinor)}
          </div>
          <div className={`${tc.wrapper} space-y-4`}>
            {block(
              t("liabilities"),
              data.liabilities,
              data.totals.liabilitiesMinor,
            )}
            {block(t("equity"), data.equity, data.totals.equityMinor)}
            <div className="flex justify-between border-t-2 border-border-strong px-[var(--row-px)] pt-2 text-sm font-semibold text-fg">
              <span>{t("liabilitiesAndEquity")}</span>
              <span className="tabular-nums">{f.money(passive)}</span>
            </div>
          </div>
        </CardBody>
      </Card>
      <p className="mt-3 text-xs text-fg-subtle">{t("syntheticNote")}</p>
    </>
  );
}
