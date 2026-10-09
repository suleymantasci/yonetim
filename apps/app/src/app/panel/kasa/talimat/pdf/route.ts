import { getTranslations } from "next-intl/server";

import type { Block } from "@/lib/pdf/report-pdf";
import { letterPdf } from "../../../evrak/letter-pdf";

export const dynamic = "force-dynamic";

/** Banka EFT/havale talimatı PDF'i — antetli, satır listesi, toplam, imza. */
export const { GET, POST } = letterPdf("bank:write", async ({ get, getAll, f, siteName }) => {
  const t = await getTranslations("app.instruction");
  const names = getAll("ad");
  const ibans = getAll("iban");
  const amounts = getAll("tutar");
  const notes = getAll("aciklama");
  const parse = (v: string | undefined) => Number((v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  const lines = names
    .map((name, i) => ({
      name: name.trim().slice(0, 120),
      iban: (ibans[i] ?? "").replace(/\s/g, "").toUpperCase().slice(0, 34),
      amount: Math.round(parse(amounts[i]) * 100),
      note: (notes[i] ?? "").trim().slice(0, 140),
    }))
    .filter((l) => l.name && l.iban && l.amount > 0)
    .slice(0, 200);
  const dateRaw = get("tarih");
  const date = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? f.date(new Date(`${dateRaw}T12:00:00`)) : f.date(new Date());
  const account = (get("hesap") ?? "").slice(0, 160);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const groupIban = (iban: string) => iban.replace(/(.{4})/g, "$1 ").trim();

  const blocks: Block[] = [
    { type: "docTitle", title: t("pdfTitle"), subtitle: date },
    { type: "paragraph", size: 10.5, text: t("pdfBody", { account: account || "—", count: lines.length, total: f.money(total) }) },
    {
      type: "table",
      columns: [
        { header: "#", weight: 0.4 },
        { header: t("name"), weight: 2.2, wrap: true },
        { header: t("iban"), weight: 3 },
        { header: t("description"), weight: 2, wrap: true },
        { header: t("amount"), weight: 1.3, align: "right" },
      ],
      rows: [
        ...lines.map((l, i) => ({ cells: [String(i + 1), l.name, groupIban(l.iban), l.note, f.money(l.amount)] })),
        { kind: "grand" as const, cells: ["", t("total"), "", "", f.money(total)] },
      ],
    },
    { type: "signatures", labels: [t("signer1"), t("signer2")], caption: siteName },
  ];
  return { title: t("pdfTitle"), filename: `banka-talimati_${dateRaw ?? "tarihsiz"}`, blocks };
});
