import { detailedListResponse } from "@yonetim/contracts";

import { apiGet, toQuery } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { memberScopeFromParam } from "@/lib/member-scope";

export const dynamic = "force-dynamic";

const HEAD: Record<string, string> = {
  block: "Blok", number: "Kapı no", floor: "Kat", area: "m²", landShare: "Arsa payı", residentCount: "Kişi sayısı",
  name: "Ad soyad", relation: "Durumu", share: "Hisse %", startDate: "Giriş", endDate: "Çıkış",
  phone: "Telefon", email: "E-posta", balance: "Bakiye",
};

/** Detaylı üye dökümü — CSV (Excel'de Türkçe karakterler için BOM ve `;`). */
export async function GET(req: Request): Promise<Response> {
  const ctx = await requirePermission("resident:read");
  const q = new URL(req.url).searchParams;
  const member = memberScopeFromParam(q.get("uye") ?? undefined);
  const data = await apiGet(
    `/v1/panel/lists/detailed?${toQuery({
      blockId: q.get("blok") ?? undefined,
      member: member === "all" ? undefined : member,
      search: q.get("q") ?? undefined,
      columns: q.get("sutun") ?? "number,name",
      reveal: q.get("acik") === "1" && can(ctx, "resident:write") ? "1" : "0",
    })}`,
    detailedListResponse,
  );
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [data.columns.map((c) => HEAD[c] ?? c), ...data.rows].map((r) => r.map(esc).join(";"));
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="uye-listesi.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
