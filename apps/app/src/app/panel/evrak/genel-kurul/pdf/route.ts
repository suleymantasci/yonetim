import { getTranslations } from "next-intl/server";

import { meetingDetail, recipientResponse } from "@yonetim/contracts";

import { apiGet, toQuery } from "@/lib/api/server";
import type { Block } from "@/lib/pdf/report-pdf";
import { letterPdf } from "../../letter-pdf";
import { DEFAULT_CALL_TEXT, fillTemplate } from "../../templates";

export const dynamic = "force-dynamic";

/**
 * Çağrı mektubu (`tur=cagri`) ya da vekaletname (`tur=vekalet`) — aktif
 * maliklere bağımsız bölüm başına bir sayfa. `bos=1`: tek boş vekaletname.
 */
export const { GET, POST } = letterPdf("meeting:read", async ({ get, f, siteName }) => {
  const t = await getTranslations("app.letters");
  const tEnum = await getTranslations("enum");
  const id = get("toplanti") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("bad meeting id");
  const m = await apiGet(`/v1/panel/communication/meetings/${id}`, meetingDetail);
  const agenda = (m.agenda as string[]).filter(Boolean);
  const proxy = get("tur") === "vekalet";
  const blank = proxy && get("bos") === "1";
  const owners = blank
    ? null
    : await apiGet(`/v1/panel/letters/recipients?${toQuery({ member: "owner" })}`, recipientResponse);
  const when = (d: Date | null) => (d ? f.dateTime(d) : "—");
  const place = m.location ?? m.onlineUrl ?? "—";
  const today = f.date(new Date());

  const meetingTable: Block = {
    type: "table",
    headless: true,
    columns: [{ header: "", weight: 1.3 }, { header: "", weight: 3, wrap: true }],
    rows: [
      { cells: [t("kindLabel"), tEnum(`meetingKind.${m.kind}`)] },
      { cells: [t("firstCall"), when(m.scheduledAt)] },
      { cells: [t("secondCall"), when(m.secondCallAt)] },
      { cells: [t("place"), place] },
    ],
  };

  const pages: { unit: string; name: string }[] = blank
    ? [{ unit: "", name: "" }]
    : (owners?.rows ?? []).flatMap((u) =>
        u.people.filter((p) => !p.former).map((p) => ({ unit: u.unitLabel, name: p.name })),
      );

  const blocks: Block[] = pages.flatMap(({ unit, name }, index): Block[] => {
    const head: Block[] = index > 0 ? [{ type: "pageBreak" }] : [];
    if (!proxy) {
      return [
        ...head,
        { type: "paragraph", text: today, align: "right" },
        { type: "paragraph", text: `${name}\n${siteName} — ${unit}`, size: 10 },
        { type: "heading", text: t("subject", { subject: t("callSubject") }) },
        {
          type: "paragraph",
          size: 10.5,
          align: "justify",
          text: fillTemplate((get("body") ?? "").trim() || DEFAULT_CALL_TEXT, { ad: name, daire: unit, site: siteName, tarih: today }),
        },
        meetingTable,
        { type: "heading", text: t("agenda") },
        agenda.length > 0
          ? { type: "paragraph", size: 10, text: agenda.map((a, i) => `${i + 1}. ${a}`).join("\n") }
          : { type: "paragraph", muted: true, text: t("noAgenda") },
        { type: "signatures", labels: [t("management")], caption: siteName },
      ];
    }
    return [
      ...head,
      { type: "docTitle", title: t("proxyTitle"), subtitle: `${siteName} · ${tEnum(`meetingKind.${m.kind}`)} · ${when(m.scheduledAt)}` },
      {
        type: "paragraph",
        size: 10.5,
        align: "justify",
        text: t("proxyBody", {
          site: siteName,
          unit: unit || "……………",
          owner: name || "…………………………………",
          date: when(m.scheduledAt),
          second: when(m.secondCallAt),
        }),
      },
      {
        type: "table",
        headless: true,
        columns: [{ header: "", weight: 1.3 }, { header: "", weight: 3 }],
        rows: [
          { cells: [t("proxyName"), ""] },
          { cells: [t("proxyId"), ""] },
          { cells: [t("proxyPhone"), ""] },
        ],
      },
      { type: "paragraph", muted: true, text: t("proxyLimitNote") },
      { type: "signatures", labels: [t("proxyGrantor")], caption: name || t("proxySignHint") },
    ];
  });

  return {
    title: proxy ? t("proxyTitle") : t("callSubject"),
    filename: `${proxy ? "vekaletname" : "genel-kurul-cagrisi"}_${new Date(m.scheduledAt).toISOString().slice(0, 10)}`,
    blocks: blocks.length > 0 ? blocks : [{ type: "paragraph", text: t("noOwners") }],
  };
});
