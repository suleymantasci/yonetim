/**
 * Yönetici KVKK Risk Skoru — SPEC Bölüm 3.3.
 * 0 (risksiz) - 100 (yüksek risk). Kural tabanlıdır.
 */
export interface KvkkRiskInput {
  /** Aydınlatma metni yayınlanmış mı. */
  hasPrivacyNotice: boolean;
  /** Açık rıza toplanan sakin oranı (0-1). */
  consentCoverage: number;
  /** Süresi geçmiş KVKK talebi sayısı. */
  overdueRequests: number;
  /** Son 90 günde bloklanan (KVKK ihlali içeren) duyuru sayısı. */
  blockedAnnouncements90d: number;
  /** İlişkisi bitmiş, hâlâ anonimleştirilmemiş sakin sayısı. */
  staleResidents: number;
  /** VERBİS kaydı yapılmış mı. */
  verbisRegistered: boolean;
  /** Veri sorumlusu irtibat kişisi atanmış mı. */
  hasDpoContact: boolean;
  /** Son 12 ayda bildirilmiş veri ihlali sayısı. */
  breaches12m: number;
  /** Yönetici hesabında 2FA açık mı. */
  mfaEnabled: boolean;
  /** Paylaşılan doküman içinde kimlik/nüfus fotokopisi var mı. */
  identityDocsStored: number;
}

export interface KvkkRiskIssue {
  /**
   * Bulgu kodu. Başlık ve aksiyon metinleri i18n katmanındadır:
   * `kvkk.risk.<code>.title` ve `kvkk.risk.<code>.action`.
   */
  code: string;
  weight: number;
  /** Metinde yer alan sayısal değer (örn. süresi geçen talep sayısı). */
  params?: Record<string, number>;
}

export interface KvkkRiskResult {
  score: number;
  level: "dusuk" | "orta" | "yuksek" | "kritik";
  issues: KvkkRiskIssue[];
}

export function kvkkRiskScore(input: KvkkRiskInput): KvkkRiskResult {
  const issues: KvkkRiskIssue[] = [];
  let score = 0;

  const add = (
    condition: boolean,
    code: string,
    weight: number,
    params?: Record<string, number>,
  ) => {
    if (condition) {
      issues.push({ code, weight, params });
      score += weight;
    }
  };

  add(!input.hasPrivacyNotice, "no_privacy_notice", 20);
  add(input.consentCoverage < 0.8, "low_consent", 15, {
    pct: Math.round(input.consentCoverage * 100),
  });
  add(input.overdueRequests > 0, "overdue_requests", 25, { count: input.overdueRequests });
  add(input.blockedAnnouncements90d > 0, "blocked_announcements", 10, {
    count: input.blockedAnnouncements90d,
  });
  add(input.staleResidents > 0, "stale_residents", 10, { count: input.staleResidents });
  add(!input.verbisRegistered, "no_verbis", 10);
  add(!input.hasDpoContact, "no_dpo", 5);
  add(input.breaches12m > 0, "breaches", 15, { count: input.breaches12m });
  add(!input.mfaEnabled, "no_mfa", 8);
  add(input.identityDocsStored > 0, "identity_docs", 7, { count: input.identityDocsStored });

  score = Math.min(100, score);
  const level = score >= 60 ? "kritik" : score >= 35 ? "yuksek" : score >= 15 ? "orta" : "dusuk";
  return { score, level, issues: issues.sort((a, b) => b.weight - a.weight) };
}
