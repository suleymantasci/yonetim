import { getTranslations } from "next-intl/server";

import type { Permission } from "@yonetim/core";
import { tenantSettingsResponse } from "@yonetim/contracts";

import { apiGet } from "@/lib/api/server";
import { requirePermission, type AppContext } from "@/lib/context";
import { formatters, type Formatters } from "@/lib/format";
import { pdfResponse, renderReportPdf, type Block } from "@/lib/pdf/report-pdf";

export interface LetterInput {
  /** GET sorgusu ve POST form alanları birlikte (POST önce). */
  get: (key: string) => string | undefined;
  getAll: (key: string) => string[];
  ctx: AppContext;
  f: Formatters;
  siteName: string;
}

/**
 * Antetli yazı PDF'i: yetki, sorgu/form okuma, antet (site adı + adres).
 * Adres site ayarlarından; okunamazsa (yetki) yalnız site adı basılır.
 */
export function letterPdf(
  permission: Permission,
  build: (input: LetterInput) => Promise<{ title: string; filename: string; blocks: Block[] }>,
) {
  const handler = async (req: Request): Promise<Response> => {
    const ctx = await requirePermission(permission);
    const url = new URL(req.url);
    const form = req.method === "POST" ? await req.formData() : null;
    const get = (key: string) => {
      const v = form?.get(key);
      if (typeof v === "string") return v;
      return url.searchParams.get(key) ?? undefined;
    };
    const getAll = (key: string) => [
      ...(form?.getAll(key).filter((v): v is string => typeof v === "string") ?? []),
      ...url.searchParams.getAll(key),
    ];
    const f = await formatters();
    const t = await getTranslations("app.reportsHub");
    const settings = await apiGet("/v1/panel/settings", tenantSettingsResponse).catch(() => null);
    const address = settings
      ? [settings.addressLine, [settings.neighborhood, settings.district, settings.city].filter(Boolean).join(" / ")]
          .filter((line): line is string => !!line && line.trim().length > 0)
      : [];
    const spec = await build({ get, getAll, ctx, f, siteName: ctx.tenantName });
    const pdf = await renderReportPdf({
      tenantName: ctx.tenantName,
      title: spec.title,
      period: f.date(new Date()),
      blocks: spec.blocks,
      letterhead: { name: ctx.tenantName, lines: address },
      labels: {
        page: (page, total) => t("pdfPage", { page, total }),
        generated: t("pdfGenerated", { date: f.dateTime(new Date()) }),
      },
    });
    return pdfResponse(pdf, `${spec.filename}.pdf`);
  };
  return { GET: handler, POST: handler };
}
