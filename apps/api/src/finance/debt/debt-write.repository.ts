import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type {
  DebtAdjust,
  DebtBulkCreate,
  DebtCreate,
  PaymentCollect,
  ShareTargetValue,
} from "./types";
import { dueDateFor, parsePeriodKey } from "@yonetim/core";
import {
  blocks,
  debtorRuleFor,
  debts,
  debtTypes,
  ensureDefaultDebtTypes,
  paymentAllocations,
  payments,
  unitOccupancies,
  unitOrder,
  units,
  type DebtTypeRow,
} from "@yonetim/db";
import {
  allocatePayment,
  distributeDues,
  splitAmount,
  type DuesFormula,
} from "@yonetim/dues";

import { DbService } from "../../infra/db/db.service";
import type { Database } from "../../property/unit/types";

/**
 * Borç yazma repository'si — SQL ve transaction sınırı burada.
 *
 * `apps/app/src/app/panel/borclar/actions.ts`'ten taşındı. Mantık birebir;
 * değişen: RLS bağlamı `DbService`'ten geliyor, kullanıcıya gösterilecek
 * metinler yerine **hata kodları** fırlatılıyor (çeviri panelde kalır — API
 * dile bağımsız, SPEC 4.2).
 */
@Injectable()
export class DebtWriteRepository {
  constructor(private readonly db: DbService) {}

  /* ---------------------------------------------------------------- *
   * 1) Tek borç (taksitli olabilir)
   * ---------------------------------------------------------------- */

  async create(
    dto: DebtCreate,
  ): Promise<{ ids: string[]; unitNumber: string }> {
    return this.db.tx(async (tx) => {
      const ctx = this.db.ctx();

      const [unit] = await tx
        .select({
          id: units.id,
          number: units.number,
          lateFeeExempt: units.lateFeeExempt,
          ownerPaysDues: units.ownerPaysDues,
        })
        .from(units)
        .where(and(eq(units.id, dto.unitId), isNull(units.deletedAt)))
        .limit(1);
      if (!unit) throw new NotFoundException("not_found:unit");

      const { kind, type } = await resolveDebtType(tx, ctx.tenantId, dto);
      const debtors = await resolveDebtors(
        tx,
        dto.unitId,
        targetFor(dto.shareTarget, type, unit),
      );
      const perDebtor = splitAmount(
        dto.amountMinor,
        debtors.map((entry) => entry.weight),
      );

      const rows: (typeof debts.$inferInsert)[] = [];

      for (const [debtorIndex, debtor] of debtors.entries()) {
        const debtorTotal = perDebtor[debtorIndex] ?? 0;
        if (debtorTotal <= 0) continue;

        // Taksit: tutar eşit bölünür, vadeler ay ay ileri kayar.
        const installments = splitAmount(
          debtorTotal,
          Array.from({ length: dto.installmentCount }, () => 1),
        );

        for (const [index, amount] of installments.entries()) {
          const dueDate = new Date(dto.dueDate);
          dueDate.setMonth(dueDate.getMonth() + index);
          rows.push({
            tenantId: ctx.tenantId,
            unitId: dto.unitId,
            debtorUserId: debtor.userId,
            kind,
            debtTypeId: type?.id ?? null,
            period: dto.period ?? null,
            description:
              dto.installmentCount > 1
                ? `${dto.description} (${index + 1}/${dto.installmentCount})`
                : dto.description,
            amountKurus: amount,
            dueDate,
            // Taksitlendirilen borçta gecikme faizi işlemez: taksit anlaşması
            // zaten gecikmenin çözümüdür (GAP 3.1 şikâyeti).
            lateFeeExempt:
              dto.lateFeeExempt ||
              unit.lateFeeExempt ||
              dto.installmentCount > 1,
            installmentNo: dto.installmentCount > 1 ? index + 1 : null,
            installmentCount:
              dto.installmentCount > 1 ? dto.installmentCount : null,
            metadata: dto.notes ? { notes: dto.notes } : {},
          });
        }
      }

      if (rows.length === 0)
        throw new BadRequestException("validation_failed:nothing_to_create");
      const inserted = await tx
        .insert(debts)
        .values(rows)
        .returning({ id: debts.id });
      return { ids: inserted.map((row) => row.id), unitNumber: unit.number };
    });
  }

  /* ---------------------------------------------------------------- *
   * 2) Toplu borçlandırma — önizleme ve yazma aynı dağıtımı kullanır
   * ---------------------------------------------------------------- */

  async preview(dto: DebtBulkCreate) {
    return this.db.tx(async (tx) => {
      await resolveDebtType(tx, this.db.ctx().tenantId, dto);
      const targets = await selectTargetUnits(tx, dto);
      if (targets.length === 0)
        throw new BadRequestException("validation_failed:no_target_units");

      const distribution = distributeShares(dto, targets);
      const existing = await existingUnitIds(tx, dto);

      const rows = targets.map((row) => {
        const share = distribution.shares.find(
          (entry) => entry.unitId === row.id,
        );
        return {
          unitId: row.id,
          unitNumber: row.number,
          blockName: row.blockName,
          amountMinor: share?.amountKurus ?? 0,
          exempt: row.duesExempt,
          alreadyExists: existing.has(row.id),
        };
      });

      return {
        rows,
        totalMinor: rows
          .filter((row) => !(dto.skipExisting && row.alreadyExists))
          .reduce((sum, row) => sum + row.amountMinor, 0),
      };
    });
  }

  async bulkCreate(dto: DebtBulkCreate) {
    const period = parsePeriodKey(dto.period);
    if (!period) throw new BadRequestException("validation_failed:period");

    return this.db.tx(async (tx) => {
      const ctx = this.db.ctx();
      const { kind, type } = await resolveDebtType(tx, ctx.tenantId, dto);
      const targets = await selectTargetUnits(tx, dto);
      if (targets.length === 0)
        throw new BadRequestException("validation_failed:no_target_units");

      const distribution = distributeShares(dto, targets);
      const existing = await existingUnitIds(tx, dto);
      const dueDate = dueDateFor(period, dto.dueDay);

      const rows: (typeof debts.$inferInsert)[] = [];
      let skipped = 0;

      for (const unit of targets) {
        const share = distribution.shares.find(
          (entry) => entry.unitId === unit.id,
        );
        if (!share || share.amountKurus <= 0) {
          skipped += 1;
          continue;
        }
        if (dto.skipExisting && existing.has(unit.id)) {
          skipped += 1;
          continue;
        }

        const debtors = await resolveDebtors(
          tx,
          unit.id,
          targetFor(dto.shareTarget, type, unit),
        );
        const amounts = splitAmount(
          share.amountKurus,
          debtors.map((entry) => entry.weight),
        );

        for (const [index, debtor] of debtors.entries()) {
          const amount = amounts[index] ?? 0;
          if (amount <= 0) continue;
          rows.push({
            tenantId: ctx.tenantId,
            unitId: unit.id,
            debtorUserId: debtor.userId,
            kind,
            debtTypeId: type?.id ?? null,
            period: dto.period,
            description: dto.description,
            amountKurus: amount,
            dueDate,
            lateFeeExempt: dto.lateFeeExempt || unit.lateFeeExempt,
          });
        }
      }

      if (rows.length === 0)
        throw new BadRequestException("validation_failed:nothing_to_create");

      // Tek INSERT, tek transaction: kısmen oluşmuş borçlandırma olmaz.
      await tx.insert(debts).values(rows);
      return {
        createdCount: rows.length,
        skippedCount: skipped,
        totalMinor: rows.reduce((sum, row) => sum + (row.amountKurus ?? 0), 0),
      };
    });
  }

  /* ---------------------------------------------------------------- *
   * 3) Düzeltme — gerekçe zorunlu
   * ---------------------------------------------------------------- */

  async adjust(id: string, dto: DebtAdjust): Promise<void> {
    // `txWithReason` gerekçeyi `app.change_reason`'a yazar; DB trigger'ı
    // (`trg_debts_change_log`) onu sakine gösterilebilen timeline'a taşır.
    await this.db.txWithReason(dto.reason, async (tx) => {
      const [before] = await tx
        .select({
          id: debts.id,
          amountKurus: debts.amountKurus,
          paidKurus: debts.paidKurus,
        })
        .from(debts)
        .where(and(eq(debts.id, id), isNull(debts.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      if (dto.amountMinor < before.paidKurus) {
        // Ödenmiş tutarın altına indirmek iade akışı gerektirir; sessizce
        // negatif bakiye üretmek yerine reddediliyor.
        throw new ConflictException("conflict:below_paid");
      }

      await tx
        .update(debts)
        .set({
          amountKurus: dto.amountMinor,
          dueDate: dto.dueDate,
          lateFeeExempt: dto.lateFeeExempt,
          status: resolveStatus(dto.amountMinor, before.paidKurus, dto.dueDate),
        })
        .where(eq(debts.id, id));
    });
  }

  /* ---------------------------------------------------------------- *
   * 4) Tahsilat + mahsup
   * ---------------------------------------------------------------- */

  async collect(dto: PaymentCollect) {
    return this.db.tx(async (tx) => {
      const ctx = this.db.ctx();

      const openDebts = await tx
        .select({
          id: debts.id,
          dueDate: debts.dueDate,
          amountKurus: debts.amountKurus,
          paidKurus: debts.paidKurus,
          lateFeeKurus: debts.lateFeeKurus,
          debtorUserId: debts.debtorUserId,
          kind: debts.kind,
        })
        .from(debts)
        .where(
          and(
            eq(debts.unitId, dto.unitId),
            isNull(debts.deletedAt),
            sql`${debts.status} NOT IN ('paid','written_off')`,
          ),
        );

      if (openDebts.length === 0)
        throw new BadRequestException("validation_failed:no_open_debts");

      // Mahsup sırası `packages/dues/allocation` tarafından belirlenir (en eski
      // vade, her borçta önce gecikme tazminatı). Aynı kural ödeme webhook'unda
      // da işlediği için paket içinde duruyor — iki kopya olamaz.
      const allocation = allocatePayment(dto.amountMinor, openDebts, {
        preferDebtIds: dto.debtIds,
      });

      const firstDebt = openDebts.find(
        (debt) => debt.id === allocation.allocations[0]?.debtId,
      );

      const [payment] = await tx
        .insert(payments)
        .values({
          tenantId: ctx.tenantId,
          unitId: dto.unitId,
          payerUserId: dto.payerUserId ?? null,
          debtorUserId: firstDebt?.debtorUserId ?? null,
          amountKurus: dto.amountMinor,
          method: dto.method,
          /*
           * Nakit tahsilatın banka hesabı yok: hesap seçilmiş olsa bile
           * `cash` yönteminde **yok sayılıyor**. Aksi hâlde kasaya giren
           * para bir hesabın ekstresinde aranır ve mutabakat o hesapta
           * kalıcı bir fark gösterirdi.
           */
          bankAccountId:
            dto.method === "cash" ? null : (dto.bankAccountId ?? null),
          processor: "manual",
          status: "completed",
          paidAt: dto.paidAt,
          receiptNo: dto.receiptNo ?? null,
          metadata: dto.note ? { note: dto.note } : {},
        })
        .returning({ id: payments.id });

      if (!payment) throw new BadRequestException("internal");

      let closed = 0;
      for (const entry of allocation.allocations) {
        await tx.insert(paymentAllocations).values({
          tenantId: ctx.tenantId,
          paymentId: payment.id,
          debtId: entry.debtId,
          amountKurus: entry.amountKurus,
        });

        const debt = openDebts.find((row) => row.id === entry.debtId)!;
        const newPaid = debt.paidKurus + entry.amountKurus;
        const status = resolveStatus(
          debt.amountKurus + debt.lateFeeKurus,
          newPaid,
          debt.dueDate,
        );
        if (status === "paid") closed += 1;

        // Tahsilat tutarı değiştirmediği için timeline trigger'ı tetiklenmez;
        // ödeme izi `payment_allocations` üzerinden zaten kalıcı.
        await tx
          .update(debts)
          .set({ paidKurus: newPaid, status })
          .where(eq(debts.id, debt.id));
      }

      return {
        paymentId: payment.id,
        allocatedMinor: allocation.allocatedKurus,
        creditBalanceMinor: allocation.creditBalanceKurus,
        closedDebtCount: closed,
      };
    });
  }

  /**
   * Tahsilat iptali — elle girilmiş, tamamlanmış ödeme.
   *
   * SİLMİYOR, TERSİNE ÇEVİRİYOR: ödeme satırı `cancelled` olarak kalıyor
   * (makbuz numarası, tutar, tarih denetimde görünür); mahsup satırları
   * siliniyor ve her borcun `paid_kurus`'u geri düşülüp durumu yeniden
   * hesaplanıyor. Mahsupların anlık görüntüsü `metadata.voided`'a yazılıyor —
   * "iptalden önce hangi borçlara dağılmıştı" sorusunun cevabı kaybolmuyor.
   *
   * NEDEN MAHSUPLAR SİLİNİYOR: dökümler ve aylık tahsilat trendi doğrudan
   * `payment_allocations`'ı topluyor. İptal edilmiş ödemenin mahsubunu
   * yerinde bırakmak, her okuma yoluna ayrıca durum filtresi eklemeyi
   * gerektirirdi; biri unutulursa iptal edilen para tahsil edilmiş görünürdü.
   *
   * KART ÖDEMESİ BU YOLLA İPTAL EDİLMEZ: para sağlayıcıda; orada iade
   * yapılmadan kayıt iptali kasa ile banka arasında kalıcı fark bırakırdı.
   */
  async voidPayment(paymentId: string, reason: string) {
    return this.db.txWithReason(reason, async (tx) => {
      const ctx = this.db.ctx();
      // FOR UPDATE: aynı tahsilatın iki sekmeden iki kez iptali yarışmasın.
      const [payment] = await tx
        .select({
          id: payments.id,
          status: payments.status,
          processor: payments.processor,
          amountKurus: payments.amountKurus,
          metadata: payments.metadata,
        })
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for("update");

      if (!payment) throw new NotFoundException("not_found");
      if (payment.status === "cancelled")
        throw new ConflictException("conflict:payment_already_cancelled");
      if (payment.processor !== "manual")
        throw new BadRequestException("validation_failed:card_payment_requires_refund");
      if (payment.status !== "completed")
        throw new ConflictException(`conflict:payment_not_completed:${payment.status}`);

      const allocations = await tx
        .select({
          debtId: paymentAllocations.debtId,
          amountKurus: paymentAllocations.amountKurus,
        })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, paymentId));

      let reopened = 0;
      for (const allocation of allocations) {
        const [debt] = await tx
          .select({
            id: debts.id,
            amountKurus: debts.amountKurus,
            lateFeeKurus: debts.lateFeeKurus,
            paidKurus: debts.paidKurus,
            dueDate: debts.dueDate,
            status: debts.status,
          })
          .from(debts)
          .where(eq(debts.id, allocation.debtId))
          .for("update");
        if (!debt) continue;

        const newPaid = Math.max(0, debt.paidKurus - allocation.amountKurus);
        const status = resolveStatus(debt.amountKurus + debt.lateFeeKurus, newPaid, debt.dueDate);
        if (debt.status === "paid" && status !== "paid") reopened += 1;
        await tx.update(debts).set({ paidKurus: newPaid, status }).where(eq(debts.id, debt.id));
      }

      await tx.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));

      await tx
        .update(payments)
        .set({
          status: "cancelled",
          metadata: {
            ...((payment.metadata as Record<string, unknown>) ?? {}),
            voided: {
              at: new Date().toISOString(),
              by: ctx.userId ?? null,
              reason,
              allocations,
            },
          },
        })
        .where(eq(payments.id, paymentId));

      return {
        paymentId,
        reopenedDebtCount: reopened,
        reversedMinor: allocations.reduce((sum, a) => sum + a.amountKurus, 0),
      };
    });
  }

  /* ---------------------------------------------------------------- *
   * 5) Toplu işlemler
   * ---------------------------------------------------------------- */

  /** Borç iptali (soft-delete). Kısmen bile ödenmiş borç iptal edilemez. */
  async cancel(ids: string[], reason: string): Promise<number> {
    return this.db.txWithReason(reason, async (tx) => {
      // Kim, ne zaman, neden — silinen hareket raporu bunu okur.
      const stamp = {
        at: new Date().toISOString(),
        by: this.db.ctx().userId ?? null,
        reason,
      };
      const rows = await tx
        .update(debts)
        .set({
          status: "cancelled",
          deletedAt: new Date(),
          metadata: sql`${debts.metadata} || jsonb_build_object('cancelled', ${JSON.stringify(stamp)}::jsonb)`,
        })
        .where(
          and(
            inArray(debts.id, ids),
            isNull(debts.deletedAt),
            // Ödeme yapılmışsa iptal, para iade akışı gerektirir.
            eq(debts.paidKurus, 0),
          ),
        )
        .returning({ id: debts.id });
      return rows.length;
    });
  }

  /**
   * Borç silme/affetme: kalan tutar `written_off` olur, kayıt **silinmez**.
   *
   * Kısmen ödenmiş borç da silinebilir (affedilen kalan kısım); ödenen kısım
   * olduğu gibi kalıyor. İcradaki (`in_legal`), ödenmiş, iptal edilmiş veya
   * zaten silinmiş borç etkilenmez — icradaki borç önce dosya kapatılarak
   * çözülmeli. Affedilen tutar, karar referansı ve zaman `metadata.forgiven`'a
   * yazılıyor; gecikme tazminatı da durduruluyor.
   */
  async forgive(ids: string[], reason: string, decisionRef: string): Promise<number> {
    return this.db.txWithReason(reason, async (tx) => {
      const rows = await tx
        .update(debts)
        .set({
          status: "written_off",
          lateFeeExempt: true,
          metadata: sql`${debts.metadata} || jsonb_build_object('forgiven', jsonb_build_object(
            'amountKurus', ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus},
            'decisionRef', ${decisionRef}::text,
            'reason', ${reason}::text,
            'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          ))`,
        })
        .where(
          and(
            inArray(debts.id, ids),
            isNull(debts.deletedAt),
            inArray(debts.status, ["pending", "partial", "overdue"]),
            sql`${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} > 0`,
          ),
        )
        .returning({ id: debts.id });
      return rows.length;
    });
  }

  async setLateFeeExempt(ids: string[], exempt: boolean): Promise<number> {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .update(debts)
        .set({ lateFeeExempt: exempt })
        .where(and(inArray(debts.id, ids), isNull(debts.deletedAt)))
        .returning({ id: debts.id });
      return rows.length;
    });
  }
}

/* ------------------------------------------------------------------ *
 * Yardımcılar
 * ------------------------------------------------------------------ */

/** Ödenen tutar ve vadeye göre durum. Tek yerde tutulur ki tutarsızlık olmasın. */
export function resolveStatus(
  amountKurus: number,
  paidKurus: number,
  dueDate: Date,
): "pending" | "partial" | "paid" | "overdue" {
  if (paidKurus >= amountKurus) return "paid";
  if (paidKurus > 0) return "partial";
  return dueDate.getTime() < Date.now() ? "overdue" : "pending";
}

/**
 * Borcun kime yazılacağını belirler — GAP 4.1.3.
 * `split` ve `share` birden fazla borç kaydı üretir (bkz. sözleşme notu).
 */
async function resolveDebtors(
  tx: Database,
  unitId: string,
  target: ShareTargetValue,
): Promise<{ userId: string | null; weight: number }[]> {
  const active = await tx
    .select({
      userId: unitOccupancies.userId,
      relation: unitOccupancies.relation,
      ownershipPct: unitOccupancies.ownershipPct,
    })
    .from(unitOccupancies)
    .where(
      and(eq(unitOccupancies.unitId, unitId), isNull(unitOccupancies.endDate)),
    );

  const owners = active.filter((row) => row.relation === "owner");
  const tenants = active.filter((row) => row.relation === "tenant");

  switch (target) {
    case "owner": {
      if (owners.length === 0) return [{ userId: null, weight: 1 }];
      // Tek malik → tek borç. Hisseli mülkiyette 'share' seçilmelidir.
      return owners.length === 1
        ? [{ userId: owners[0]!.userId, weight: 1 }]
        : owners.map((row) => ({
            userId: row.userId,
            weight: Number(row.ownershipPct),
          }));
    }
    case "tenant": {
      if (tenants.length === 0)
        throw new BadRequestException("validation_failed:no_tenant");
      return [{ userId: tenants[0]!.userId, weight: 1 }];
    }
    case "split": {
      const owner = owners[0];
      const tenant = tenants[0];
      if (!owner || !tenant) {
        throw new BadRequestException("validation_failed:split_needs_both");
      }
      return [
        { userId: owner.userId, weight: 50 },
        { userId: tenant.userId, weight: 50 },
      ];
    }
    case "occupant": {
      // Oturan: kiracı varsa kiracı; yoksa malik(ler) hisseye göre.
      const tenant = tenants[0];
      if (tenant) return [{ userId: tenant.userId, weight: 1 }];
      if (owners.length === 0) return [{ userId: null, weight: 1 }];
      return owners.map((row) => ({
        userId: row.userId,
        weight: owners.length === 1 ? 1 : Number(row.ownershipPct),
      }));
    }
    case "share": {
      if (owners.length === 0) return [{ userId: null, weight: 1 }];
      return owners.map((row) => ({
        userId: row.userId,
        weight: Number(row.ownershipPct),
      }));
    }
    default:
      return [{ userId: null, weight: 1 }];
  }
}

type DebtTypeRef = Pick<DebtTypeRow, "id" | "baseKind" | "debtor"> | null;

/**
 * Borç türü → davranış sınıfı (`kind`) ve kural.
 *
 * Tür verilirse sınıf **türden** gelir (istemcinin yolladığı `kind` yok
 * sayılır — ikisi çelişemez). Tür yoksa eski sözleşme: `kind` zorunlu, tür
 * bağlanmaz.
 */
async function resolveDebtType(
  tx: Database,
  tenantId: string,
  dto: { debtTypeId?: string; kind?: DebtCreate["kind"] },
): Promise<{ kind: NonNullable<DebtCreate["kind"]>; type: DebtTypeRef }> {
  if (dto.debtTypeId) {
    await ensureDefaultDebtTypes(tx, tenantId);
    const [type] = await tx
      .select({
        id: debtTypes.id,
        baseKind: debtTypes.baseKind,
        debtor: debtTypes.debtor,
        isActive: debtTypes.isActive,
      })
      .from(debtTypes)
      .where(and(eq(debtTypes.id, dto.debtTypeId), isNull(debtTypes.deletedAt)))
      .limit(1);
    if (!type) throw new NotFoundException("not_found:debt_type");
    if (!type.isActive)
      throw new BadRequestException("validation_failed:debt_type_inactive");
    return { kind: type.baseKind, type };
  }
  if (!dto.kind) throw new BadRequestException("validation_failed:kind");
  return { kind: dto.kind, type: null };
}

/** `rule` hedefini türün kuralına (ve daire istisnasına) çevirir. */
function targetFor(
  target: ShareTargetValue,
  type: DebtTypeRef,
  unit: { ownerPaysDues: boolean },
): ShareTargetValue {
  if (target !== "rule") return target;
  if (!type) return "occupant";
  return debtorRuleFor(type, unit);
}

/** Filtreye uyan birimler (toplu borçlandırma hedefi). */
async function selectTargetUnits(
  tx: Database,
  filter: { blockIds: string[]; unitTypes: string[] },
) {
  const conditions = [isNull(units.deletedAt)];
  if (filter.blockIds.length > 0)
    conditions.push(inArray(units.blockId, filter.blockIds));
  if (filter.unitTypes.length > 0) {
    conditions.push(sql`${units.type}::text = ANY(${filter.unitTypes})`);
  }

  return tx
    .select({
      id: units.id,
      number: units.number,
      blockName: blocks.name,
      landShare: units.landShare,
      areaM2: units.areaM2,
      residentCount: units.residentCount,
      duesMultiplier: units.duesMultiplier,
      duesExempt: units.duesExempt,
      lateFeeExempt: units.lateFeeExempt,
      ownerPaysDues: units.ownerPaysDues,
    })
    .from(units)
    .leftJoin(blocks, eq(blocks.id, units.blockId))
    .where(and(...conditions))
    // Kalan kuruş son birime yazıldığı için sıra sonucu etkiliyor; önizleme
    // ve yazma aynı fonksiyonu çağırdığından ikisi birlikte değişiyor.
    .orderBy(...unitOrder());
}

type TargetUnit = Awaited<ReturnType<typeof selectTargetUnits>>[number];

/** Önizleme ve yazma **aynı** dağıtımı kullanır — karar 8'in anlamı bu. */
function distributeShares(dto: DebtBulkCreate, targets: TargetUnit[]) {
  return distributeDues({
    formula: dto.formula as DuesFormula,
    baseAmountKurus: dto.formula === "equal" ? dto.amountMinor : undefined,
    totalAmountKurus: dto.formula === "equal" ? undefined : dto.amountMinor,
    units: targets.map((row) => ({
      id: row.id,
      landShare: row.landShare === null ? null : Number(row.landShare),
      areaM2: row.areaM2 === null ? null : Number(row.areaM2),
      residentCount: row.residentCount,
      multiplier: Number(row.duesMultiplier),
      exempt: row.duesExempt,
      customAmountKurus: dto.formula === "custom" ? dto.amountMinor : undefined,
    })),
  });
}

/** Bu dönem+tür ile zaten borcu olan birimler. */
async function existingUnitIds(
  tx: Database,
  dto: DebtBulkCreate,
): Promise<Set<string>> {
  const rows = await tx
    .select({ unitId: debts.unitId })
    .from(debts)
    .where(
      and(
        eq(debts.period, dto.period),
        // Aynı sınıfta iki tür olabilir (Demirbaş ve Ek gider ikisi de
        // `extra`): tür verildiyse "zaten var" türe göre bakılır.
        dto.debtTypeId
          ? eq(debts.debtTypeId, dto.debtTypeId)
          : eq(debts.kind, dto.kind ?? "extra"),
        isNull(debts.deletedAt),
      ),
    );
  return new Set(rows.map((row) => row.unitId));
}
