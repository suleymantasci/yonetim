import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import type {
  CashHandoverCreate,
  CashHandoverRow,
  CashIncomeCreate,
  CashOverview,
  CashTransferCreate,
  HandoverSnapshot,
  IncomeGroupSave,
} from "@yonetim/contracts";
import { bankAccounts, cashHandovers, cashMovements, incomeGroups } from "@yonetim/db";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";
import { istanbulEnd, istanbulStart } from "../accounting/accounting.service";
import { isCashCode, loadJournal } from "../accounting/journal";
import { StatementService } from "../accounting/statement.service";
import { balancesAt } from "../accounting/statements";

const DAY_MS = 86_400_000;

/**
 * Kasa işlemleri — virman, harici tahsilat, kasa devir tutanağı.
 *
 * Bakiyeler kayıtlı bir alandan değil, fiş listesinden (`journal.ts`)
 * hesaplanıyor: mizan ve bilançoyla aynı sayı. `bank_accounts.balance_kurus`
 * banka entegrasyonunun söylediği değer, bizim defterimiz değil.
 */
@Injectable()
export class CashService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly statements: StatementService,
  ) {}

  async overview(): Promise<CashOverview> {
    const now = new Date();
    return this.db.tx(async (tx) => {
      const [journal, banks, movements, groups] = await Promise.all([
        loadJournal(tx, now),
        tx
          .select()
          .from(bankAccounts)
          .where(isNull(bankAccounts.deletedAt))
          .orderBy(bankAccounts.createdAt),
        tx
          .select()
          .from(cashMovements)
          .orderBy(
            desc(cashMovements.movementDate),
            desc(cashMovements.createdAt),
          )
          .limit(200),
        tx
          .select({
            id: incomeGroups.id,
            name: incomeGroups.name,
            accountCode: incomeGroups.accountCode,
            isActive: incomeGroups.isActive,
            usage: sql<number>`(SELECT COUNT(*)::int FROM cash_movements cm WHERE cm.income_group_id = income_groups.id AND cm.voided_at IS NULL)`,
          })
          .from(incomeGroups)
          .where(isNull(incomeGroups.deletedAt))
          .orderBy(incomeGroups.name),
      ]);
      const groupName = new Map(groups.map((g) => [g.id, g.name]));
      const balances = balancesAt(journal, now);
      const since = now.getTime() - 30 * DAY_MS;
      const flow = new Map<string, { in: number; out: number }>();
      for (const e of journal.entries) {
        if (e.date.getTime() < since) continue;
        for (const l of e.lines) {
          if (!isCashCode(l.code)) continue;
          const f = flow.get(l.code) ?? { in: 0, out: 0 };
          f.in += l.debit;
          f.out += l.credit;
          flow.set(l.code, f);
        }
      }
      const codeByBank = journal.bankCodes;
      const label = (b: typeof bankAccounts.$inferSelect) =>
        [b.bankName, b.accountName ?? b.ibanMasked].filter(Boolean).join(" · ");
      const accounts: CashOverview["accounts"] = [
        {
          code: "100",
          account: "cash",
          bankAccountId: null,
          label: "Kasa (nakit)",
          balanceMinor: balances.get("100") ?? 0,
          inMinor: flow.get("100")?.in ?? 0,
          outMinor: flow.get("100")?.out ?? 0,
        },
        ...banks.map((b) => {
          const code = codeByBank.get(b.id) ?? "102.00";
          return {
            code,
            account: "bank" as const,
            bankAccountId: b.id,
            label: label(b),
            balanceMinor: balances.get(code) ?? 0,
            inMinor: flow.get(code)?.in ?? 0,
            outMinor: flow.get(code)?.out ?? 0,
          };
        }),
      ];
      const unassigned = balances.get("102.00") ?? 0;
      if (unassigned !== 0)
        accounts.push({
          code: "102.00",
          account: "bank",
          bankAccountId: null,
          label: journal.accounts.get("102.00") ?? "102.00",
          balanceMinor: unassigned,
          inMinor: flow.get("102.00")?.in ?? 0,
          outMinor: flow.get("102.00")?.out ?? 0,
        });

      const bankLabel = new Map(banks.map((b) => [b.id, label(b)]));
      const side = (account: string | null, bankId: string | null) =>
        account === null
          ? null
          : account === "cash"
            ? "Kasa (nakit)"
            : (bankLabel.get(bankId ?? "") ?? "Banka hesabı");

      return {
        accounts,
        totalMinor: accounts.reduce((s, a) => s + a.balanceMinor, 0),
        movements: movements.map((m) => ({
          id: m.id,
          kind: m.kind as "transfer" | "income",
          date: m.movementDate,
          amountMinor: m.amountKurus,
          fromLabel: side(m.fromAccount, m.fromBankAccountId),
          toLabel: side(m.toAccount, m.toBankAccountId) ?? "",
          category: m.incomeCategory,
          incomeGroupName: m.incomeGroupId ? (groupName.get(m.incomeGroupId) ?? null) : null,
          payerName: m.payerName,
          description: m.description,
          documentNo: m.documentNo,
          voidedAt: m.voidedAt,
          voidReason: m.voidReason,
        })),
        bankOptions: banks
          .filter((b) => b.isActive)
          .map((b) => ({ id: b.id, label: label(b) })),
        incomeGroups: groups.map((g) => ({ ...g, usage: Number(g.usage) })),
      };
    });
  }

  async transfer(dto: CashTransferCreate): Promise<{ id: string }> {
    const date = dayOf(dto.date);
    const id = await this.db.tx(async (tx) => {
      await assertBanks(tx, [dto.from.bankAccountId, dto.to.bankAccountId]);
      const ctx = this.db.ctx();
      const [row] = await tx
        .insert(cashMovements)
        .values({
          tenantId: ctx.tenantId,
          kind: "transfer",
          movementDate: date,
          amountKurus: dto.amountMinor,
          fromAccount: dto.from.account,
          fromBankAccountId:
            dto.from.account === "bank" ? dto.from.bankAccountId! : null,
          toAccount: dto.to.account,
          toBankAccountId:
            dto.to.account === "bank" ? dto.to.bankAccountId! : null,
          description: dto.description ?? null,
          documentNo: dto.documentNo ?? null,
          createdBy: ctx.userId ?? null,
        })
        .returning({ id: cashMovements.id });
      return row!.id;
    });
    await this.audit.record({
      action: "cash_transfer_created",
      resource: "cash_movement",
      resourceId: id,
      diff: { amountMinor: { from: null, to: dto.amountMinor } },
    });
    return { id };
  }

  async income(dto: CashIncomeCreate): Promise<{ id: string }> {
    const date = dayOf(dto.date);
    const id = await this.db.tx(async (tx) => {
      await assertBanks(tx, [dto.to.bankAccountId]);
      if (dto.incomeGroupId) {
        const [group] = await tx
          .select({ id: incomeGroups.id })
          .from(incomeGroups)
          .where(and(eq(incomeGroups.id, dto.incomeGroupId), eq(incomeGroups.isActive, true), isNull(incomeGroups.deletedAt)))
          .limit(1);
        if (!group) throw new NotFoundException("not_found:income_group");
      }
      const ctx = this.db.ctx();
      const [row] = await tx
        .insert(cashMovements)
        .values({
          tenantId: ctx.tenantId,
          kind: "income",
          movementDate: date,
          amountKurus: dto.amountMinor,
          toAccount: dto.to.account,
          toBankAccountId:
            dto.to.account === "bank" ? dto.to.bankAccountId! : null,
          incomeCategory: dto.incomeGroupId ? null : (dto.category ?? "other"),
          incomeGroupId: dto.incomeGroupId ?? null,
          payerName: dto.payerName,
          description: dto.description ?? null,
          documentNo: dto.documentNo ?? null,
          createdBy: ctx.userId ?? null,
        })
        .returning({ id: cashMovements.id });
      return row!.id;
    });
    await this.audit.record({
      action: "cash_income_created",
      resource: "cash_movement",
      resourceId: id,
      diff: {
        amountMinor: { from: null, to: dto.amountMinor },
        category: { from: null, to: dto.incomeGroupId ?? dto.category ?? null },
      },
    });
    return { id };
  }

  /** İptal: kayıt silinmez, fiş listesinden düşer. */
  async void(id: string, reason: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [row] = await tx
        .select()
        .from(cashMovements)
        .where(eq(cashMovements.id, id))
        .limit(1);
      if (!row) throw new NotFoundException("not_found");
      if (row.voidedAt) throw new ConflictException("conflict:already_voided");
      await tx
        .update(cashMovements)
        .set({
          voidedAt: new Date(),
          voidReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(cashMovements.id, id));
    });
    await this.audit.record({
      action: "cash_movement_voided",
      resource: "cash_movement",
      resourceId: id,
      reason,
    });
    return { id };
  }

  async handovers(): Promise<{ rows: CashHandoverRow[] }> {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(cashHandovers)
        .orderBy(desc(cashHandovers.handoverDate))
        .limit(50);
      return { rows: rows.map(toHandoverRow) };
    });
  }

  async handover(id: string): Promise<CashHandoverRow> {
    const row = await this.db.tx(async (tx) => {
      const [r] = await tx
        .select()
        .from(cashHandovers)
        .where(eq(cashHandovers.id, id))
        .limit(1);
      return r ?? null;
    });
    if (!row) throw new NotFoundException("not_found");
    return toHandoverRow(row);
  }

  /**
   * Devir tutanağı: o günün sonundaki bakiyeler dondurulur. Sonradan
   * geriye dönük girilen bir kayıt imzalı tutanağı değiştirmemeli; bu yüzden
   * rakamlar hesaplanıp `snapshot` olarak saklanıyor.
   */
  async createHandover(dto: CashHandoverCreate): Promise<{ id: string }> {
    const end = istanbulEnd(dto.date);
    if (istanbulStart(dto.date).getTime() > Date.now())
      throw new BadRequestException("validation_failed:handover_in_future");

    const units = await this.statements.unitStatements({
      from: dto.date,
      to: dto.date,
    });
    const id = await this.db.tx(async (tx) => {
      const journal = await loadJournal(tx, end);
      const balances = balancesAt(journal, end);
      const accounts = [...balances.entries()]
        .filter(([code, v]) => isCashCode(code) && code !== "102" && v !== 0)
        .sort(([a], [b]) => a.localeCompare(b, "tr", { numeric: true }))
        .map(([code, v]) => ({
          code,
          label:
            code === "100"
              ? "Kasa (nakit)"
              : (journal.accounts.get(code) ?? code),
          balanceMinor: v,
        }));
      const get = (code: string) => balances.get(code) ?? 0;
      const cashTotal = accounts.reduce((s, a) => s + a.balanceMinor, 0);
      const receivables = get("120");
      const advances = get("196");
      const vendorPayables = -get("320");
      const staffPayables = -get("335");
      const debtors = units.rows
        .filter((u) => u.closingMinor > 0)
        .sort((a, b) => b.closingMinor - a.closingMinor);
      const snapshot: HandoverSnapshot = {
        accounts,
        cashTotalMinor: cashTotal,
        receivablesMinor: receivables,
        advancesMinor: advances,
        vendorPayablesMinor: vendorPayables,
        staffPayablesMinor: staffPayables,
        netMinor:
          cashTotal + receivables + advances - vendorPayables - staffPayables,
        debtors: debtors
          .slice(0, 20)
          .map((u) => ({
            unit: u.holder ? `${u.label} — ${u.holder}` : u.label,
            balanceMinor: u.closingMinor,
          })),
        openDebtorCount: debtors.length,
      };
      const ctx = this.db.ctx();
      const [row] = await tx
        .insert(cashHandovers)
        .values({
          tenantId: ctx.tenantId,
          handoverDate: istanbulStart(dto.date),
          fromName: dto.fromName,
          toName: dto.toName,
          note: dto.note ?? null,
          snapshot,
          createdBy: ctx.userId ?? null,
        })
        .returning({ id: cashHandovers.id });
      return row!.id;
    });
    await this.audit.record({
      action: "cash_handover_created",
      resource: "cash_handover",
      resourceId: id,
    });
    return { id };
  }
}

type Tx = Parameters<Parameters<DbService["tx"]>[0]>[0];

async function assertBanks(tx: Tx, ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (wanted.length === 0) return;
  const found = await tx
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(
      and(inArray(bankAccounts.id, wanted), isNull(bankAccounts.deletedAt)),
    );
  if (found.length !== wanted.length)
    throw new BadRequestException("validation_failed:bank_account_not_found");
}

/**
 * Gün → kayıt anı: gün ortası (saat dilimi kaymasıyla önceki güne düşmesin),
 * ama bugünse en geç "şimdi". Bugünün öğleni gece yarısından sonra henüz
 * gelmemiş bir an; bakiye "şu ana kadar" hesaplandığı için kayıt görünmüyordu.
 */
function dayOf(day: string): Date {
  const start = istanbulStart(day).getTime();
  const now = Date.now();
  if (start > now)
    throw new BadRequestException("validation_failed:date_in_future");
  return new Date(Math.min(start + 12 * 3_600_000, now));
}

function toHandoverRow(r: typeof cashHandovers.$inferSelect): CashHandoverRow {
  return {
    id: r.id,
    date: r.handoverDate,
    fromName: r.fromName,
    toName: r.toName,
    note: r.note,
    snapshot: r.snapshot as HandoverSnapshot,
    createdAt: r.createdAt,
  };
}

/**
 * Harici tahsilat grupları — kullanıcı tanımlı gelir kalemleri. Hesap kodu
 * verilmezse sıradaki boş 602.1x atanır (602.01–602.09 sabit gruplarda).
 * Silme yok: kullanılmış grup fişlerde adıyla kalmalı; pasifleştirme.
 */
@Injectable()
export class IncomeGroupService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: IncomeGroupSave): Promise<{ id: string }> {
    const id = await this.db.tx(async (tx) => {
      const existing = await tx
        .select({ name: incomeGroups.name, code: incomeGroups.accountCode })
        .from(incomeGroups)
        .where(isNull(incomeGroups.deletedAt));
      if (existing.some((g) => g.name.toLocaleLowerCase("tr") === dto.name.toLocaleLowerCase("tr")))
        throw new ConflictException("conflict:income_group_name_taken");
      const taken = new Set(existing.map((g) => g.code));
      let code = dto.accountCode ?? null;
      if (code && taken.has(code)) throw new ConflictException("conflict:income_group_code_taken");
      for (let n = 10; !code && n < 1000; n++) if (!taken.has(`602.${n}`)) code = `602.${n}`;
      const [row] = await tx
        .insert(incomeGroups)
        .values({ tenantId: this.db.ctx().tenantId, name: dto.name, accountCode: code!, isActive: dto.isActive })
        .returning({ id: incomeGroups.id });
      return row!.id;
    });
    await this.audit.record({ action: "income_group_created", resource: "income_group", resourceId: id });
    return { id };
  }

  async update(id: string, dto: IncomeGroupSave): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [dup] = await tx
        .select({ id: incomeGroups.id })
        .from(incomeGroups)
        .where(and(isNull(incomeGroups.deletedAt), sql`lower(${incomeGroups.name}) = lower(${dto.name})`, sql`${incomeGroups.id} <> ${id}`))
        .limit(1);
      if (dup) throw new ConflictException("conflict:income_group_name_taken");
      // Hesap kodu değişmez: geçmiş fişler o koda yazıldı.
      const updated = await tx
        .update(incomeGroups)
        .set({ name: dto.name, isActive: dto.isActive, updatedAt: new Date() })
        .where(and(eq(incomeGroups.id, id), isNull(incomeGroups.deletedAt)))
        .returning({ id: incomeGroups.id });
      if (updated.length === 0) throw new NotFoundException("not_found");
    });
    await this.audit.record({ action: "income_group_updated", resource: "income_group", resourceId: id });
    return { id };
  }
}
