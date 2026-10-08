import { getTranslations } from "next-intl/server";

import { openItemsResponse } from "@yonetim/contracts";

import { apiGet } from "@/lib/api/server";
import type { Block } from "@/lib/pdf/report-pdf";
import { openItemsParams } from "../../debt-report-params";
import { pdfRoute } from "../../pdf-route";

export const dynamic = "force-dynamic";

/** Toplu borç dökümü PDF'i — her daire yeni sayfada. */
export const { GET, POST } = pdfRoute(async ({ params, f }) => {
  const td = await getTranslations("app.debtReports");
  const t = await getTranslations("app.reportsHub");
  const p = openItemsParams(params);
  const data = await apiGet(p.api, openItemsResponse);
  const today = f.date(new Date());

  const pages: Block[] = data.units.flatMap((u, index): Block[] => [
    ...(index > 0 ? [{ type: "pageBreak" as const }] : []),
    {
      type: "docTitle",
      title: `${u.label}${u.holder ? ` — ${u.holder}` : ""}`,
      subtitle: td("openItemsAsOf", { date: today }),
    },
    {
      type: "table",
      columns: [
        { header: t("descriptionColumn"), weight: 3, wrap: true },
        { header: td("dueDate"), weight: 1.1 },
        { header: td("amount"), weight: 1.1, align: "right" },
        { header: td("lateFeeColumn"), weight: 1, align: "right" },
        { header: td("value.paid"), weight: 1.1, align: "right" },
        { header: td("value.remaining"), weight: 1.2, align: "right" },
      ],
      rows: [
        ...u.items.map((i) => ({
          cells: [
            i.debtorName ? `${i.description} (${i.debtorName})` : i.description,
            f.date(i.dueDate),
            f.money(i.amountMinor),
            i.lateFeeMinor ? f.money(i.lateFeeMinor) : "—",
            i.paidMinor ? f.money(i.paidMinor) : "—",
            f.money(i.remainingMinor),
          ],
        })),
        { kind: "grand" as const, cells: [t("total"), "", "", "", "", f.money(u.totalMinor)] },
      ],
    },
    { type: "paragraph", text: td("openItemsFooter"), muted: true },
  ]);

  return {
    title: td("openItemsTitle"),
    period: today,
    filename: `borc-dokumu_${new Date().toISOString().slice(0, 10)}`,
    blocks: pages.length > 0 ? pages : [{ type: "paragraph", text: td("empty") }],
  };
});
