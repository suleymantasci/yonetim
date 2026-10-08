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
  /**
   * Daha önce bu daireye tahsil edilmiş gönderen adları — sakin olmayan
   * biri (akraba, kiracının işvereni) düzenli ödüyorsa bir sonraki sefer
   * tanınır.
   */
  knownSenders?: string[];
}

export interface MatchReason {
  /** i18n anahtarı: `app.bank.reason.<code>`. */
  code:
    | "knownIban"
    | "knownSender"
    | "unitMentioned"
    | "nameMatch"
    | "noteName"
    | "exactAmount"
    | "closeAmount"
    | "none"
    | "outgoing";
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

/**
 * Sinyal ağırlıkları. Öncelik **gönderen adı**, sonra açıklama: ödeme başkası
 * adına yapılabiliyor ("Daire 5 Ayşe Kaya aidat" yazan bir akraba). Gönderen
 * bir sakinse o tek başına açıklamadaki ad + daire toplamını (0.3 + 0.3)
 * geçer; gönderen sakin değilse açıklama belirler (yalnız ad da öneri için
 * yeter).
 */
const WEIGHT = {
  knownIban: 0.6,
  knownSender: 0.6,
  sender: 0.65,
  unit: 0.3,
  note: 0.3,
  /** Gönderen ayrılamamış dökümde açıklamadaki ad (çoğunlukla gönderendir). */
  plainName: 0.4,
  exactAmount: 0.25,
  closeAmount: 0.1,
} as const;

export function matchTransaction(
  tx: BankTransactionDto,
  candidates: MatchCandidate[],
): MatchResult {
  if (tx.direction !== "in") {
    return { unitId: null, confidence: 0, reasons: [{ code: "outgoing" }], decision: "unmatched" };
  }

  // Banka açıklamaları ASCII-büyük harf gelir; her iki tarafı da katlayarak karşılaştırırız.
  const sender = tx.counterparty ? foldTurkish(tx.counterparty) : "";
  // Not yoksa (API sağlayıcıları ayırmıyor) açıklamanın tamamına bakılır.
  const note = foldTurkish(tx.note ?? tx.description ?? "");
  let best: { c: MatchCandidate; score: number; reasons: MatchReason[] } | null = null;

  for (const c of candidates) {
    const reasons: MatchReason[] = [];
    let score = 0;

    // 1) Daha önce aynı IBAN'dan ya da aynı gönderenden bu daireye ödeme geldi.
    if (tx.counterpartyIban && c.knownIbans?.some((i) => sameIban(i, tx.counterpartyIban!))) {
      score += WEIGHT.knownIban;
      reasons.push({ code: "knownIban" });
    } else if (sender && c.knownSenders?.some((n) => foldTurkish(n) === sender)) {
      score += WEIGHT.knownSender;
      reasons.push({ code: "knownSender", params: { name: tx.counterparty! } });
    }

    // 2) Gönderen adı bir sakinin adı mı (öncelikli sinyal).
    const senderHit = sender ? c.residentNames.find((n) => nameMatches(sender, n)) : undefined;
    if (senderHit) {
      score += WEIGHT.sender;
      reasons.push({ code: "nameMatch", params: { name: senderHit } });
    }

    // 3) Açıklamada daire numarası geçiyor mu ("A-12", "12 nolu daire", "daire 12").
    if (unitMentioned(note, c.unitLabel)) {
      score += WEIGHT.unit;
      reasons.push({ code: "unitMentioned", params: { unit: c.unitLabel } });
    }

    // 4) Açıklamada sakin adı (başkası adına ödeme). Gönderen ayrılamadıysa
    //    açıklamadaki ad büyük olasılıkla gönderendir: daha ağır.
    const noteHit = senderHit ? undefined : c.residentNames.find((n) => nameMatches(note, n));
    if (noteHit) {
      score += sender ? WEIGHT.note : WEIGHT.plainName;
      reasons.push({ code: sender ? "noteName" : "nameMatch", params: { name: noteHit } });
    }

    // 5) Tutar tam eşleşmesi.
    if (c.outstandingKurus > 0 && tx.amountKurus === c.outstandingKurus) {
      score += WEIGHT.exactAmount;
      reasons.push({ code: "exactAmount" });
    } else if (c.outstandingKurus > 0 && Math.abs(tx.amountKurus - c.outstandingKurus) <= 100) {
      score += WEIGHT.closeAmount;
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

/**
 * Açıklamada daire geçiyor mu. Yalnız rakamlı numara ("6") tek başına
 * aranmaz — dekont/hesap numaralarının içinde her zaman bir "6" vardır;
 * "daire 6", "D:6", "no 6", "6 nolu", "6 numara" gibi bağlam gerekir.
 * Harfli etiket ("A12", "B-7") ayraçlı yazılışlarıyla ("a 12", "a-12"),
 * başka harf/rakama bitişik olmadan aranır.
 */
function unitMentioned(haystack: string, unitLabel: string): boolean {
  const label = foldTurkish(unitLabel);
  const parts = label.match(/[a-z]+|[0-9]+/g) ?? [];
  if (parts.length === 0) return false;
  if (/[a-z]/.test(label)) {
    const body = parts.map(escapeRe).join("[\\s\\-/:.]*");
    if (new RegExp(`(?<![0-9a-z])${body}(?![0-9a-z])`).test(haystack)) return true;
  }
  const digits = parts.filter((p) => /^[0-9]+$/.test(p));
  if (digits.length !== 1) return false;
  const n = digits[0]!.replace(/^0+(?=\d)/, "");
  const keyword = "(?:daire|no|nolu|bb|bagimsiz bolum|bagimsiz|kapi)[^0-9a-z]{0,4}|d[^0-9a-z]{1,4}";
  return (
    new RegExp(`(?<![a-z])(?:${keyword})0*${n}(?![0-9])`).test(haystack) ||
    new RegExp(`(?<![0-9])0*${n}\\s*(?:nolu|no|numara|numarali)(?![a-z])`).test(haystack)
  );
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
