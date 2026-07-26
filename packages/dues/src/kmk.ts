/**
 * 634 sayılı Kat Mülkiyeti Kanunu — karar yeter sayısı motoru.
 *
 * Etiketler ve örnekler i18n katmanındadır (`enum.quorumRule.*`,
 * `enum.quorumExample.*`); bu modül yalnızca hesap ve kanun referansı taşır.
 * SPEC Bölüm 6.5 / 6.6 (KMK md. 30, 31, 32, 34, 42, 44, 45).
 *
 * Not: Yeter sayılar **kat maliki sayısı** ve **arsa payı** üzerinden birlikte
 * değerlendirilir; kanun çoğu maddede "sayı ve arsa payı çoğunluğu" arar.
 */
export type QuorumRule =
  | "simple_majority"
  | "absolute_majority"
  | "two_thirds"
  | "four_fifths"
  | "unanimous";

export interface QuorumRuleInfo {
  rule: QuorumRule;
  /** Kanun maddesi referansı — her dilde aynı kalır. */
  legalRef: string;
  /** Katılanlar üzerinden mi, tüm kat malikleri üzerinden mi hesaplanır. */
  base: "attendees" | "all_owners";
  /** Gerekli oran (0-1). */
  ratio: number;
  /** Arsa payı çoğunluğu da aranır mı. */
  requiresShareMajority: boolean;
}

export const QUORUM_RULES: Record<QuorumRule, QuorumRuleInfo> = {
  simple_majority: {
    rule: "simple_majority",
    legalRef: "KMK md.32/1",
    base: "attendees",
    ratio: 0.5,
    requiresShareMajority: false,
  },
  absolute_majority: {
    rule: "absolute_majority",
    legalRef: "KMK md.30/2, md.34",
    base: "all_owners",
    ratio: 0.5,
    requiresShareMajority: true,
  },
  two_thirds: {
    rule: "two_thirds",
    legalRef: "KMK md.42 (ortak yer değişikliği), md.45 kıyasen",
    base: "all_owners",
    ratio: 2 / 3,
    requiresShareMajority: false,
  },
  four_fifths: {
    rule: "four_fifths",
    legalRef: "KMK md.44, md.28/son (yönetim planı değişikliği)",
    base: "all_owners",
    ratio: 0.8,
    requiresShareMajority: false,
  },
  unanimous: {
    rule: "unanimous",
    legalRef: "KMK md.19/2, md.45",
    base: "all_owners",
    ratio: 1,
    requiresShareMajority: false,
  },
};

export interface QuorumInput {
  rule: QuorumRule;
  /** Toplam kat maliki sayısı. */
  totalOwners: number;
  /** Toplam arsa payı (genelde 1 veya 1000). */
  totalShare: number;
  /** Lehte oy veren kat maliki sayısı. */
  votesForCount: number;
  votesForShare: number;
  votesAgainstCount: number;
  votesAgainstShare: number;
  abstainCount?: number;
  /** Toplantıya katılan kat maliki sayısı. */
  attendeeCount: number;
  attendeeShare: number;
  /** İkinci toplantı mı (KMK md.30/3: ikinci toplantıda katılan sayısı yeterlidir). */
  isSecondCall?: boolean;
}

export interface QuorumResult {
  passed: boolean;
  rule: QuorumRuleInfo;
  /** Yeter sayı sağlanamadıysa nedeni (i18n anahtarı ile eşleşir). */
  failureReason: "meeting_quorum" | "count" | "share" | null;
  requiredCount: number;
  requiredShare: number;
  achievedCount: number;
  achievedShare: number;
  meetingQuorumMet: boolean;
}

/**
 * Toplantı yeter sayısı (KMK md.30): ilk toplantıda kat maliklerinin
 * **sayı ve arsa payı bakımından yarısından fazlası**; ikinci toplantıda
 * katılanlarla yetinilir (yönetici/denetçi seçimi ve olağan işler için).
 */
export function meetingQuorumMet(input: {
  totalOwners: number;
  totalShare: number;
  attendeeCount: number;
  attendeeShare: number;
  isSecondCall?: boolean;
}): boolean {
  if (input.isSecondCall) return input.attendeeCount > 0;
  return (
    input.attendeeCount > input.totalOwners / 2 && input.attendeeShare > input.totalShare / 2
  );
}

export function evaluateQuorum(input: QuorumInput): QuorumResult {
  const rule = QUORUM_RULES[input.rule];
  const meetingOk = meetingQuorumMet(input);

  const baseCount = rule.base === "all_owners" ? input.totalOwners : input.attendeeCount;
  const baseShare = rule.base === "all_owners" ? input.totalShare : input.attendeeShare;

  const requiredCount =
    rule.rule === "unanimous" ? baseCount : Math.floor(baseCount * rule.ratio) + 1;
  const requiredShare = rule.requiresShareMajority || rule.rule === "unanimous"
    ? rule.rule === "unanimous"
      ? baseShare
      : baseShare * rule.ratio
    : 0;

  const countOk = input.votesForCount >= Math.min(requiredCount, baseCount);
  const shareOk = requiredShare === 0 || input.votesForShare > requiredShare - 1e-9;
  const passed = meetingOk && countOk && shareOk;

  const failureReason: QuorumResult["failureReason"] = !meetingOk
    ? "meeting_quorum"
    : !countOk
      ? "count"
      : !shareOk
        ? "share"
        : null;

  return {
    passed,
    rule,
    requiredCount,
    requiredShare,
    achievedCount: input.votesForCount,
    achievedShare: input.votesForShare,
    meetingQuorumMet: meetingOk,
    failureReason,
  };
}

/** Oy ağırlığı: eşit (her bağımsız bölüm 1 oy) veya arsa payı (KMK md.31). */
export function voteWeight(mode: "equal" | "land_share", landShare: number | null): number {
  if (mode === "equal") return 1;
  return landShare && landShare > 0 ? landShare : 0;
}
