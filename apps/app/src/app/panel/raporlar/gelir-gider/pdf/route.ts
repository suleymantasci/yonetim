import { getTranslations } from "next-intl/server";

import { incomeStatementResponse } from "@yonetim/contracts";

import { apiGet, toQuery } from "@/lib/api/server";
import type { TableRow } from "@/lib/pdf/report-pdf";
import { pdfRoute } from "../../pdf-route";
import { parseRange } from "../../report-tools";

export const dynamic = "force-dynamic";

/** Gelir-gider PDF'i — yatay A4, aylık sütunlar tek parça. */
export const { GET, POST } = pdfRoute(async ({ params, f, day }) => {
  const t = await getTranslations("app.reportsHub");
  const { from, to } = parseRange(params);
  const data = await apiGet(
    `/v1/panel/reports/accounting/income-statement?${toQuery({ from, to })}`,
    incomeStatementResponse,
  );
  const cell = (v: number) => (v === 0 ? "—" : f.money(v));
  const last = data.months.length + 1;

  const section = (
    title: string,
    rows: typeof data.income,
    totals: number[],
    total: number,
  ): TableRow[] => [
    { kind: "section", cells: [title] },
    ...rows.map((r) => ({
      cells: [
        `${r.code} ${r.name}`,
        ...r.byMonth.map(cell),
        f.money(r.totalMinor),
      ],
    })),
    {
      kind: "total" as const,
      cells: [
        t("sectionTotal", { section: title }),
        ...totals.map(cell),
        f.money(total),
      ],
    },
  ];

  return {
    title: t("incomeStatementTitle"),
    period: t("rangeTitle", { from: day(from), to: day(to) }),
    filename: `gelir-gider_${from}_${to}`,
    landscape: true,
    blocks: [
      {
        type: "docTitle",
        title: t("incomeStatementTitle"),
        subtitle: t("rangeTitle", { from: day(from), to: day(to) }),
      },
      {
        type: "stats",
        items: [
          { label: t("totalIncome"), value: f.money(data.totals.incomeMinor) },
          {
            label: t("totalExpense"),
            value: f.money(data.totals.expenseMinor),
          },
          { label: t("net"), value: f.money(data.totals.netMinor) },
        ],
      },
      {
        type: "table",
        columns: [
          { header: t("account"), weight: 2.4, wrap: true },
          ...data.months.map((m) => ({
            header: f.period(m),
            align: "right" as const,
          })),
          { header: t("total"), weight: 1.15, align: "right" },
        ],
        rows: [
          ...section(
            t("income"),
            data.income,
            data.totals.incomeByMonth,
            data.totals.incomeMinor,
          ),
          ...section(
            t("expense"),
            data.expense,
            data.totals.expenseByMonth,
            data.totals.expenseMinor,
          ),
          {
            kind: "grand",
            cells: [
              t("net"),
              ...data.totals.netByMonth.map(cell),
              f.money(data.totals.netMinor),
            ],
            negative: [
              ...data.totals.netByMonth.flatMap((v, i) =>
                v < 0 ? [i + 1] : [],
              ),
              ...(data.totals.netMinor < 0 ? [last] : []),
            ],
          },
        ],
      },
      { type: "paragraph", text: t("accrualNote"), muted: true },
    ],
  };
});
