import { getTranslations } from "next-intl/server";

import type { Block } from "@/lib/pdf/report-pdf";
import { letterPdf } from "../../letter-pdf";

export const dynamic = "force-dynamic";

/** Antetli evrak PDF'i — sayı/tarih, alıcı, konu, gövde, imza. */
export const { GET, POST } = letterPdf("resident:read", async ({ get, f, siteName }) => {
  const t = await getTranslations("app.letters");
  const clip = (v: string | undefined, max: number) => (v ?? "").trim().slice(0, max);
  const dateRaw = get("tarih");
  const date = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? f.date(new Date(`${dateRaw}T12:00:00`)) : f.date(new Date());
  const no = clip(get("sayi"), 40);
  const subject = clip(get("konu"), 160);
  const to = clip(get("alici"), 400);
  const body = clip(get("body"), 12000);
  const signer = clip(get("imza"), 80) || t("management");

  const blocks: Block[] = [
    {
      type: "table",
      headless: true,
      columns: [{ header: "", weight: 1 }, { header: "", weight: 4, wrap: true }, { header: "", weight: 1.4, align: "right" }],
      rows: [{ cells: [no ? t("letterNoShort") : "", no, date] }],
    },
    ...(to ? [{ type: "paragraph" as const, text: to, size: 10.5 }] : []),
    ...(subject ? [{ type: "heading" as const, text: t("subject", { subject }) }] : []),
    { type: "paragraph", text: body || " ", size: 10.5, align: "justify" },
    { type: "signatures", labels: [signer], caption: siteName },
  ];
  return { title: subject || t("tab.letter"), filename: `evrak_${dateRaw ?? "tarihsiz"}`, blocks };
});
