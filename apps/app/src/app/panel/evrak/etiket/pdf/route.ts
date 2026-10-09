import { getTranslations } from "next-intl/server";

import { recipientResponse, tenantSettingsResponse } from "@yonetim/contracts";

import { apiGet, toQuery } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { memberScopeFromParam } from "@/lib/member-scope";
import { pdfResponse, renderLabelsPdf } from "@/lib/pdf/report-pdf";

export const dynamic = "force-dynamic";

/**
 * Adres etiketi PDF'i. Satırlar: ad, site + bölüm, adres, (istenirse) telefon.
 * `kisi=1`: bölümdeki her kişiye ayrı etiket; yoksa bölüm başına bir etiket.
 */
export async function GET(req: Request): Promise<Response> {
  const ctx = await requirePermission("resident:read");
  const t = await getTranslations("app.letters");
  const q = new URL(req.url).searchParams;
  const member = memberScopeFromParam(q.get("uye") ?? undefined);
  const blockId = q.get("blok") ?? undefined;
  const phones = q.get("tel") === "1" && can(ctx, "resident:write");
  const [cols, rows] = (["2x4", "2x5", "2x6"].includes(q.get("boyut") ?? "") ? q.get("boyut")! : "2x5")
    .split("x")
    .map(Number) as [number, number];
  const [data, settings] = await Promise.all([
    apiGet(
      `/v1/panel/letters/recipients?${toQuery({
        member: member === "all" ? undefined : member,
        blockId: blockId && /^[0-9a-f-]{36}$/.test(blockId) ? blockId : undefined,
        phones: phones ? "1" : undefined,
      })}`,
      recipientResponse,
    ),
    apiGet("/v1/panel/settings", tenantSettingsResponse).catch(() => null),
  ]);
  const address = settings
    ? [settings.addressLine, [settings.district, settings.city].filter(Boolean).join(" / ")].filter(
        (l): l is string => !!l && l.trim().length > 0,
      )
    : [];
  const perPerson = q.get("kisi") === "1";
  // Bölüm başına etikette taşınmış kişi adresin sahibi değil; yalnız "eski"
  // kapsamı seçildiyse (eski kiracıya yazı) onlar basılır.
  const wantsFormer = member === "former_owner" || member === "former_tenant";
  const items = data.rows.flatMap((u) => {
    const site = `${ctx.tenantName} — ${u.unitLabel}`;
    const current = u.people.filter((p) => wantsFormer || !p.former);
    const people = current.length > 0 ? current : [{ name: t("labelResident"), phone: null }];
    if (perPerson) return people.map((p) => [p.name, site, ...address, p.phone ?? ""]);
    return [[people.map((p) => p.name).join(", "), site, ...address, people.find((p) => p.phone)?.phone ?? ""]];
  });
  const pdf = await renderLabelsPdf({ cols, rows, items, title: t("tab.labels") });
  return pdfResponse(pdf, `adres-etiketi_${cols}x${rows}.pdf`);
}
