import { getTranslations } from "next-intl/server";

import { requirePermission, type AppContext } from "@/lib/context";
import { formatters, type Formatters } from "@/lib/format";
import { pdfResponse, renderReportPdf, type Block } from "@/lib/pdf/report-pdf";

type Params = Record<string, string | undefined>;

export interface PdfInput {
  params: Params;
  /** Ekranda yazılan serbest metinler (`EditableNote name=`); GET'te boş. */
  notes: Record<string, string>;
  ctx: AppContext;
  f: Formatters;
  /** `YYYY-MM-DD` → yerel tarih. */
  day: (iso: string) => string;
}

export interface PdfSpec {
  title: string;
  period: string;
  /** Uzantısız; tarih aralığı dahil (ör. `gelir-gider_2026-01-01_2026-10-08`). */
  filename: string;
  landscape?: boolean;
  blocks: Block[];
}

const MAX_NOTE = 20_000;

/**
 * Rapor sekmesinin `pdf/route.ts`'i: yetki, sorgu + not okuma, çizim, yanıt.
 * Veri sayfayla aynı API uçlarından geliyor; sayfa ile PDF ayrışmasın diye
 * hesap yapılmıyor, yalnız düzen.
 */
export function pdfRoute(build: (input: PdfInput) => Promise<PdfSpec>) {
  const handler = async (req: Request): Promise<Response> => {
    const ctx = await requirePermission("report:read");
    const params: Params = Object.fromEntries(new URL(req.url).searchParams);
    const notes: Record<string, string> = {};
    if (req.method === "POST") {
      for (const [k, v] of await req.formData()) {
        if (typeof v === "string") notes[k] = v.slice(0, MAX_NOTE);
      }
    }
    const f = await formatters();
    const t = await getTranslations("app.reportsHub");
    const day = (iso: string) => f.date(new Date(`${iso}T12:00:00`));
    const spec = await build({ params, notes, ctx, f, day });
    const pdf = await renderReportPdf({
      tenantName: ctx.tenantName,
      title: spec.title,
      period: spec.period,
      landscape: spec.landscape,
      blocks: spec.blocks,
      labels: {
        page: (page, total) => t("pdfPage", { page, total }),
        generated: t("pdfGenerated", { date: f.dateTime(new Date()) }),
      },
    });
    return pdfResponse(pdf, `${slug(ctx.tenantName)}_${spec.filename}.pdf`);
  };
  return { GET: handler, POST: handler };
}

/** Dosya adı için: Türkçe harfler sadeleşir, boşluk → tire. */
function slug(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** `?from=&to=` sorgusunu PDF adresine taşı. */
export function pdfHref(base: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return `${base}/pdf${q ? `?${q}` : ""}`;
}
