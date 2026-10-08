import { getTranslations } from "next-intl/server";

import { balanceSheetResponse } from "@yonetim/contracts";

import { apiGet, toQuery } from "@/lib/api/server";
import type { Block } from "@/lib/pdf/report-pdf";
import { pdfRoute } from "../../pdf-route";
import { parseDay } from "../../report-tools";

export const dynamic = "force-dynamic";

export const { GET, POST } = pdfRoute(async ({ params, f, day }) => {
  const t = await getTranslations("app.reportsHub");
  const at = parseDay(params.at);
  const data = await apiGet(
    `/v1/panel/reports/accounting/balance-sheet?${toQuery({ at })}`,
    balanceSheetResponse,
  );
  const passive = data.totals.liabilitiesMinor + data.totals.equityMinor;

  const block = (
    title: string,
    lines: typeof data.assets,
    total: number,
  ): Block => ({
    type: "table",
    columns: [
      { header: title, weight: 3, wrap: true },
      { header: t("amount"), weight: 1, align: "right" },
    ],
    rows: [
      ...(lines.length === 0
        ? [{ kind: "muted" as const, cells: ["—", ""] }]
        : lines.map((l) => ({
            kind: l.sub ? ("sub" as const) : undefined,
            cells: [`${l.code} ${l.name}`, f.money(l.amountMinor)],
            negative: l.amountMinor < 0 ? [1] : [],
          }))),
      {
        kind: "total",
        cells: [t("sectionTotal", { section: title }), f.money(total)],
      },
    ],
  });

  return {
    title: t("balanceSheetTitle"),
    period: t("balanceAt", { date: day(at) }),
    filename: `bilanco_${at}`,
    blocks: [
      {
        type: "docTitle",
        title: t("balanceSheetTitle"),
        subtitle: t("balanceAt", { date: day(at) }),
      },
      ...(data.totals.assetsMinor !== passive
        ? [{ type: "alert" as const, text: t("unbalanced") }]
        : []),
      block(t("assets"), data.assets, data.totals.assetsMinor),
      block(t("liabilities"), data.liabilities, data.totals.liabilitiesMinor),
      block(t("equity"), data.equity, data.totals.equityMinor),
      {
        type: "table",
        headless: true,
        columns: [
          { header: "", weight: 3 },
          { header: "", weight: 1, align: "right" },
        ],
        rows: [
          {
            kind: "grand",
            cells: [t("liabilitiesAndEquity"), f.money(passive)],
          },
        ],
      },
      { type: "paragraph", text: t("syntheticNote"), muted: true },
    ],
  };
});
