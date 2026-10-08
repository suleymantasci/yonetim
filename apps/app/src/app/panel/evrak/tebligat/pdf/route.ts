import { getTranslations } from "next-intl/server";

import { openItemsResponse } from "@yonetim/contracts";

import { apiGet } from "@/lib/api/server";
import type { Block } from "@/lib/pdf/report-pdf";
import { letterPdf } from "../../letter-pdf";
import { noticeApi } from "../../notice-params";
import { DEFAULT_NOTICE_TEXT, fillTemplate, type NoticeKind } from "../../templates";

export const dynamic = "force-dynamic";

/** Tebligat PDF'i — seçilen her bölüm ayrı sayfa: metin + borç dökümü + imza. */
export const { GET, POST } = letterPdf("legal:read", async ({ get, getAll, f, siteName }) => {
  const t = await getTranslations("app.letters");
  const td = await getTranslations("app.debtReports");
  const kind: NoticeKind = get("kind") === "warning" ? "warning" : "payment";
  const body = (get("body") ?? "").trim() || DEFAULT_NOTICE_TEXT[kind];
  const chosen = new Set(getAll("unitId"));
  const dueByRaw = get("sonOdeme");
  const dueBy = dueByRaw && /^\d{4}-\d{2}-\d{2}$/.test(dueByRaw) ? f.date(new Date(`${dueByRaw}T12:00:00`)) : "—";
  const today = f.date(new Date());
  const data = await apiGet(noticeApi(get), openItemsResponse);
  const units = data.units.filter((u) => chosen.size === 0 || chosen.has(u.unitId));

  const blocks: Block[] = units.flatMap((u, index): Block[] => {
    const name = u.debtors.join(", ") || u.holder || "—";
    return [
      ...(index > 0 ? [{ type: "pageBreak" as const }] : []),
      { type: "paragraph", text: today, align: "right" },
      { type: "paragraph", text: `${name}\n${siteName} — ${u.label}`, size: 10 },
      { type: "heading", text: t("subject", { subject: t(`noticeKind.${kind}`) }) },
      {
        type: "paragraph",
        size: 10.5,
        align: "justify",
        text: fillTemplate(body, {
          ad: name,
          daire: u.label,
          tutar: f.money(u.totalMinor),
          tarih: today,
          sonOdeme: dueBy,
          site: siteName,
        }),
      },
      {
        type: "table",
        columns: [
          { header: td("dueDate"), weight: 1 },
          { header: t("item"), weight: 3, wrap: true },
          { header: td("value.remaining"), weight: 1.2, align: "right" },
        ],
        rows: [
          ...u.items.map((i) => ({ cells: [f.date(i.dueDate), i.description, f.money(i.remainingMinor)] })),
          { kind: "grand" as const, cells: [t("total"), "", f.money(u.totalMinor)] },
        ],
      },
      { type: "signatures", labels: [t("management")], caption: siteName },
    ];
  });

  return {
    title: t(`noticeKind.${kind}`),
    filename: `${kind === "warning" ? "ihtarname" : "odeme-cagrisi"}_${new Date().toISOString().slice(0, 10)}`,
    blocks: blocks.length > 0 ? blocks : [{ type: "paragraph", text: t("noRecipients") }],
  };
});
