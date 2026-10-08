import { toQuery } from "@/lib/api/server";
import { memberScopeFromParam } from "@/lib/member-scope";

type Params = Record<string, string | undefined>;

/**
 * Borç raporlarının URL → API sorgusu çevirisi; ekran ve PDF aynı fonksiyonu
 * kullanır (ikisi ayrışmasın).
 */
export function matrixParams(params: Params) {
  const thisYear = new Date(Date.now() + 3 * 3_600_000).getUTCFullYear();
  const yearRaw = Number(params.yil);
  const year = Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : thisYear;
  const rows = params.satir === "uye" ? "member" : "unit";
  const value = params.deger === "tahakkuk" ? "charged" : params.deger === "odenen" ? "paid" : "remaining";
  const basis = params.esas === "vade" ? "due" : "period";
  const lateFee = params.gecikme === "0" ? "0" : "1";
  const member = memberScopeFromParam(params.uye);
  const debtTypeId = params.tur && /^[0-9a-f-]{36}$/.test(params.tur) ? params.tur : undefined;
  const api = `/v1/panel/reports/debts/matrix?${toQuery({
    year,
    rows,
    value,
    basis,
    lateFee,
    member: member === "all" ? undefined : member,
    debtTypeId,
  })}`;
  /** PDF bağlantısına taşınacak URL parametreleri. */
  const passthrough = Object.fromEntries(
    Object.entries({
      yil: String(year),
      satir: params.satir,
      deger: params.deger,
      esas: params.esas,
      gecikme: params.gecikme,
      uye: params.uye,
      tur: debtTypeId,
    }).filter((e): e is [string, string] => !!e[1]),
  );
  return { year, rows, value, basis, lateFee, member, debtTypeId, api, passthrough, thisYear };
}

export function openItemsParams(params: Params) {
  const member = memberScopeFromParam(params.uye);
  const overdueOnly = params.gecikmis === "1";
  return {
    member,
    overdueOnly,
    api: `/v1/panel/reports/debts/open-items?${toQuery({
      member: member === "all" ? undefined : member,
      overdueOnly: overdueOnly ? "1" : "0",
    })}`,
    passthrough: Object.fromEntries(
      Object.entries({ uye: params.uye, gecikmis: overdueOnly ? "1" : undefined }).filter(
        (e): e is [string, string] => !!e[1],
      ),
    ),
  };
}
