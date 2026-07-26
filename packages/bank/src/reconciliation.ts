import { foldTurkish, type Kurus } from "@yonetim/core";

import type { BankTransactionDto } from "./providers";

/**
 * Mutabakat motoru — SPEC Bölüm 3.10 / 6.2.
 * Banka hareketini daire/sakine eşleştirir. Kural tabanlıdır (AI yok — Bölüm 9.3).
 */

export interface MatchCandidate {
  unitId: string;
  unitLabel: string;
  residentNames: string[];
  /** Bu daireye ait ödenmemiş toplam borç. */
  outstandingKurus: Kurus;
  /** Bilinen IBAN'lar (daha önce bu IBAN'dan ödeme geldiyse). */
  knownIbans?: string[];
}

export interface MatchReason {
  /** i18n anahtarı: `app.bank.reason.<code>`. */
  code: "knownIban" | "unitMentioned" | "nameMatch" | "exactAmount" | "closeAmount" | "none" | "outgoing";
  params?: Record<string, string | number>;
}

export interface MatchResult {
  unitId: string | null;
  confidence: number;
  reasons: MatchReason[];
  /** 'auto' eşiği geçtiyse otomatik eşleştirilir, aksi halde manuel kuyruk. */
  decision: "auto" | "review" | "unmatched";
}

const AUTO_THRESHOLD = 0.8;
const REVIEW_THRESHOLD = 0.3;

export function matchTransaction(
  tx: BankTransactionDto,
  candidates: MatchCandidate[],
): MatchResult {
  if (tx.direction !== "in") {
    return { unitId: null, confidence: 0, reasons: [{ code: "outgoing" }], decision: "unmatched" };
  }

  // Banka açıklamaları ASCII-büyük harf gelir; her iki tarafı da katlayarak karşılaştırırız.
  const haystack = foldTurkish(`${tx.description ?? ""} ${tx.counterparty ?? ""}`);
  let best: { c: MatchCandidate; score: number; reasons: MatchReason[] } | null = null;

  for (const c of candidates) {
    const reasons: MatchReason[] = [];
    let score = 0;

    // 1) Daha önce aynı IBAN'dan ödeme gelmişse en güçlü sinyal.
    if (tx.counterpartyIban && c.knownIbans?.some((i) => sameIban(i, tx.counterpartyIban!))) {
      score += 0.6;
      reasons.push({ code: "knownIban" });
    }

    // 2) Açıklamada daire numarası geçiyor mu ("A-12", "12 nolu daire", "daire 12").
    if (unitMentioned(haystack, c.unitLabel)) {
      score += 0.35;
      reasons.push({ code: "unitMentioned", params: { unit: c.unitLabel } });
    }

    // 3) Sakin adı eşleşmesi.
    const nameHit = c.residentNames.find((n) => nameMatches(haystack, n));
    if (nameHit) {
      score += 0.35;
      reasons.push({ code: "nameMatch", params: { name: nameHit } });
    }

    // 4) Tutar tam eşleşmesi.
    if (c.outstandingKurus > 0 && tx.amountKurus === c.outstandingKurus) {
      score += 0.25;
      reasons.push({ code: "exactAmount" });
    } else if (c.outstandingKurus > 0 && Math.abs(tx.amountKurus - c.outstandingKurus) <= 100) {
      score += 0.1;
      reasons.push({ code: "closeAmount" });
    }

    if (!best || score > best.score) best = { c, score, reasons };
  }

  if (!best || best.score < REVIEW_THRESHOLD) {
    return {
      unitId: null,
      confidence: best?.score ?? 0,
      reasons: best?.reasons.length ? best.reasons : [{ code: "none" as const }],
      decision: "unmatched",
    };
  }

  return {
    unitId: best.c.unitId,
    confidence: Math.min(1, Number(best.score.toFixed(2))),
    reasons: best.reasons,
    decision: best.score >= AUTO_THRESHOLD ? "auto" : "review",
  };
}

function sameIban(a: string, b: string): boolean {
  return a.replace(/\s/g, "").toUpperCase() === b.replace(/\s/g, "").toUpperCase();
}

function unitMentioned(haystack: string, unitLabel: string): boolean {
  const label = foldTurkish(unitLabel).replace(/\s/g, "");
  if (!label) return false;
  const compact = haystack.replace(/\s/g, "");
  if (compact.includes(label)) return true;
  const numeric = label.replace(/[^0-9]/g, "");
  if (!numeric) return false;
  return new RegExp(`(daire|no|bb|bagimsiz)[^0-9]{0,4}${numeric}\\b`).test(haystack);
}

function nameMatches(haystack: string, fullName: string): boolean {
  const parts = foldTurkish(fullName)
    .split(/\s+/)
    .filter((p) => p.length >= 3);
  if (parts.length === 0) return false;
  const hits = parts.filter((p) => haystack.includes(p)).length;
  return hits >= Math.min(2, parts.length);
}

/**
 * Ödeme ↔ banka hareketi mutabakatı (Bölüm 3.10 reconciliation queue).
 * Webhook ile alınan ödemeler ile banka ekstresi karşılaştırılır.
 */
export interface ReconciliationInput {
  /** Ödeme sağlayıcısından gelen kayıtlar. */
  payments: { id: string; amountKurus: Kurus; paidAt: Date; processorRef: string | null }[];
  /** Bankaya düşen tahsilatlar. */
  bankTransactions: { id: string; amountKurus: Kurus; transactionAt: Date; matchedPaymentId: string | null }[];
  /** Tolerans (gün). */
  windowDays?: number;
}

export interface ReconciliationIssue {
  /** Açıklama i18n katmanındadır: `app.bank.issue.<kind>`. */
  kind: "missing_in_bank" | "missing_in_system" | "amount_mismatch" | "duplicate";
  severity: "info" | "warning" | "critical";
  paymentId?: string;
  bankTransactionId?: string;
  expectedKurus?: Kurus;
  actualKurus?: Kurus;
}

export function reconcile(input: ReconciliationInput): ReconciliationIssue[] {
  const windowMs = (input.windowDays ?? 3) * 86_400_000;
  const issues: ReconciliationIssue[] = [];
  const usedBankIds = new Set<string>();

  for (const p of input.payments) {
    const match = input.bankTransactions.find(
      (b) =>
        !usedBankIds.has(b.id) &&
        Math.abs(b.transactionAt.getTime() - p.paidAt.getTime()) <= windowMs &&
        Math.abs(b.amountKurus - p.amountKurus) <= 100,
    );
    if (!match) {
      issues.push({
        kind: "missing_in_bank",
        severity: "critical",
        paymentId: p.id,
        expectedKurus: p.amountKurus,
      });
      continue;
    }
    usedBankIds.add(match.id);
    if (match.amountKurus !== p.amountKurus) {
      issues.push({
        kind: "amount_mismatch",
        severity: "warning",
        paymentId: p.id,
        bankTransactionId: match.id,
        expectedKurus: p.amountKurus,
        actualKurus: match.amountKurus,
      });
    }
  }

  for (const b of input.bankTransactions) {
    if (usedBankIds.has(b.id) || b.matchedPaymentId) continue;
    issues.push({
      kind: "missing_in_system",
      severity: "warning",
      bankTransactionId: b.id,
      actualKurus: b.amountKurus,
    });
  }

  return issues;
}
