import { toQuery } from "@/lib/api/server";
import { memberScopeFromParam } from "@/lib/member-scope";

/**
 * Tebligat süzgeçleri: URL (GET) ve PDF formu (POST) aynı adları taşır —
 * `blok`, `uye`, `tur`, `donem` (≤ YYYY-MM), `min` (₺), `gecikmis`.
 */
export const NOTICE_FILTER_KEYS = ["blok", "uye", "tur", "donem", "min", "gecikmis"] as const;

export function noticeApi(get: (key: string) => string | undefined): string {
  const uuid = (v: string | undefined) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined);
  const member = memberScopeFromParam(get("uye"));
  const period = get("donem");
  const minTl = Number((get("min") ?? "").replace(",", "."));
  return `/v1/panel/reports/debts/open-items?${toQuery({
    member: member === "all" ? undefined : member,
    blockId: uuid(get("blok")),
    debtTypeId: uuid(get("tur")),
    periodUntil: period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : undefined,
    minTotal: Number.isFinite(minTl) && minTl > 0 ? Math.round(minTl * 100) : undefined,
    overdueOnly: get("gecikmis") === "1" ? "1" : "0",
  })}`;
}
