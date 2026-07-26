import { siteConfig } from "@yonetim/config";
import { roundHalfUp, type Kurus } from "@yonetim/core";

/**
 * Gecikme tazminatı — SPEC Bölüm 6.1.
 *
 * Hukuki dayanak: 634 sayılı Kat Mülkiyeti Kanunu md. 20/son —
 * "Gecikme tazminatı **aylık %5** hesabıyla" istenebilir. Bu üst sınırdır;
 * kat malikleri kurulu daha düşük oran belirleyebilir (tenant ayarı).
 *
 * Alternatif mod: TCMB reeskont oranı + marj (bazı sitelerin yönetim planı böyle).
 */
export type LateFeeMode = "kmk_monthly" | "tcmb_reeskont" | "none";

export interface LateFeeInput {
  principalKurus: Kurus;
  dueDate: Date;
  asOf?: Date;
  mode?: LateFeeMode;
  /** Aylık oran (%) — kmk_monthly modunda. Varsayılan siteConfig.dues.monthlyLateFeePct. */
  monthlyPct?: number;
  /** TCMB reeskont yıllık oranı (%) — tcmb_reeskont modunda. */
  tcmbAnnualPct?: number;
  /** TCMB moduna eklenen marj (%). */
  marginPct?: number;
  /** Ödemesiz gün (yönetim planı "vade + N gün" tanıyorsa). */
  graceDays?: number;
  /** Tam ay yerine günlük orantı uygula. */
  prorateDaily?: boolean;
}

export interface LateFeeResult {
  feeKurus: Kurus;
  overdueDays: number;
  chargedMonths: number;
  effectiveMonthlyPct: number;
  mode: LateFeeMode;
  /** Açıklama i18n katmanındadır: `dues.lateFee.<explanationKey>`. */
  explanationKey: "none" | "kmk_monthly" | "tcmb_reeskont";
}

export function calculateLateFee(input: LateFeeInput): LateFeeResult {
  const asOf = input.asOf ?? new Date();
  const mode = input.mode ?? "kmk_monthly";
  const grace = input.graceDays ?? 0;

  const overdueMs = asOf.getTime() - input.dueDate.getTime();
  const overdueDays = Math.max(0, Math.floor(overdueMs / 86_400_000) - grace);

  if (mode === "none" || overdueDays <= 0 || input.principalKurus <= 0) {
    return {
      feeKurus: 0,
      overdueDays: Math.max(0, overdueDays),
      chargedMonths: 0,
      effectiveMonthlyPct: 0,
      mode,
      explanationKey: "none",
    };
  }

  const monthlyPct =
    mode === "tcmb_reeskont"
      ? ((input.tcmbAnnualPct ?? 0) + (input.marginPct ?? 0)) / 12
      : Math.min(
          input.monthlyPct ?? siteConfig.dues.monthlyLateFeePct,
          siteConfig.dues.monthlyLateFeePct,
        );

  const months = input.prorateDaily ? overdueDays / 30 : Math.ceil(overdueDays / 30);
  const fee = roundHalfUp((input.principalKurus * monthlyPct * months) / 100);

  return {
    feeKurus: fee,
    overdueDays,
    chargedMonths: months,
    effectiveMonthlyPct: monthlyPct,
    mode,
    explanationKey: mode === "kmk_monthly" ? "kmk_monthly" : "tcmb_reeskont",
  };
}

/**
 * Borcun güncel toplam bakiyesi (anapara + gecikme - ödenen).
 * Ödeme mahsup sırası: önce gecikme tazminatı, sonra anapara (TBK md.100).
 */
export function outstandingBalance(params: {
  principalKurus: Kurus;
  lateFeeKurus: Kurus;
  paidKurus: Kurus;
}): { totalKurus: Kurus; remainingLateFeeKurus: Kurus; remainingPrincipalKurus: Kurus } {
  const total = params.principalKurus + params.lateFeeKurus - params.paidKurus;
  const feeAfter = Math.max(0, params.lateFeeKurus - params.paidKurus);
  const principalAfter = Math.max(0, params.principalKurus - Math.max(0, params.paidKurus - params.lateFeeKurus));
  return {
    totalKurus: Math.max(0, total),
    remainingLateFeeKurus: feeAfter,
    remainingPrincipalKurus: principalAfter,
  };
}
