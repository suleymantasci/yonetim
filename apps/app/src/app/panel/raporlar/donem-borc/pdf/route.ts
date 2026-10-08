import { getTranslations } from "next-intl/server";

import { debtMatrixResponse } from "@yonetim/contracts";

import { apiGet } from "@/lib/api/server";
import { matrixParams } from "../../debt-report-params";
import { pdfRoute } from "../../pdf-route";

export const dynamic = "force-dynamic";

/** Dönemsel borç tablosu PDF'i — yatay A4. */
export const { GET, POST } = pdfRoute(async ({ params, f }) => {
  const t = await getTranslations("app.reportsHub");
  const td = await getTranslations("app.debtReports");
  const p = matrixParams(params);
  const data = await apiGet(p.api, debtMatrixResponse);
  const cell = (v: number) => (v === 0 ? "—" : f.money(v));
  const showBefore = data.totals.beforeMinor !== 0;
  const showAfter = data.totals.afterMinor !== 0;
  const months = Array.from({ length: 12 }, (_, i) =>
    f.period(`${p.year}-${String(i + 1).padStart(2, "0")}`),
  );
  const line = (label: string, r: { beforeMinor: number; months: number[]; afterMinor: number; totalMinor: number }) => [
    label,
    ...(showBefore ? [cell(r.beforeMinor)] : []),
    ...r.months.map(cell),
    ...(showAfter ? [cell(r.afterMinor)] : []),
    f.money(r.totalMinor),
  ];
  const title = td("matrixCardTitle", { year: p.year, value: td(`value.${p.value}`) });
  const subtitle = [
    p.rows === "member" ? td("rowsMember") : td("rowsUnit"),
    p.basis === "due" ? td("basisDue") : td("basisPeriod"),
    p.lateFee === "1" ? td("lateFeeIn") : td("lateFeeOut"),
  ].join(" · ");

  return {
    title: td("matrixTitle"),
    period: String(p.year),
    filename: `donem-borc_${p.year}`,
    landscape: true,
    blocks: [
      { type: "docTitle", title, subtitle },
      {
        type: "table",
        columns: [
          { header: p.rows === "member" ? td("rowsMember") : td("rowsUnit"), weight: 2.2, wrap: true },
          ...(showBefore ? [{ header: td("before"), align: "right" as const }] : []),
          ...months.map((m) => ({ header: m, align: "right" as const })),
          ...(showAfter ? [{ header: td("after"), align: "right" as const }] : []),
          { header: t("total"), weight: 1.15, align: "right" },
        ],
        rows: [
          ...data.rows.map((r) => ({ cells: line(r.sub ? `${r.label} — ${r.sub}` : r.label, r) })),
          { kind: "grand" as const, cells: line(t("total"), data.totals) },
        ],
      },
      { type: "paragraph", text: td("matrixNote"), muted: true },
    ],
  };
});
