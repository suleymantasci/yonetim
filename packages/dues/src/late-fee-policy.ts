/**
 * Bir borca hangi gecikme kuralının uygulanacağı — saf karar (gecikme işi
 * bunu çağırır, test de doğrudan bunu sınar).
 *
 * Öncelik: muafiyet (borç ya da daire) → borç türü (`none` ise hiç işlemez;
 * açık oranı varsa o) → aidat planı (oranı ve günlük modu) → site ayarı.
 * Oranın KMK md.20 üst sınırı (%5) `calculateLateFee` içinde ayrıca kesilir.
 */
export interface LateFeePolicyInput {
  debtExempt: boolean;
  unitExempt: boolean;
  type: { lateFeeMode: string; lateFeeMonthlyPct: number | null } | null;
  plan: { lateFeeMonthlyPct: number; lateFeeDailyMode: boolean } | null;
  siteMonthlyPct: number;
}

export type LateFeePolicy =
  | { apply: false; reason: "debt_exempt" | "unit_exempt" | "type_none" }
  | { apply: true; monthlyPct: number; prorateDaily: boolean };

export function lateFeePolicyFor(input: LateFeePolicyInput): LateFeePolicy {
  if (input.debtExempt) return { apply: false, reason: "debt_exempt" };
  if (input.unitExempt) return { apply: false, reason: "unit_exempt" };
  if (input.type?.lateFeeMode === "none") return { apply: false, reason: "type_none" };

  const monthlyPct =
    input.type?.lateFeeMonthlyPct ??
    input.plan?.lateFeeMonthlyPct ??
    input.siteMonthlyPct;
  // Tür açıkça seçilmiş kural; planın günlük modu yalnız türü olmayan
  // (eski) borçlarda söz sahibi.
  const prorateDaily = input.type
    ? input.type.lateFeeMode === "daily"
    : (input.plan?.lateFeeDailyMode ?? false);
  return { apply: true, monthlyPct, prorateDaily };
}
