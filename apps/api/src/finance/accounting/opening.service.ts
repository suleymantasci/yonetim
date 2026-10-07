import { BadRequestException, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { OpeningResponse, OpeningSave } from "@yonetim/contracts";
import {
  bankAccounts,
  blocks,
  debts,
  openingEntries,
  staff,
  staffLedgerEntries,
  units,
  vendors,
} from "@yonetim/db";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";
import { istanbulDate, istanbulStart } from "./accounting.service";

const OPENING_DEBT_LABEL = "Açılış devri";

/**
 * Açılış fişi — sisteme geçiş tarihindeki bakiyeler.
 *
 * Üç ayrı yere yazılıyor, çünkü üçü farklı akışların parçası:
 *  - kasa / banka / tedarikçi → `opening_entries` (yalnız muhasebe)
 *  - personel maaş borcu / avans → personel defteri (`opening_*`), cari
 *    ekstrede ve avans mahsubunda kullanılsın
 *  - sakin devir borcu → gerçek borç (`metadata.opening`), tahsil edilsin.
 *    Tahsilat almış devir borcu kilitli: tutarı değişirse tahsilatın
 *    mahsubu anlamını yitirir.
 * Fişi kaydetmek **tümünü** verilen değerlere eşitliyor (idempotent): aynı
 * formu iki kez kaydetmek ikinci bir açılış yaratmıyor.
 */
@Injectable()
export class OpeningService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<OpeningResponse> {
    return this.db.tx(async (tx) => {
      const [entryRows, bankRows, vendorRows, staffRows, staffOpenings, unitRows, openingDebts] = await Promise.all([
        tx.select().from(openingEntries),
        tx.select().from(bankAccounts).orderBy(asc(bankAccounts.createdAt)),
        tx.select({ id: vendors.id, name: vendors.name }).from(vendors).where(isNull(vendors.deletedAt)).orderBy(asc(vendors.name)),
        tx.select({ id: staff.id, name: staff.fullName }).from(staff).where(isNull(staff.deletedAt)).orderBy(asc(staff.fullName)),
        tx
          .select({ staffId: staffLedgerEntries.staffId, kind: staffLedgerEntries.kind, amount: staffLedgerEntries.amountKurus })
          .from(staffLedgerEntries)
          .where(and(isNull(staffLedgerEntries.voidedAt), inArray(staffLedgerEntries.kind, ["opening_payable", "opening_advance"]))),
        tx
          .select({ id: units.id, number: units.number, blockName: blocks.name })
          .from(units)
          .leftJoin(blocks, eq(blocks.id, units.blockId))
          .where(isNull(units.deletedAt))
          .orderBy(asc(blocks.name), asc(units.number)),
        tx
          .select({ unitId: debts.unitId, amount: debts.amountKurus, paid: debts.paidKurus })
          .from(debts)
          .where(and(isNull(debts.deletedAt), sql`${debts.status} <> 'cancelled'`, sql`(${debts.metadata} ? 'opening' OR ${debts.metadata} ? 'migrated')`)),
      ]);

      const asOf = entryRows[0] ? istanbulDate(entryRows[0].asOfDate) : null;
      const amountOf = (pred: (r: (typeof entryRows)[number]) => boolean) =>
        entryRows.filter(pred).reduce((s, r) => s + r.amountKurus, 0);
      const unitOpen = new Map<string, { amount: number; paid: number }>();
      for (const d of openingDebts) {
        const cur = unitOpen.get(d.unitId) ?? { amount: 0, paid: 0 };
        cur.amount += d.amount;
        cur.paid += d.paid;
        unitOpen.set(d.unitId, cur);
      }
      const staffOpen = (id: string, kind: string) =>
        staffOpenings.filter((r) => r.staffId === id && r.kind === kind).reduce((s, r) => s + r.amount, 0);

      const cashMinor = amountOf((r) => r.account === "cash");
      const banks = bankRows
        .filter((b) => b.isActive || entryRows.some((r) => r.bankAccountId === b.id))
        .map((b) => ({
          bankAccountId: b.id,
          label: [b.bankName, b.ibanMasked].filter(Boolean).join(" · "),
          amountMinor: amountOf((r) => r.account === "bank" && r.bankAccountId === b.id),
        }));
      const vendorList = vendorRows.map((v) => ({
        vendorId: v.id,
        name: v.name,
        amountMinor: amountOf((r) => r.account === "vendor" && r.vendorId === v.id),
      }));
      const staffList = staffRows.map((s) => ({
        staffId: s.id,
        name: s.name,
        payableMinor: staffOpen(s.id, "opening_payable"),
        advanceMinor: staffOpen(s.id, "opening_advance"),
      }));
      const unitList = unitRows.map((u) => ({
        unitId: u.id,
        label: u.blockName ? `${u.blockName} / ${u.number}` : u.number,
        amountMinor: unitOpen.get(u.id)?.amount ?? 0,
        locked: (unitOpen.get(u.id)?.paid ?? 0) > 0,
      }));

      const assets =
        cashMinor +
        banks.reduce((s, b) => s + b.amountMinor, 0) +
        staffList.reduce((s, x) => s + x.advanceMinor, 0) +
        unitList.reduce((s, u) => s + u.amountMinor, 0);
      const liabilities =
        vendorList.reduce((s, v) => s + v.amountMinor, 0) + staffList.reduce((s, x) => s + x.payableMinor, 0);

      return {
        asOf,
        cashMinor,
        banks,
        vendors: vendorList,
        staff: staffList,
        units: unitList,
        equityMinor: assets - liabilities,
      };
    });
  }

  async save(dto: OpeningSave) {
    const asOf = istanbulStart(dto.asOf);
    if (asOf.getTime() > Date.now()) throw new BadRequestException("validation_failed:opening_in_future");
    const ctx = this.db.ctx();

    // Gerekçeli işlem: devir borçlarının tutarı değişebiliyor ve borç
    // değişiklik kütüğü (trigger) gerekçe istiyor.
    const result = await this.db.txWithReason("Açılış fişi kaydedildi", async (tx) => {
      // 1) Kasa / banka / tedarikçi: tümüyle yeniden yaz.
      await tx.delete(openingEntries).where(eq(openingEntries.tenantId, ctx.tenantId));
      const rows: (typeof openingEntries.$inferInsert)[] = [
        { tenantId: ctx.tenantId, asOfDate: asOf, account: "cash", amountKurus: dto.cashMinor, createdBy: ctx.userId ?? null },
        ...dto.banks
          .filter((b) => b.amountMinor > 0)
          .map((b) => ({ tenantId: ctx.tenantId, asOfDate: asOf, account: "bank", bankAccountId: b.bankAccountId, amountKurus: b.amountMinor, createdBy: ctx.userId ?? null })),
        ...dto.vendors
          .filter((v) => v.amountMinor > 0)
          .map((v) => ({ tenantId: ctx.tenantId, asOfDate: asOf, account: "vendor", vendorId: v.vendorId, amountKurus: v.amountMinor, createdBy: ctx.userId ?? null })),
      ];
      await tx.insert(openingEntries).values(rows);

      // 2) Personel açılışı: iptal edilmemiş açılış satırlarını değiştir.
      if (dto.staff.length > 0) {
        await tx
          .delete(staffLedgerEntries)
          .where(
            and(
              inArray(staffLedgerEntries.staffId, dto.staff.map((s) => s.staffId)),
              inArray(staffLedgerEntries.kind, ["opening_payable", "opening_advance"]),
              isNull(staffLedgerEntries.voidedAt),
            ),
          );
        const staffRows = dto.staff.flatMap((s) => [
          ...(s.payableMinor > 0
            ? [{ kind: "opening_payable", amountKurus: s.payableMinor, staffId: s.staffId, description: "Açılış: maaş borcu" }]
            : []),
          ...(s.advanceMinor > 0
            ? [{ kind: "opening_advance", amountKurus: s.advanceMinor, staffId: s.staffId, description: "Açılış: avans bakiyesi" }]
            : []),
        ]);
        if (staffRows.length > 0)
          await tx.insert(staffLedgerEntries).values(
            staffRows.map((r) => ({ ...r, tenantId: ctx.tenantId, entryDate: asOf, createdBy: ctx.userId ?? null })),
          );
      }

      // 3) Sakin devir borçları: daire başına tek açılış borcu.
      let created = 0;
      let updated = 0;
      let locked = 0;
      for (const u of dto.units) {
        const existing = await tx
          .select({ id: debts.id, amount: debts.amountKurus, paid: debts.paidKurus })
          .from(debts)
          .where(
            and(
              eq(debts.unitId, u.unitId),
              isNull(debts.deletedAt),
              sql`${debts.status} <> 'cancelled'`,
              sql`(${debts.metadata} ? 'opening' OR ${debts.metadata} ? 'migrated')`,
            ),
          );
        const total = existing.reduce((s, d) => s + d.amount, 0);
        if (total === u.amountMinor) continue;
        if (existing.some((d) => d.paid > 0)) {
          locked += 1;
          continue;
        }
        if (existing.length > 0) {
          // Tahsilatsız devir borçları: tutarı güncelle ya da sıfırsa iptal et.
          const [first, ...rest] = existing;
          if (rest.length > 0)
            await tx.update(debts).set({ status: "cancelled", updatedAt: new Date() }).where(inArray(debts.id, rest.map((d) => d.id)));
          if (u.amountMinor === 0)
            await tx.update(debts).set({ status: "cancelled", updatedAt: new Date() }).where(eq(debts.id, first!.id));
          else
            await tx.update(debts).set({ amountKurus: u.amountMinor, dueDate: asOf, updatedAt: new Date() }).where(eq(debts.id, first!.id));
          updated += 1;
          continue;
        }
        if (u.amountMinor === 0) continue;
        const [owner] = (await tx.execute(sql`
          SELECT user_id FROM unit_occupancies
          WHERE unit_id = ${u.unitId} AND end_date IS NULL
          ORDER BY (relation = 'owner') DESC, start_date LIMIT 1
        `)) as unknown as Array<{ user_id: string }>;
        await tx.insert(debts).values({
          tenantId: ctx.tenantId,
          unitId: u.unitId,
          debtorUserId: owner?.user_id ?? null,
          kind: "extra",
          description: OPENING_DEBT_LABEL,
          amountKurus: u.amountMinor,
          dueDate: asOf,
          metadata: { opening: true },
        });
        created += 1;
      }
      return { unitsCreated: created, unitsUpdated: updated, unitsLocked: locked };
    });

    await this.audit.record({
      action: "opening_balances_saved",
      resource: "opening_entries",
      diff: { asOf: { from: null, to: dto.asOf }, ...Object.fromEntries(Object.entries(result).map(([k, v]) => [k, { from: null, to: v }])) },
    });
    return { asOf: dto.asOf, ...result };
  }
}
