import { getTranslations } from "next-intl/server";

import { receiptListResponse } from "@yonetim/contracts";

import { apiGet, toQuery } from "@/lib/api/server";
import type { Block } from "@/lib/pdf/report-pdf";
import { memberScopeFromParam } from "@/lib/member-scope";
import { pdfRoute } from "../../pdf-route";
import { parseRange } from "../../report-tools";

export const dynamic = "force-dynamic";

/**
 * Toplu makbuz dökümü PDF'i — her tahsilat bir makbuz bloğu: numara, tarih,
 * daire, ödeyen, tutar, mahsup edilen borçlar ve imza alanı.
 */
export const { GET, POST } = pdfRoute(async ({ params, f, day }) => {
  const t = await getTranslations("app.reportsHub");
  const td = await getTranslations("app.debtReports");
  const tEnum = await getTranslations("enum");
  const { from, to } = parseRange(params);
  const member = memberScopeFromParam(params.uye);
  const data = await apiGet(
    `/v1/panel/reports/debts/receipts?${toQuery({ from, to, member: member === "all" ? undefined : member })}`,
    receiptListResponse,
  );

  const receipts: Block[] = data.rows.flatMap((r): Block[] => [
    { type: "heading", text: td("receiptHeading", { no: r.receiptNo ?? "—" }) },
    {
      type: "table",
      headless: true,
      columns: [{ header: "", weight: 1.2 }, { header: "", weight: 3, wrap: true }],
      rows: [
        { cells: [t("date"), f.date(r.paidAt)] },
        { cells: [t("unit"), r.unitLabel ?? "—"] },
        { cells: [td("payer"), r.payerName ?? r.debtorName ?? "—"] },
        { cells: [td("method"), tEnum(`paymentMethod.${r.method}`)] },
        ...r.allocations.map((a) => ({ cells: [td("allocated"), `${a.description} — ${f.money(a.amountMinor)}`] })),
        { kind: "grand" as const, cells: [td("amount"), f.money(r.amountMinor)] },
      ],
    },
    { type: "signatures", labels: [td("receivedBy")], caption: "" },
  ]);

  return {
    title: td("receiptsTitle"),
    period: t("rangeTitle", { from: day(from), to: day(to) }),
    filename: `makbuzlar_${from}_${to}`,
    blocks: [
      {
        type: "docTitle",
        title: td("receiptsTitle"),
        subtitle: t("rangeTitle", { from: day(from), to: day(to) }),
      },
      {
        type: "stats",
        items: [
          { label: td("receiptCount"), value: String(data.rows.length) },
          { label: t("collected"), value: f.money(data.totalMinor) },
        ],
      },
      ...(receipts.length > 0 ? receipts : [{ type: "paragraph" as const, text: td("empty") }]),
    ],
  };
});
