import { getTranslations } from "next-intl/server";

import {
  activitySummaryResponse,
  balanceSheetResponse,
  incomeStatementResponse,
} from "@yonetim/contracts";

import { apiGet, toQuery } from "@/lib/api/server";
import type { Block } from "@/lib/pdf/report-pdf";
import { kv } from "../../pdf-blocks";
import { pdfRoute } from "../../pdf-route";
import { parseRange } from "../../report-tools";

export const dynamic = "force-dynamic";

/** Denetim kurulu raporu PDF'i — tespit ve sonuç metni ekrandan (POST). */
export const { GET, POST } = pdfRoute(
  async ({ params, notes, ctx, f, day }) => {
    const t = await getTranslations("app.reportsHub");
    const { from, to } = parseRange(params);
    const [income, sheet, a] = await Promise.all([
      apiGet(
        `/v1/panel/reports/accounting/income-statement?${toQuery({ from, to })}`,
        incomeStatementResponse,
      ),
      apiGet(
        `/v1/panel/reports/accounting/balance-sheet?${toQuery({ at: to })}`,
        balanceSheetResponse,
      ),
      apiGet(
        `/v1/panel/reports/accounting/activity?${toQuery({ from, to })}`,
        activitySummaryResponse,
      ),
    ]);
    const fromLabel = day(from);
    const toLabel = day(to);
    const line = (code: string) =>
      sheet.assets.concat(sheet.liabilities).find((l) => l.code === code)
        ?.amountMinor ?? 0;
    const cash = line("100") + line("102");

    const blocks: Block[] = [
      {
        type: "docTitle",
        title: ctx.tenantName,
        subtitle: t("auditDocTitle", { from: fromLabel, to: toLabel }),
      },
      {
        type: "paragraph",
        text: t("auditIntro", { from: fromLabel, to: toLabel }),
      },
      { type: "heading", text: `1. ${t("secChecked")}` },
      {
        type: "checklist",
        items: [
          t("checkBook"),
          t("checkDecisions"),
          t("checkVouchers"),
          t("checkBank"),
          t("checkCashCount"),
          t("checkBudget"),
        ],
      },
      { type: "heading", text: `2. ${t("secIncomeExpense")}` },
      {
        type: "table",
        headless: true,
        columns: [
          { header: "", weight: 3, wrap: true },
          { header: "", weight: 1.3, align: "right" },
        ],
        rows: [
          ...income.income.map((r) => ({
            cells: [r.name, f.money(r.totalMinor)],
          })),
          {
            kind: "total" as const,
            cells: [t("totalIncome"), f.money(income.totals.incomeMinor)],
          },
          ...income.expense.map((r) => ({
            cells: [r.name, f.money(r.totalMinor)],
          })),
          {
            kind: "total" as const,
            cells: [t("totalExpense"), f.money(income.totals.expenseMinor)],
          },
          {
            kind: "grand" as const,
            cells: [t("net"), f.money(income.totals.netMinor)],
            negative: income.totals.netMinor < 0 ? [1] : [],
          },
        ],
      },
      { type: "heading", text: `3. ${t("secPosition", { date: toLabel })}` },
      kv([
        [t("cashAndBanks"), f.money(cash)],
        [t("receivables"), f.money(line("120"))],
        [t("staffAdvances"), f.money(line("196"))],
        [t("vendorPayables"), f.money(line("320"))],
        [t("staffPayables"), f.money(line("335"))],
        [t("totalAssets"), f.money(sheet.totals.assetsMinor)],
      ]),
      { type: "heading", text: `4. ${t("secCollection")}` },
      kv([
        [t("charged"), f.money(a.finance.chargedMinor)],
        [t("collected"), f.money(a.finance.collectedMinor)],
        [
          t("collectionRate"),
          a.finance.chargedMinor > 0
            ? f.percent(a.finance.collectedMinor / a.finance.chargedMinor)
            : "—",
        ],
        [
          t("overdueUnits"),
          `${a.finance.overdueUnits} / ${a.finance.unitCount}`,
        ],
        [t("legalOpen"), String(a.legal.open)],
      ]),
    ];
    if (a.budget) {
      blocks.push(
        {
          type: "heading",
          text: `5. ${t("secBudget", { name: a.budget.name })}`,
        },
        kv([
          [t("plannedToDate"), f.money(a.budget.plannedToDateMinor)],
          [t("actualToDate"), f.money(a.budget.actualToDateMinor)],
          [
            t("budgetDeviation"),
            f.money(a.budget.actualToDateMinor - a.budget.plannedToDateMinor),
          ],
        ]),
      );
    }
    const n = a.budget ? 6 : 5;
    blocks.push(
      { type: "heading", text: `${n}. ${t("secFindings")}` },
      { type: "note", text: notes.findings, lines: 7 },
      { type: "heading", text: `${n + 1}. ${t("secConclusion")}` },
      { type: "note", text: notes.conclusion, lines: 4 },
      { type: "paragraph", text: t("syntheticNote"), muted: true },
      {
        type: "signatures",
        labels: [1, 2, 3].map((i) => t("auditorN", { n: i })),
        caption: t("nameSignature"),
      },
    );

    return {
      title: t("auditReportTitle"),
      period: t("rangeTitle", { from: fromLabel, to: toLabel }),
      filename: `denetim-raporu_${from}_${to}`,
      blocks,
    };
  },
);
