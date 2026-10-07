import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import type { StaffLedgerAdd, StaffLedgerResponse, StaffPayment } from "@yonetim/contracts";
import { bankAccounts, expenseCategories, expenses, staff, staffLedgerEntries } from "@yonetim/db";

import { AuditService } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import type { Database } from "../property/unit/types";

type Kind = StaffLedgerResponse["lines"][number]["kind"];
const ORDER: Record<Kind, number> = {
  opening_payable: 0, opening_advance: 0, accrual: 1, advance: 2, advance_deduction: 3, salary: 4,
};

/**
 * Personel carisi — iki bakiye:
 *  - maaş borcu (siteye göre personele ödenmemiş): tahakkuk + açılış −
 *    mahsup − maaş ödemesi
 *  - avans (personelin siteye borcu): avans + açılış − mahsup
 *
 * Ödeme ve avans gider olarak yazılıyor (`expenses.staff_id`): kasa/banka
 * dökümü ve "kapıcı maaşını dairelere dağıt" akışı aynen çalışıyor. Ödenmemiş
 * (yalnız onaylı) personel gideri cariyi etkilemiyor; para çıktığında etkiliyor.
 */
@Injectable()
export class StaffLedgerService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async ledger(staffId: string): Promise<StaffLedgerResponse> {
    return this.db.tx(async (tx) => {
      const person = await this.staffOf(tx, staffId);
      const [entries, payments] = await Promise.all([
        tx.select().from(staffLedgerEntries).where(eq(staffLedgerEntries.staffId, staffId)).orderBy(asc(staffLedgerEntries.entryDate)),
        this.paymentRows(tx, [staffId]),
      ]);

      type Raw = Omit<StaffLedgerResponse["lines"][number], "payableMinor" | "advanceMinor">;
      const raw: Raw[] = [
        ...entries.map((e) => {
          const kind = e.kind as Kind;
          const a = e.amountKurus;
          const effect =
            kind === "opening_payable" || kind === "accrual" ? [a, 0]
            : kind === "opening_advance" ? [0, a]
            : kind === "advance_deduction" ? [-a, -a]
            : [0, 0];
          const voided = e.voidedAt !== null;
          return {
            date: e.entryDate,
            kind,
            description: e.description ?? defaultText(kind, e.period),
            entryId: e.id,
            expenseId: null,
            payableDeltaMinor: voided ? 0 : effect[0]!,
            advanceDeltaMinor: voided ? 0 : effect[1]!,
            voided,
            voidReason: e.voidReason,
          };
        }),
        ...payments.map((p) => ({
          date: p.paidAt!,
          kind: (p.staffKind === "advance" ? "advance" : "salary") as Kind,
          description: p.description,
          entryId: null,
          expenseId: p.id,
          payableDeltaMinor: p.staffKind === "advance" ? 0 : -p.amountKurus,
          advanceDeltaMinor: p.staffKind === "advance" ? p.amountKurus : 0,
          voided: false,
          voidReason: null,
        })),
      ];
      raw.sort((a, b) => a.date.getTime() - b.date.getTime() || ORDER[a.kind] - ORDER[b.kind]);
      let payable = 0;
      let advance = 0;
      const lines = raw.map((l) => {
        payable += l.payableDeltaMinor;
        advance += l.advanceDeltaMinor;
        return { ...l, payableMinor: payable, advanceMinor: advance };
      });

      return {
        staff: {
          id: person.id,
          fullName: person.fullName,
          role: person.role,
          netSalaryMinor: person.netSalaryKurus,
          isActive: person.isActive,
        },
        payableMinor: payable,
        advanceMinor: advance,
        lines,
      };
    });
  }

  /** Liste ekranı için: personel başına iki bakiye. */
  async balances(tx: Database, ids: string[]): Promise<Map<string, { payable: number; advance: number }>> {
    const result = new Map<string, { payable: number; advance: number }>();
    if (ids.length === 0) return result;
    const get = (id: string) => {
      let b = result.get(id);
      if (!b) result.set(id, (b = { payable: 0, advance: 0 }));
      return b;
    };
    const entries = await tx
      .select({ staffId: staffLedgerEntries.staffId, kind: staffLedgerEntries.kind, amount: staffLedgerEntries.amountKurus })
      .from(staffLedgerEntries)
      .where(and(inArray(staffLedgerEntries.staffId, ids), isNull(staffLedgerEntries.voidedAt)));
    for (const e of entries) {
      const b = get(e.staffId);
      if (e.kind === "opening_payable" || e.kind === "accrual") b.payable += e.amount;
      else if (e.kind === "opening_advance") b.advance += e.amount;
      else if (e.kind === "advance_deduction") {
        b.payable -= e.amount;
        b.advance -= e.amount;
      }
    }
    for (const p of await this.paymentRows(tx, ids)) {
      const b = get(p.staffId!);
      if (p.staffKind === "advance") b.advance += p.amountKurus;
      else b.payable -= p.amountKurus;
    }
    return result;
  }

  async add(staffId: string, dto: StaffLedgerAdd): Promise<{ id: string }> {
    const id = await this.db.tx(async (tx) => {
      const person = await this.staffOf(tx, staffId);
      if (dto.kind === "accrual") {
        if (!dto.period) throw new BadRequestException("validation_failed:period_required");
        await assertNoAccrual(tx, staffId, dto.period);
      } else {
        const advance = (await this.balances(tx, [staffId])).get(staffId)?.advance ?? 0;
        if (dto.amountMinor > advance) throw new ConflictException("conflict:deduction_exceeds_advance");
      }
      const [created] = await tx
        .insert(staffLedgerEntries)
        .values({
          tenantId: this.db.ctx().tenantId,
          staffId,
          kind: dto.kind,
          entryDate: dto.entryDate,
          period: dto.kind === "accrual" ? dto.period! : null,
          amountKurus: dto.amountMinor,
          description: dto.description ?? `${defaultText(dto.kind, dto.period ?? null)} — ${person.fullName}`,
          createdBy: this.db.ctx().userId ?? null,
        })
        .returning({ id: staffLedgerEntries.id });
      return created!.id;
    });
    await this.audit.record({
      action: `staff_ledger_${dto.kind}`,
      resource: "staff",
      resourceId: staffId,
      diff: { amountMinor: { from: null, to: dto.amountMinor }, period: { from: null, to: dto.period ?? null } },
    });
    return { id };
  }

  async voidEntry(staffId: string, entryId: string, reason: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [row] = await tx
        .select({ id: staffLedgerEntries.id, voidedAt: staffLedgerEntries.voidedAt })
        .from(staffLedgerEntries)
        .where(and(eq(staffLedgerEntries.id, entryId), eq(staffLedgerEntries.staffId, staffId)))
        .limit(1)
        .for("update");
      if (!row) throw new NotFoundException("not_found");
      if (row.voidedAt) throw new ConflictException("conflict:entry_already_void");
      await tx.update(staffLedgerEntries).set({ voidedAt: new Date(), voidReason: reason }).where(eq(staffLedgerEntries.id, entryId));
    });
    await this.audit.record({ action: "staff_ledger_voided", resource: "staff", resourceId: staffId, reason, diff: { entryId: { from: entryId, to: null } } });
    return { id: entryId };
  }

  /** Maaş ödemesi / avans → ödenmiş gider (personele bağlı). */
  async pay(staffId: string, dto: StaffPayment): Promise<{ expenseId: string }> {
    const ctx = this.db.ctx();
    const expenseId = await this.db.tx(async (tx) => {
      const person = await this.staffOf(tx, staffId);
      if (dto.bankAccountId) {
        const [bank] = await tx.select({ id: bankAccounts.id }).from(bankAccounts).where(and(eq(bankAccounts.id, dto.bankAccountId), isNull(bankAccounts.deletedAt))).limit(1);
        if (!bank) throw new NotFoundException("not_found:bank_account");
      }
      // "Personel" adlı kategori varsa ona yazılıyor (gider raporları için);
      // yoksa kategorisiz. Mizanda personel ödemesi kategoriden bağımsız.
      const [category] = await tx
        .select({ id: expenseCategories.id })
        .from(expenseCategories)
        .where(sql`lower(${expenseCategories.name}) like 'personel%'`)
        .limit(1);
      const istanbul = new Date(dto.paidAt.getTime() + 3 * 3_600_000);
      const period = istanbul.toISOString().slice(0, 7);
      const label = dto.kind === "advance" ? "Avans" : "Maaş ödemesi";
      const [created] = await tx
        .insert(expenses)
        .values({
          tenantId: ctx.tenantId,
          categoryId: category?.id ?? null,
          vendorName: person.fullName,
          description: dto.description ?? `${label} — ${person.fullName}`,
          amountKurus: dto.amountMinor,
          vatRate: "0.00",
          vatKurus: 0,
          expenseDate: dto.paidAt,
          paidAt: dto.paidAt,
          bankAccountId: dto.bankAccountId ?? null,
          status: "paid",
          period,
          staffId,
          staffKind: dto.kind,
          createdBy: ctx.userId ?? null,
          approvedBy: ctx.userId ?? null,
        })
        .returning({ id: expenses.id });
      return created!.id;
    });
    await this.audit.record({
      action: dto.kind === "advance" ? "staff_advance_paid" : "staff_salary_paid",
      resource: "staff",
      resourceId: staffId,
      diff: { amountMinor: { from: null, to: dto.amountMinor }, expenseId: { from: null, to: expenseId } },
    });
    return { expenseId };
  }

  /** Dönem tahakkuku: aktif ve net ücreti girilmiş herkes, dönemde tahakkuku yoksa. */
  async accruePayroll(period: string, entryDate: Date): Promise<{ created: number; skipped: number }> {
    const ctx = this.db.ctx();
    const outcome = await this.db.tx(async (tx) => {
      const people = await tx
        .select({ id: staff.id, fullName: staff.fullName, net: staff.netSalaryKurus })
        .from(staff)
        .where(and(isNull(staff.deletedAt), eq(staff.isActive, true)));
      const existing = await tx
        .select({ staffId: staffLedgerEntries.staffId })
        .from(staffLedgerEntries)
        .where(and(eq(staffLedgerEntries.kind, "accrual"), eq(staffLedgerEntries.period, period), isNull(staffLedgerEntries.voidedAt)));
      const done = new Set(existing.map((e) => e.staffId));
      const todo = people.filter((p) => p.net > 0 && !done.has(p.id));
      if (todo.length > 0)
        await tx.insert(staffLedgerEntries).values(
          todo.map((p) => ({
            tenantId: ctx.tenantId,
            staffId: p.id,
            kind: "accrual",
            entryDate,
            period,
            amountKurus: p.net,
            description: `${defaultText("accrual", period)} — ${p.fullName}`,
            createdBy: ctx.userId ?? null,
          })),
        );
      return { created: todo.length, skipped: people.length - todo.length };
    });
    await this.audit.record({
      action: "staff_payroll_accrued",
      resource: "staff",
      diff: { period: { from: null, to: period }, created: { from: null, to: outcome.created } },
    });
    return outcome;
  }

  private async staffOf(tx: Database, id: string) {
    const [row] = await tx.select().from(staff).where(and(eq(staff.id, id), isNull(staff.deletedAt))).limit(1);
    if (!row) throw new NotFoundException("not_found");
    return row;
  }

  private paymentRows(tx: Database, ids: string[]) {
    return tx
      .select({
        id: expenses.id,
        staffId: expenses.staffId,
        staffKind: expenses.staffKind,
        amountKurus: expenses.amountKurus,
        paidAt: expenses.paidAt,
        description: expenses.description,
      })
      .from(expenses)
      .where(
        and(
          inArray(expenses.staffId, ids),
          isNull(expenses.deletedAt),
          isNotNull(expenses.paidAt),
          ne(expenses.status, "rejected"),
          inArray(expenses.staffKind, ["salary", "advance"]),
        ),
      );
  }
}

async function assertNoAccrual(tx: Database, staffId: string, period: string) {
  const [row] = await tx
    .select({ id: staffLedgerEntries.id })
    .from(staffLedgerEntries)
    .where(
      and(
        eq(staffLedgerEntries.staffId, staffId),
        eq(staffLedgerEntries.kind, "accrual"),
        eq(staffLedgerEntries.period, period),
        isNull(staffLedgerEntries.voidedAt),
      ),
    )
    .limit(1);
  if (row) throw new ConflictException("conflict:accrual_exists");
}

function defaultText(kind: string, period: string | null): string {
  switch (kind) {
    case "accrual":
      return `Maaş tahakkuku${period ? ` ${period}` : ""}`;
    case "advance_deduction":
      return "Avanstan mahsup";
    case "opening_payable":
      return "Açılış: maaş borcu";
    case "opening_advance":
      return "Açılış: avans bakiyesi";
    default:
      return kind;
  }
}
