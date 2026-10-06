import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type {
  BankStatementImport,
  BankStatementResult,
  BankTxActionResult,
} from "@yonetim/contracts";
import { errors } from "@yonetim/core";
import { matchTransaction, parseStatementCsv, type MatchCandidate } from "@yonetim/bank";
import { bankAccounts, bankTransactions } from "@yonetim/db";

import { DebtService } from "../finance/debt/debt.service";
import { AuditService } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import { grants } from "../identity/permission";

/**
 * Banka ekstresi içe aktarma ve mutabakat — `bank:reconcile`.
 *
 * NEDEN ÖNERİ, OTOMATİK TAHSİLAT DEĞİL: eşleştirme motoru kural tabanlı ve
 * yanılabilir (aynı isim, daire numarası geçen başka bir açıklama). Yüksek
 * güvenli eşleşme bile **tahsilat kaydı açmıyor**; `suggested` olarak duruyor
 * ve yönetici onaylayınca ödeme yazılıyor. Yanlış dairenin borcunu kapatmak,
 * geri alması (`payment:refund`, dört göz) zor bir hata.
 *
 * DURUMLAR (`bank_transactions.match_status`):
 *   unmatched  öneri çıkmadı, elle daire seçilecek
 *   suggested  motor daire önerdi, onay bekliyor
 *   auto       öneri olduğu gibi onaylandı → tahsilat yazıldı
 *   manual     yönetici başka daire seçti → tahsilat yazıldı
 *   ignored    çıkan hareket ya da yönetici yok saydı
 *
 * ONAY İKİ ADIMLI KİLİTLİ: önce satır durumu `UPDATE ... WHERE durum IN
 * (bekleyen)` ile **sahipleniliyor**, sonra tahsilat yazılıyor. İki sekmeden
 * aynı hareketi onaylamak ikinci tahsilatı üretmiyor; tahsilat başarısızsa
 * durum geri alınıyor.
 */
@Injectable()
export class BankReconcileService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly debts: DebtService,
  ) {}

  async importStatement(dto: BankStatementImport): Promise<BankStatementResult> {
    const parsed = parseStatementCsv(dto.csv);
    if (parsed.rows.length === 0) {
      throw errors.validation("statement_unreadable", { errors: parsed.errors.slice(0, 20) });
    }

    const result = await this.db.tx(async (tx) => {
      const [account] = await tx
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, dto.accountId), isNull(bankAccounts.deletedAt)))
        .limit(1);
      if (!account) throw new NotFoundException("bank_account_not_found");

      const candidates = await this.candidates(tx);

      const values = parsed.rows.map((row) => {
        const match = matchTransaction(row, candidates);
        const outgoing = row.direction === "out";
        return {
          tenantId: this.db.ctx().tenantId,
          accountId: dto.accountId,
          externalId: row.externalId,
          direction: row.direction,
          amountKurus: row.amountKurus,
          balanceAfterKurus: row.balanceAfterKurus ?? null,
          counterparty: row.counterparty ?? null,
          counterpartyIban: row.counterpartyIban ?? null,
          description: row.description ?? null,
          transactionAt: row.transactionAt,
          provider: row.provider,
          raw: row.raw,
          matchedUnitId: match.unitId,
          matchConfidence: match.unitId ? String(match.confidence) : null,
          matchStatus: outgoing ? "ignored" : match.unitId ? "suggested" : "unmatched",
        };
      });

      const inserted = await tx
        .insert(bankTransactions)
        .values(values)
        .onConflictDoNothing()
        .returning({ externalId: bankTransactions.externalId, status: bankTransactions.matchStatus });

      return {
        inserted: inserted.length,
        suggested: inserted.filter((r) => r.status === "suggested").length,
        unmatched: inserted.filter((r) => r.status === "unmatched").length,
        outgoing: inserted.filter((r) => r.status === "ignored").length,
      };
    });

    await this.audit.record({
      action: "bank_statement_imported",
      resource: "bank_account",
      resourceId: dto.accountId,
      reason: `${result.inserted}/${parsed.rows.length} hareket yazıldı`,
    });

    return {
      parsed: parsed.rows.length,
      ...result,
      duplicates: parsed.rows.length - result.inserted,
      errors: parsed.errors.slice(0, 50),
    };
  }

  async confirm(id: string, unitId?: string): Promise<BankTxActionResult> {
    // Tahsilat kaydı açıyor: `bank:reconcile` tek başına yetmez.
    if (!grants(this.db.maybeCtx(), "payment:create")) {
      throw new ForbiddenException("forbidden:payment:create");
    }

    const claimed = await this.db.tx(async (tx) => {
      const [row] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, id)).limit(1);
      if (!row) throw new NotFoundException("bank_transaction_not_found");
      if (row.direction !== "in") throw errors.validation("not_incoming");

      const targetUnit = unitId ?? row.matchedUnitId;
      if (!targetUnit) throw errors.validation("unit_required");

      const taken = await tx
        .update(bankTransactions)
        .set({
          matchStatus: unitId && unitId !== row.matchedUnitId ? "manual" : "auto",
          matchedUnitId: targetUnit,
        })
        .where(
          and(
            eq(bankTransactions.id, id),
            inArray(bankTransactions.matchStatus, ["unmatched", "suggested"]),
          ),
        )
        .returning({ id: bankTransactions.id });
      if (taken.length === 0) throw new BadRequestException("conflict:already_resolved");

      return { row, unitId: targetUnit };
    });

    try {
      const payment = await this.debts.collect({
        unitId: claimed.unitId,
        amountMinor: claimed.row.amountKurus,
        method: "bank_transfer",
        bankAccountId: claimed.row.accountId,
        paidAt: claimed.row.transactionAt,
        debtIds: [],
        note: `Banka ekstresi: ${[claimed.row.counterparty, claimed.row.description].filter(Boolean).join(" — ")}`.slice(0, 500),
      });

      const status = unitId && unitId !== claimed.row.matchedUnitId ? "manual" : "auto";
      await this.db.tx((tx) =>
        tx
          .update(bankTransactions)
          .set({ matchedPaymentId: payment.paymentId, matchStatus: status })
          .where(eq(bankTransactions.id, id)),
      );
      await this.audit.record({
        action: "bank_transaction_confirmed",
        resource: "bank_transaction",
        resourceId: id,
        reason: `tahsilat ${payment.paymentId}`,
      });
      return { id, status, paymentId: payment.paymentId };
    } catch (error) {
      // Tahsilat yazılamadı: hareket yeniden onaylanabilsin diye eski durumuna.
      await this.db.tx((tx) =>
        tx
          .update(bankTransactions)
          .set({ matchStatus: claimed.row.matchedUnitId ? "suggested" : "unmatched", matchedUnitId: claimed.row.matchedUnitId })
          .where(and(eq(bankTransactions.id, id), isNull(bankTransactions.matchedPaymentId))),
      );
      throw error;
    }
  }

  async ignore(id: string, reason: string): Promise<BankTxActionResult> {
    const updated = await this.db.tx((tx) =>
      tx
        .update(bankTransactions)
        .set({ matchStatus: "ignored", matchedUnitId: null })
        .where(
          and(
            eq(bankTransactions.id, id),
            inArray(bankTransactions.matchStatus, ["unmatched", "suggested"]),
          ),
        )
        .returning({ id: bankTransactions.id }),
    );
    if (updated.length === 0) throw new BadRequestException("conflict:already_resolved");
    await this.audit.record({
      action: "bank_transaction_ignored",
      resource: "bank_transaction",
      resourceId: id,
      reason,
    });
    return { id, status: "ignored", paymentId: null };
  }

  /**
   * Eşleştirme adayları: açık borcu olan daireler, aktif sakin adları ve
   * daha önce eşleşmiş hareketlerden bilinen IBAN'lar. Tek tur, üç sorgu.
   */
  private async candidates(tx: Parameters<Parameters<DbService["tx"]>[0]>[0]): Promise<MatchCandidate[]> {
    const units = (await tx.execute(sql`
      SELECT u.id, u.number,
             COALESCE(SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus)
               FILTER (WHERE d.id IS NOT NULL), 0)::bigint AS outstanding
        FROM units u
        LEFT JOIN debts d ON d.unit_id = u.id AND d.deleted_at IS NULL
                         AND d.status NOT IN ('paid','written_off','cancelled')
       WHERE u.deleted_at IS NULL
       GROUP BY u.id, u.number
    `)) as unknown as Array<{ id: string; number: string; outstanding: string | number }>;

    const names = (await tx.execute(sql`
      SELECT o.unit_id, trim(coalesce(us.first_name,'') || ' ' || coalesce(us.last_name,'')) AS name
        FROM unit_occupancies o JOIN users us ON us.id = o.user_id
       WHERE o.end_date IS NULL
    `)) as unknown as Array<{ unit_id: string; name: string }>;

    const ibans = (await tx.execute(sql`
      SELECT matched_unit_id AS unit_id, counterparty_iban AS iban
        FROM bank_transactions
       WHERE matched_unit_id IS NOT NULL AND counterparty_iban IS NOT NULL
         AND match_status IN ('auto','manual')
       GROUP BY matched_unit_id, counterparty_iban
    `)) as unknown as Array<{ unit_id: string; iban: string }>;

    return units.map((u) => ({
      unitId: u.id,
      unitLabel: u.number,
      residentNames: names.filter((n) => n.unit_id === u.id && n.name).map((n) => n.name),
      outstandingKurus: Number(u.outstanding),
      knownIbans: ibans.filter((i) => i.unit_id === u.id).map((i) => i.iban),
    }));
  }
}
