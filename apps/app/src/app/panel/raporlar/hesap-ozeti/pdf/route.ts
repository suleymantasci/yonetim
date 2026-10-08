import { getTranslations } from "next-intl/server";

import { unitStatementResponse } from "@yonetim/contracts";

import { apiGet, toQuery } from "@/lib/api/server";
import { memberScopeFromParam } from "@/lib/member-scope";
import type { Block } from "@/lib/pdf/report-pdf";
import { pdfRoute } from "../../pdf-route";
import { parseRange } from "../../report-tools";

export const dynamic = "force-dynamic";

/**
 * Toplu hesap özeti PDF'i. "Ayrıntılı döküm" seçiliyse her bölüm yeni
 * sayfada başlar: sayfalar ayrılıp sakinlere dağıtılabilsin.
 */
export const { GET, POST } = pdfRoute(async ({ params, f, day }) => {
  const t = await getTranslations("app.reportsHub");
  const { from, to } = parseRange(params);
  const detail = params.detail === "1";
  const onlyOpen = params.onlyOpen === "1";
  const member = memberScopeFromParam(params.uye);
  const data = await apiGet(
    `/v1/panel/reports/accounting/unit-statements?${toQuery({ from, to, detail: detail ? "1" : "0", onlyOpen: onlyOpen ? "1" : "0", member: member === "all" ? undefined : member })}`,
    unitStatementResponse,
  );
  const range = t("rangeTitle", { from: day(from), to: day(to) });

  const details: Block[] = detail
    ? data.rows.flatMap((r): Block[] => [
        { type: "pageBreak" },
        {
          type: "docTitle",
          title: `${r.label}${r.holder ? ` — ${r.holder}` : ""}`,
          subtitle: t("statementFor", { from: day(from), to: day(to) }),
        },
        {
          type: "table",
          columns: [
            { header: t("date"), weight: 1 },
            { header: t("descriptionColumn"), weight: 3.2, wrap: true },
            { header: t("debit"), weight: 1.2, align: "right" },
            { header: t("credit"), weight: 1.2, align: "right" },
            { header: t("balance"), weight: 1.3, align: "right" },
          ],
          rows: [
            {
              kind: "muted",
              cells: [
                day(from),
                t("carriedForward"),
                "",
                "",
                f.money(r.openingMinor),
              ],
            },
            ...(r.lines ?? []).map((l) => ({
              cells: [
                f.date(l.date),
                l.description,
                l.debitMinor ? f.money(l.debitMinor) : "",
                l.creditMinor ? f.money(l.creditMinor) : "",
                f.money(l.balanceMinor),
              ],
            })),
            {
              kind: "grand",
              cells: ["", t("closingBalance"), "", "", f.money(r.closingMinor)],
            },
          ],
        },
      ])
    : [];

  return {
    title: t("unitStatementsTitle"),
    period: range,
    filename: `hesap-ozeti_${from}_${to}${detail ? "_ayrintili" : ""}`,
    blocks: [
      { type: "docTitle", title: t("unitStatementsTitle"), subtitle: range },
      {
        type: "stats",
        items: [
          {
            label: t("openingBalance"),
            value: f.money(data.totals.openingMinor),
          },
          { label: t("charged"), value: f.money(data.totals.chargedMinor) },
          { label: t("collected"), value: f.money(data.totals.paidMinor) },
          {
            label: t("closingBalance"),
            value: f.money(data.totals.closingMinor),
          },
        ],
      },
      {
        type: "table",
        columns: [
          { header: t("unit"), weight: 2.6, wrap: true },
          { header: t("openingBalance"), weight: 1.2, align: "right" },
          { header: t("charged"), weight: 1.2, align: "right" },
          { header: t("collected"), weight: 1.2, align: "right" },
          { header: t("closingBalance"), weight: 1.2, align: "right" },
        ],
        rows: [
          ...data.rows.map((r) => ({
            cells: [
              r.label,
              f.money(r.openingMinor),
              f.money(r.chargedMinor),
              f.money(r.paidMinor),
              f.money(r.closingMinor),
            ],
            notes: [r.holder ?? undefined],
          })),
          {
            kind: "grand",
            cells: [
              t("total"),
              f.money(data.totals.openingMinor),
              f.money(data.totals.chargedMinor),
              f.money(data.totals.paidMinor),
              f.money(data.totals.closingMinor),
            ],
          },
        ],
      },
      ...details,
    ],
  };
});
