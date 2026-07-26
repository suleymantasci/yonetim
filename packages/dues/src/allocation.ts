import type { Kurus } from "@yonetim/core";

/**
 * Ödeme mahsup motoru — SPEC Bölüm 6.1 / Faz 4 (webhook → otomatik eşleştirme).
 *
 * Sıra: en eski vadeli borçtan başlayarak, her borçta önce gecikme tazminatı
 * sonra anapara kapatılır (TBK md.100 kıyasen).
 */
export interface OpenDebt {
  id: string;
  dueDate: Date;
  amountKurus: Kurus;
  paidKurus: Kurus;
  lateFeeKurus: Kurus;
  kind?: string;
}

export interface Allocation {
  debtId: string;
  amountKurus: Kurus;
  appliedToLateFeeKurus: Kurus;
  appliedToPrincipalKurus: Kurus;
  fullyPaid: boolean;
}

export interface AllocationResult {
  allocations: Allocation[];
  allocatedKurus: Kurus;
  /** Borçları aştıysa avans/alacak bakiyesine yazılır. */
  creditBalanceKurus: Kurus;
}

export function allocatePayment(
  amountKurus: Kurus,
  openDebts: OpenDebt[],
  opts: { preferDebtIds?: string[] } = {},
): AllocationResult {
  const preferred = new Set(opts.preferDebtIds ?? []);
  const sorted = [...openDebts].sort((a, b) => {
    const ap = preferred.has(a.id) ? 0 : 1;
    const bp = preferred.has(b.id) ? 0 : 1;
    return ap - bp || a.dueDate.getTime() - b.dueDate.getTime();
  });

  let remaining = amountKurus;
  const allocations: Allocation[] = [];

  for (const debt of sorted) {
    if (remaining <= 0) break;
    const totalDue = debt.amountKurus + debt.lateFeeKurus - debt.paidKurus;
    if (totalDue <= 0) continue;

    const pay = Math.min(remaining, totalDue);
    // Daha önce ödenen kısım önce gecikme tazminatına saydırılmıştı.
    const feeRemaining = Math.max(0, debt.lateFeeKurus - debt.paidKurus);
    const toFee = Math.min(pay, feeRemaining);
    const toPrincipal = pay - toFee;

    allocations.push({
      debtId: debt.id,
      amountKurus: pay,
      appliedToLateFeeKurus: toFee,
      appliedToPrincipalKurus: toPrincipal,
      fullyPaid: pay >= totalDue,
    });
    remaining -= pay;
  }

  return {
    allocations,
    allocatedKurus: amountKurus - remaining,
    creditBalanceKurus: remaining,
  };
}

/**
 * Kiracı ayrıldığında kalan borcun devri — Bölüm 6.1 "Borç paylaşımı".
 * KMK md.22: kiracı, kira bedeli ile sınırlı olarak malikle **müteselsilen** sorumludur;
 * bu yüzden varsayılan politika borcu malike devretmektir.
 */
export type DebtTransferPolicy = "owner" | "next_tenant" | "keep";

export interface DebtTransferPlan {
  debtId: string;
  fromUserId: string | null;
  toUserId: string | null;
  amountKurus: Kurus;
  policy: DebtTransferPolicy;
  note: string;
}

export function planDebtTransfer(params: {
  debts: OpenDebt[];
  policy: DebtTransferPolicy;
  leavingUserId: string;
  ownerUserId: string | null;
  nextTenantUserId: string | null;
}): DebtTransferPlan[] {
  return params.debts
    .filter((d) => d.amountKurus + d.lateFeeKurus - d.paidKurus > 0)
    .map((d) => {
      const remaining = d.amountKurus + d.lateFeeKurus - d.paidKurus;
      const to =
        params.policy === "owner"
          ? params.ownerUserId
          : params.policy === "next_tenant"
            ? params.nextTenantUserId
            : params.leavingUserId;
      return {
        debtId: d.id,
        fromUserId: params.leavingUserId,
        toUserId: to,
        amountKurus: remaining,
        policy: params.policy,
        note:
          params.policy === "owner"
            ? "KMK md.20/22 uyarınca kalan borç malike devredildi."
            : params.policy === "next_tenant"
              ? "Devir protokolü gereği kalan borç yeni kiracıya devredildi."
              : "Borç ayrılan kişide bırakıldı (icra takibi kişi üzerinden yürür).",
      };
    });
}
