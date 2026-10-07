import { Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type {
  VendorDetail,
  VendorListResponse,
  VendorSave,
} from "@yonetim/contracts";
import { expenses, openingEntries, vendors } from "@yonetim/db";

import { AuditService, diffOf } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";

/** Cariye giren gider durumları: taslak/onay bekleyen/reddedilen borç doğurmaz. */
const LEDGER_STATUSES = ["approved", "paid"] as const;

/**
 * Tedarikçi kartı ve cari ekstresi.
 *
 * Bakiye giderlerden türetiliyor (bkz. `vendor.contract.ts`): tahakkuk
 * gider tarihinde, ödeme `paid_at` tarihinde. Ödenmiş ama tarihi aynı gün
 * olan giderde iki satır aynı güne düşer ve bakiye sıfırlanır.
 */
@Injectable()
export class VendorService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<VendorListResponse> {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(vendors)
        .where(isNull(vendors.deletedAt))
        .orderBy(asc(vendors.name));

      const sums = await tx
        .select({
          vendorId: expenses.vendorId,
          total: sql<number>`coalesce(sum(${expenses.amountKurus}), 0)::bigint`,
          paid: sql<number>`coalesce(sum(${expenses.amountKurus}) filter (where ${expenses.paidAt} is not null), 0)::bigint`,
          count: sql<number>`count(*)::int`,
          last: sql<Date | null>`max(${expenses.expenseDate})`,
        })
        .from(expenses)
        .where(
          and(
            isNull(expenses.deletedAt),
            inArray(expenses.status, [...LEDGER_STATUSES]),
            sql`${expenses.vendorId} is not null`,
          ),
        )
        .groupBy(expenses.vendorId);
      const byVendor = new Map(sums.map((s) => [s.vendorId!, s] as const));
      // Açılış fişindeki tedarikçi borçları bakiyeye ekleniyor.
      const openings = await tx
        .select({ vendorId: openingEntries.vendorId, amount: openingEntries.amountKurus })
        .from(openingEntries)
        .where(eq(openingEntries.account, "vendor"));
      const openingBy = new Map<string, number>();
      for (const o of openings) if (o.vendorId) openingBy.set(o.vendorId, (openingBy.get(o.vendorId) ?? 0) + o.amount);

      const [unlinked] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(expenses)
        .where(
          and(
            isNull(expenses.deletedAt),
            isNull(expenses.vendorId),
            sql`coalesce(trim(${expenses.vendorName}), '') <> ''`,
          ),
        );

      const mapped = rows.map((v) => {
        const s = byVendor.get(v.id);
        const total = Number(s?.total ?? 0) + (openingBy.get(v.id) ?? 0);
        const paid = Number(s?.paid ?? 0);
        return {
          ...card(v),
          totalMinor: total,
          paidMinor: paid,
          balanceMinor: total - paid,
          expenseCount: s?.count ?? 0,
          lastExpenseAt: s?.last ? new Date(s.last) : null,
        };
      });

      return {
        rows: mapped,
        totals: {
          vendors: mapped.length,
          balanceMinor: mapped.reduce((sum, v) => sum + v.balanceMinor, 0),
          unlinkedExpenses: unlinked?.count ?? 0,
        },
      };
    });
  }

  async detail(id: string): Promise<VendorDetail> {
    return this.db.tx(async (tx) => {
      const [vendor] = await tx
        .select()
        .from(vendors)
        .where(and(eq(vendors.id, id), isNull(vendors.deletedAt)))
        .limit(1);
      if (!vendor) throw new NotFoundException("not_found");

      const rows = await tx
        .select({
          id: expenses.id,
          description: expenses.description,
          invoiceNo: expenses.invoiceNo,
          amountKurus: expenses.amountKurus,
          expenseDate: expenses.expenseDate,
          paidAt: expenses.paidAt,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.vendorId, id),
            isNull(expenses.deletedAt),
            inArray(expenses.status, [...LEDGER_STATUSES]),
          ),
        )
        .orderBy(asc(expenses.expenseDate));

      type Line = VendorDetail["ledger"][number];
      const events: Omit<Line, "balanceMinor">[] = [];
      const openingRows = await tx
        .select({ amount: openingEntries.amountKurus, asOf: openingEntries.asOfDate })
        .from(openingEntries)
        .where(and(eq(openingEntries.account, "vendor"), eq(openingEntries.vendorId, id)));
      const openingTotal = openingRows.reduce((s, o) => s + o.amount, 0);
      if (openingTotal > 0)
        events.push({
          date: openingRows[0]!.asOf,
          expenseId: null,
          kind: "opening",
          description: "Açılış bakiyesi",
          invoiceNo: null,
          creditMinor: openingTotal,
          debitMinor: 0,
        });
      for (const e of rows) {
        events.push({
          date: e.expenseDate,
          expenseId: e.id,
          kind: "invoice",
          description: e.description,
          invoiceNo: e.invoiceNo,
          creditMinor: e.amountKurus,
          debitMinor: 0,
        });
        if (e.paidAt) {
          events.push({
            date: e.paidAt,
            expenseId: e.id,
            kind: "payment",
            description: e.description,
            invoiceNo: e.invoiceNo,
            creditMinor: 0,
            debitMinor: e.amountKurus,
          });
        }
      }
      // Aynı gün: açılış, tahakkuk, ödeme sırası (bakiye eksiye düşmesin).
      const rank = { opening: 0, invoice: 1, payment: 2 } as const;
      events.sort((a, b) => a.date.getTime() - b.date.getTime() || rank[a.kind] - rank[b.kind]);
      let balance = 0;
      const ledger = events.map((line) => {
        balance += line.creditMinor - line.debitMinor;
        return { ...line, balanceMinor: balance };
      });

      const total = rows.reduce((sum, e) => sum + e.amountKurus, 0) + openingTotal;
      const paid = rows.filter((e) => e.paidAt).reduce((sum, e) => sum + e.amountKurus, 0);
      return {
        vendor: {
          ...card(vendor),
          totalMinor: total,
          paidMinor: paid,
          balanceMinor: total - paid,
          expenseCount: rows.length,
          lastExpenseAt: rows.at(-1)?.expenseDate ?? null,
        },
        ledger,
      };
    });
  }

  async options() {
    return this.db.tx((tx) =>
      tx
        .select({ id: vendors.id, name: vendors.name })
        .from(vendors)
        .where(and(isNull(vendors.deletedAt), eq(vendors.isActive, true)))
        .orderBy(asc(vendors.name)),
    );
  }

  async save(dto: VendorSave, id?: string): Promise<{ id: string; name: string }> {
    const values = {
      name: dto.name,
      category: dto.category,
      contactName: dto.contactName ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      taxNumber: dto.taxNumber ?? null,
      taxOffice: dto.taxOffice ?? null,
      iban: dto.iban ?? null,
      address: dto.address ?? null,
      notes: dto.notes ?? null,
      isActive: dto.isActive,
    };
    const result = await this.db.tx(async (tx) => {
      if (!id) {
        const [created] = await tx
          .insert(vendors)
          .values({ ...values, tenantId: this.db.ctx().tenantId })
          .returning({ id: vendors.id });
        return { id: created!.id, diff: undefined };
      }
      const [before] = await tx
        .select()
        .from(vendors)
        .where(and(eq(vendors.id, id), isNull(vendors.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");
      await tx.update(vendors).set({ ...values, updatedAt: new Date() }).where(eq(vendors.id, id));
      // Kart adı değişince bağlı giderlerdeki ad da güncelleniyor: listeler
      // ve raporlar adı giderden okuyor.
      if (before.name !== dto.name) {
        await tx.update(expenses).set({ vendorName: dto.name }).where(eq(expenses.vendorId, id));
      }
      return {
        id,
        diff: diffOf(before as unknown as Record<string, unknown>, values as Record<string, unknown>),
      };
    });
    await this.audit.record({
      action: id ? "vendor_updated" : "vendor_created",
      resource: "vendor",
      resourceId: result.id,
      diff: result.diff,
    });
    return { id: result.id, name: dto.name };
  }

  /**
   * Kaldır — soft delete. Bağlı giderler silinmiyor, bağ da korunuyor:
   * geçmiş ekstre ve BA formu o giderlere dayanıyor.
   */
  async remove(id: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const rows = await tx
        .update(vendors)
        .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
        .where(and(eq(vendors.id, id), isNull(vendors.deletedAt)))
        .returning({ id: vendors.id });
      if (rows.length === 0) throw new NotFoundException("not_found");
    });
    await this.audit.record({ action: "vendor_deleted", resource: "vendor", resourceId: id });
    return { id };
  }

  /**
   * Adı yazılmış ama karta bağlanmamış giderleri bu karta bağla (ad eşleşmesi,
   * büyük/küçük harf ve boşluk duyarsız). Kart sonradan açıldığında geçmiş
   * giderlerin cariye girmesinin yolu.
   */
  async linkByName(id: string): Promise<{ linked: number }> {
    const linked = await this.db.tx(async (tx) => {
      const [vendor] = await tx
        .select({ name: vendors.name })
        .from(vendors)
        .where(and(eq(vendors.id, id), isNull(vendors.deletedAt)))
        .limit(1);
      if (!vendor) throw new NotFoundException("not_found");
      const rows = await tx
        .update(expenses)
        .set({ vendorId: id, vendorName: vendor.name })
        .where(
          and(
            isNull(expenses.vendorId),
            isNull(expenses.deletedAt),
            sql`lower(regexp_replace(trim(${expenses.vendorName}), '\\s+', ' ', 'g')) = lower(regexp_replace(trim(${vendor.name}), '\\s+', ' ', 'g'))`,
          ),
        )
        .returning({ id: expenses.id });
      return rows.length;
    });
    if (linked > 0) {
      await this.audit.record({
        action: "vendor_expenses_linked",
        resource: "vendor",
        resourceId: id,
        diff: { linked: { from: null, to: linked } },
      });
    }
    return { linked };
  }

  /** Gider kaydı için: verilen kart bu sitede mi ve adı ne. */
  async nameOf(id: string): Promise<string> {
    const [row] = await this.db.tx((tx) =>
      tx
        .select({ name: vendors.name })
        .from(vendors)
        .where(and(eq(vendors.id, id), isNull(vendors.deletedAt)))
        .limit(1),
    );
    if (!row) throw new NotFoundException("not_found:vendor");
    return row.name;
  }
}

function card(v: typeof vendors.$inferSelect) {
  return {
    id: v.id,
    name: v.name,
    category: v.category,
    contactName: v.contactName,
    phone: v.phone,
    email: v.email,
    taxNumber: v.taxNumber,
    taxOffice: v.taxOffice,
    iban: v.iban,
    address: v.address,
    notes: v.notes,
    isActive: v.isActive,
  };
}

