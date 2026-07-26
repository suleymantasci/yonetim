import type { Kurus } from "@yonetim/core";

/**
 * Tahsilat şansı skoru — SPEC Bölüm 3.5.
 * **Kural motoru** (AI yok): avukata/yöneticiye yol gösterici 0-100 skor.
 */
export interface CollectionScoreInput {
  /** Borçlu malik mi kiracı mı. */
  isOwner: boolean;
  /** Son 24 ayda yaptığı ödeme sayısı. */
  paymentsLast24Months: number;
  /** Son 24 ayda tahakkuk sayısı. */
  accrualsLast24Months: number;
  /** Toplam gecikmiş borç. */
  outstandingKurus: Kurus;
  /** Aylık ortalama aidat. */
  monthlyDuesKurus: Kurus;
  /** En eski gecikmenin gün sayısı. */
  oldestOverdueDays: number;
  /** İletişim kurulabiliyor mu (telefon/WhatsApp doğrulanmış). */
  contactReachable: boolean;
  /** Daha önce ödeme sözü verip tutmuş mu. */
  keptPromise?: boolean | null;
  /** Dairede oturuyor mu (boş daire tahsilatı zor). */
  occupied: boolean;
  /** Daha önce icra takibi görmüş mü. */
  hadPreviousLegalCase: boolean;
}

export interface CollectionScoreFactor {
  /** i18n anahtarı: `legal.scoreFactor.<code>`. */
  code: string;
  delta: number;
  params?: Record<string, string | number>;
}

export interface CollectionScoreResult {
  score: number;
  band: "yuksek" | "orta" | "dusuk";
  factors: CollectionScoreFactor[];
  /** Öneri metni i18n katmanındadır: `legal.recommendation.<band>`. */
  recommendationKey: "yuksek" | "orta" | "dusuk";
}

export function collectionScore(input: CollectionScoreInput): CollectionScoreResult {
  const factors: CollectionScoreFactor[] = [];
  let score = 50;

  const add = (code: string, delta: number, params?: Record<string, string | number>) => {
    factors.push({ code, delta, params });
    score += delta;
  };

  const paymentRatio =
    input.accrualsLast24Months > 0
      ? input.paymentsLast24Months / input.accrualsLast24Months
      : 0;
  add("paymentHistory", Math.round((paymentRatio - 0.5) * 60), {
    pct: Math.round(paymentRatio * 100),
  });

  // KMK md.22: malikin bağımsız bölümü üzerinde kanuni ipotek kurulabilir,
  // bu yüzden malik borçlu olduğunda tahsilat şansı belirgin biçimde artar.
  add(input.isOwner ? "debtorIsOwner" : "debtorIsTenant", input.isOwner ? 15 : -10);

  const monthsOfDebt =
    input.monthlyDuesKurus > 0 ? input.outstandingKurus / input.monthlyDuesKurus : 0;
  if (monthsOfDebt > 12) add("debtOver12Months", -20);
  else if (monthsOfDebt > 6) add("debt6To12Months", -10);
  else add("debtUnder6Months", 8);

  if (input.oldestOverdueDays > 365) add("overdueOverAYear", -12);

  add(input.contactReachable ? "contactReachable" : "contactUnreachable",
    input.contactReachable ? 10 : -15);

  if (input.keptPromise === true) add("keptPromise", 12);
  else if (input.keptPromise === false) add("brokePromise", -12);

  if (!input.occupied) add("unitVacant", -8);
  if (input.hadPreviousLegalCase) add("previousLegalCase", -8);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band = score >= 66 ? "yuksek" : score >= 36 ? "orta" : "dusuk";

  return { score, band, factors, recommendationKey: band };
}
