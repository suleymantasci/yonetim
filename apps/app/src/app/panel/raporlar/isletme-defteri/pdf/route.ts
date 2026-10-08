import { getTranslations } from "next-intl/server";

import { operatingBookResponse } from "@yonetim/contracts";

import { apiGet, toQuery } from "@/lib/api/server";
import { pdfRoute } from "../../pdf-route";
import { parseRange } from "../../report-tools";

export const dynamic = "force-dynamic";

export const { GET, POST } = pdfRoute(async ({ params, f, day }) => {
  const t = await getTranslations("app.reportsHub");
  const { from, to } = parseRange(params);
  const data = await apiGet(
    `/v1/panel/reports/accounting/operating-book?${toQuery({ from, to })}`,
    operatingBookResponse,
  );
  const range = t("rangeTitle", { from: day(from), to: day(to) });

  return {
    title: t("operatingBookTitle"),
    period: range,
    filename: `isletme-defteri_${from}_${to}`,
    blocks: [
      { type: "docTitle", title: t("operatingBookTitle"), subtitle: range },
      {
        type: "stats",
        items: [
          { label: t("openingBalance"), value: f.money(data.openingMinor) },
          { label: t("totalIncome"), value: f.money(data.totals.incomeMinor) },
          {
            label: t("totalExpense"),
            value: f.money(data.totals.expenseMinor),
          },
          { label: t("closingBalance"), value: f.money(data.closingMinor) },
        ],
      },
      ...(data.truncated
        ? [
            {
              type: "alert" as const,
              text: t("truncated", { count: data.lines.length }),
            },
          ]
        : []),
      {
        type: "table",
        columns: [
          { header: "#", weight: 0.45, align: "right" },
          { header: t("date"), weight: 0.95 },
          { header: t("descriptionColumn"), weight: 3, wrap: true },
          { header: t("head"), weight: 1.4, wrap: true },
          { header: t("income"), weight: 1.25, align: "right" },
          { header: t("expense"), weight: 1.25, align: "right" },
          { header: t("balance"), weight: 1.3, align: "right" },
        ],
        rows: [
          {
            kind: "muted",
            cells: [
              "",
              day(from),
              t("carriedForward"),
              "",
              "",
              "",
              f.money(data.openingMinor),
            ],
          },
          ...data.lines.map((l, i) => ({
            cells: [
              String(i + 1),
              f.date(l.date),
              l.description,
              l.head ?? "",
              l.incomeMinor ? f.money(l.incomeMinor) : "",
              l.expenseMinor ? f.money(l.expenseMinor) : "",
              f.money(l.balanceMinor),
            ],
            notes: [undefined, undefined, l.account],
            negative: l.balanceMinor < 0 ? [6] : [],
          })),
          {
            kind: "grand",
            cells: [
              "",
              "",
              t("total"),
              "",
              f.money(data.totals.incomeMinor),
              f.money(data.totals.expenseMinor),
              f.money(data.closingMinor),
            ],
          },
        ],
      },
    ],
  };
});
