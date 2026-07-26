import { siteConfig } from "@yonetim/config";
import { addHours } from "@yonetim/core";

/**
 * KVKK talep yaşam döngüsü — SPEC Bölüm 3.3 / 14.1.
 * md.11 bilgi talebi → 72 saat içinde yanıt (siteConfig.legal.kvkkResponseHours).
 */
export type KvkkRequestType =
  | "access"
  | "rectification"
  | "erasure"
  | "objection"
  | "portability";

/** Talep türü etiketleri i18n katmanındadır: `enum.kvkkRequestType.<type>`. */
export const KVKK_REQUEST_TYPES: readonly KvkkRequestType[] = [
  "access", "rectification", "erasure", "objection", "portability",
];

export function dueDateFor(type: KvkkRequestType, receivedAt = new Date()): Date {
  // Silme talebi "talep anında" işlenir; diğerleri 72 saat.
  const hours = type === "erasure" ? 24 : siteConfig.legal.kvkkResponseHours;
  return addHours(receivedAt, hours);
}

export interface DataSubjectPackage {
  subject: {
    userId: string;
    fullName: string;
    email: string | null;
    phoneMasked: string | null;
    createdAt: string;
  };
  tenants: { tenantId: string; tenantName: string; role: string; joinedAt: string }[];
  units: { unitId: string; label: string; relation: string; period: string }[];
  financial: {
    debts: { period: string; description: string; amountTl: number; status: string }[];
    payments: { paidAt: string; amountTl: number; method: string }[];
  };
  communications: { channel: string; direction: string; sentAt: string; template: string | null }[];
  consents: { kind: string; granted: boolean; grantedAt: string | null; version: string }[];
  accessLog: { accessorRole: string; dataCategory: string; at: string }[];
  meta: {
    generatedAt: string;
    legalBasis: string;
    retentionPolicy: string;
    contact: string;
  };
}

/**
 * md.11 paketinin sayısal özeti. Metne dönüştürme (PDF başlık bloğu) i18n
 * katmanında yapılır; bu fonksiyon dile bağımsız veri döndürür.
 */
export function packageSummary(pkg: DataSubjectPackage) {
  return {
    fullName: pkg.subject.fullName,
    generatedAt: pkg.meta.generatedAt,
    tenantCount: pkg.tenants.length,
    unitCount: pkg.units.length,
    debtCount: pkg.financial.debts.length,
    paymentCount: pkg.financial.payments.length,
    notificationCount: pkg.communications.length,
    accessLogCount: pkg.accessLog.length,
    legalBasis: pkg.meta.legalBasis,
    retentionPolicy: pkg.meta.retentionPolicy,
    contact: pkg.meta.contact,
  };
}

/**
 * Silme talebinde hangi veriler silinir, hangileri **yasal yükümlülük** gereği kalır.
 * (VUK md.253: defter ve belgeler 5 yıl; KMK: karar defteri süresiz.)
 */
export interface ErasurePlan {
  /** Silinecek alanlar — teknik alan adları, çeviri gerektirmez. */
  deletable: string[];
  /** Anonimleştirilecek alanlar; açıklama i18n anahtarıyla eşleşir. */
  anonymizable: { field: string; reasonKey: string }[];
  /**
   * Saklanacak tablolar. `reasonKey` → `kvkk.retention.<key>.reason`,
   * `untilKey` → `kvkk.retention.until.<key>`.
   */
  retained: {
    table: string;
    reasonKey: string;
    untilKey: "date" | "indefinite" | "days";
    untilValue?: string | number;
  }[];
}

export function planErasure(now = new Date()): ErasurePlan {
  const fiveYears = new Date(now.getFullYear() + 5, now.getMonth(), now.getDate())
    .toISOString()
    .slice(0, 10);
  return {
    deletable: [
      "users.avatar_url",
      "users.tckn_encrypted",
      "messages.body",
      "documents",
      "conversation_states",
      "nps_responses.comment",
    ],
    anonymizable: [
      { field: "users.first_name / last_name", reasonKey: "anonymizeName" },
      { field: "users.email / phone", reasonKey: "anonymizeContact" },
      { field: "poll_votes.user_id", reasonKey: "anonymizeVote" },
      { field: "requests.created_by_user_id", reasonKey: "anonymizeRequest" },
    ],
    retained: [
      {
        table: "debts / payments / invoices",
        reasonKey: "financialRecords",
        untilKey: "date",
        untilValue: fiveYears,
      },
      {
        table: "meeting_decisions",
        reasonKey: "decisionBook",
        untilKey: "indefinite",
      },
      {
        table: "audit_logs",
        reasonKey: "auditLog",
        untilKey: "days",
        untilValue: siteConfig.legal.logRetentionDays,
      },
    ],
  };
}
