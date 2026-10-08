import { getTranslations } from "next-intl/server";

import { currentPeriod, periodKey } from "@yonetim/core";
import { dashboardResponse, unitDebtSummary } from "@yonetim/contracts";

import { apiGet } from "@/lib/api/server";
import { kv } from "../pdf-blocks";
import { pdfRoute } from "../pdf-route";

export const dynamic = "force-dynamic";

/** Rapor özeti PDF'i — bu ayın tablosu ve borçlu bölümler. */
export const { GET, POST } = pdfRoute(async ({ f }) => {
  const t = await getTranslations("app.reports");
  const th = await getTranslations("app.reportsHub");
  const period = periodKey(currentPeriod());
  const [{ summary }, { rows: unitDebts }] = await Promise.all([
    apiGet("/v1/panel/dashboard", dashboardResponse),
    apiGet("/v1/panel/debts/unit-summary", unitDebtSummary),
  ]);
  const paying = unitDebts.filter((u) => u.outstandingMinor === 0).length;
  const late = unitDebts.filter((u) => u.overdueMinor > 0).length;
  const debtors = unitDebts.filter((u) => u.outstandingMinor > 0);

  return {
    title: t("title"),
    period: f.period(period),
    filename: `rapor-ozeti_${period}`,
    blocks: [
      {
        type: "docTitle",
        title: t("title"),
        subtitle: t("description", { period: f.period(period) }),
      },
      {
        type: "stats",
        items: [
          {
            label: t("collectionRate"),
            value: f.percent(summary.collectionRate),
          },
          {
            label: t("unitsWithoutDebt"),
            value: `${paying}/${unitDebts.length}`,
          },
          { label: t("unitsOverdue"), value: String(late) },
          {
            label: t("monthlyExpense"),
            value: f.money(summary.expenseThisMonthMinor),
          },
        ],
      },
      { type: "heading", text: t("balanceTitle") },
      { type: "paragraph", text: t("balanceDescription"), muted: true },
      kv([
        [t("accrued"), f.money(summary.accruedThisMonthMinor)],
        [t("collected"), f.money(summary.collectedThisMonthMinor)],
        [t("expense"), f.money(summary.expenseThisMonthMinor)],
      ]),
      {
        type: "table",
        headless: true,
        columns: [
          { header: "", weight: 3 },
          { header: "", weight: 1.3, align: "right" },
        ],
        rows: [
          {
            kind: "grand",
            cells: [
              t("net"),
              f.money(
                summary.collectedThisMonthMinor - summary.expenseThisMonthMinor,
              ),
            ],
          },
        ],
      },
      { type: "heading", text: t("topDebtorsTitle") },
      {
        type: "table",
        columns: [
          { header: th("unit"), weight: 3 },
          { header: th("amount"), weight: 1.3, align: "right" },
        ],
        rows: debtors.length
          ? debtors.map((u) => ({
              cells: [u.number, f.money(u.outstandingMinor)],
            }))
          : [{ kind: "muted", cells: ["—", ""] }],
      },
    ],
  };
});
