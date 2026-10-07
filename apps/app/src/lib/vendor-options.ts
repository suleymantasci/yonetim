import { vendorOptionList } from "@yonetim/contracts";

import { apiGet } from "./api/server";

/**
 * Gider formundaki tedarikçi kartı seçimi. Liste boşsa (kart yok ya da uç
 * erişilemiyor) form yalnız serbest metin "tedarikçi adı" sorar — eski
 * davranış.
 */
export async function getVendorOptions(): Promise<{ id: string; name: string }[]> {
  return apiGet("/v1/panel/vendors/options", vendorOptionList).catch(() => []);
}
