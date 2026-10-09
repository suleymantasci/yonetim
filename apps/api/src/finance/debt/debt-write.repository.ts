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
import { addMonths, dueDateFor, parsePeriodKey } from "@yonetim/core";
import {
  blocks,
  memberships,
  debtorRuleFor,
  debts,
  debtTypes,
  ensureDefaultDebtTypes,
  paymentAllocations,
  payments,
  unitOccupancies,
  unitOrder,
  units,
  users,
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
    const periods = periodRange(dto);
    return this.db.tx(async (tx) => {
      const { type } = await resolveDebtType(tx, this.db.ctx().tenantId, dto);
      const targets = await selectTargetUnits(tx, dto);
      if (targets.length === 0)
        throw new BadRequestException("validation_failed:no_target_units");

      const distribution = distributeShares(dto, targets);
      const overrides = new Map(dto.overrides.map((o) => [o.unitId, o]));
      const existingByPeriod = await Promise.all(
        periods.map((p) => existingUnitIds(tx, { ...dto, period: p })),
      );
      const people = await occupantsOf(
        tx,
        targets.map((t) => t.id),
      );

      let totalMinor = 0;
      const rows = [];
      for (const unit of targets) {
        const formulaMinor =
          distribution.shares.find((entry) => entry.unitId === unit.id)
            ?.amountKurus ?? 0;
        const o = overrides.get(unit.id);
        const amountMinor = o?.amountMinor ?? formulaMinor;
        const excluded = o?.excluded === true;
        const target = targetFor(o?.target ?? dto.shareTarget, type, unit);
        let debtorNames: string[] = [];
        let debtorError: string | null = null;
        try {
          const debtors = await resolveDebtors(tx, unit.id, target);
          debtorNames = debtors.map((d) =>
            d.userId
              ? (people.get(`${unit.id}:${d.userId}`)?.name ?? "—")
              : "—",
          );
        } catch (error) {
          debtorError =
            error instanceof BadRequestException
              ? String(error.message)
              : "validation_failed";
        }
        const unitPeople = [...people.values()].filter(
          (p) => p.unitId === unit.id,
        );
        if (!excluded && !debtorError) {
          for (const existing of existingByPeriod) {
            if (!(dto.skipExisting && existing.has(unit.id)))
              totalMinor += amountMinor;
          }
        }
        rows.push({
          unitId: unit.id,
          unitNumber: unit.number,
          blockName: unit.blockName,
          amountMinor,
          formulaMinor,
          excluded,
          exempt: unit.duesExempt,
          alreadyExists: existingByPeriod[0]!.has(unit.id),
          target,
          debtorNames,
          hasOwner: unitPeople.some((p) => p.relation === "owner"),
          hasTenant: unitPeople.some((p) => p.relation === "tenant"),
          debtorError,
        });
      }

      return { rows, totalMinor, periods };
    });
  }

  async bulkCreate(dto: DebtBulkCreate) {
    const periods = periodRange(dto);

    return this.db.tx(async (tx) => {
      const ctx = this.db.ctx();
      const { kind, type } = await resolveDebtType(tx, ctx.tenantId, dto);
      const targets = await selectTargetUnits(tx, dto);
      if (targets.length === 0)
        throw new BadRequestException("validation_failed:no_target_units");

      const distribution = distributeShares(dto, targets);
      const overrides = new Map(dto.overrides.map((o) => [o.unitId, o]));
      const rows: (typeof debts.$inferInsert)[] = [];
      let skipped = 0;

      for (const periodKey of periods) {
        const period = parsePeriodKey(periodKey)!;
        const existing = await existingUnitIds(tx, {
          ...dto,
          period: periodKey,
        });
        const dueDate = dueDateFor(period, dto.dueDay);

        for (const unit of targets) {
          const o = overrides.get(unit.id);
          const share = distribution.shares.find(
            (entry) => entry.unitId === unit.id,
          );
          const amountKurus = o?.amountMinor ?? share?.amountKurus ?? 0;
          if (o?.excluded || amountKurus <= 0) {
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
            targetFor(o?.target ?? dto.shareTarget, type, unit),
          );
          const amounts = splitAmount(
            amountKurus,
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
              period: periodKey,
              description: dto.description,
              amountKurus: amount,
              dueDate,
              lateFeeExempt: dto.lateFeeExempt || unit.lateFeeExempt,
              ...(o?.amountMinor !== undefined || o?.target
                ? {
                    metadata: {
                      bulkOverride: {
                        amount: o.amountMinor ?? null,
                        target: o.target ?? null,
                      },
                    },
                  }
                : {}),
            });
          }
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
          status: debts.status,
          amountKurus: debts.amountKurus,
          paidKurus: debts.paidKurus,
        })
        .from(debts)
        .where(and(eq(debts.id, id), isNull(debts.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      if (before.status === "cancelled" || before.status === "written_off")
        throw new ConflictException("conflict:debt_closed");
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

  async collect(dto: PaymentCollect, idempotencyKey?: string) {
    return this.db.tx(async (tx) => {
      const ctx = this.db.ctx();
      // Serialize collections and automatic credit allocation for this unit.
      const [unit] = await tx
        .select({ id: units.id })
        .from(units)
        .where(and(eq(units.id, dto.unitId), isNull(units.deletedAt)))
        .for("update");
      if (!unit) throw new NotFoundException("not_found:unit");

      if (idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(payments)
          .where(eq(payments.idempotencyKey, idempotencyKey));
        if (existing) {
          if (
            existing.status !== "completed" ||
            existing.unitId !== dto.unitId ||
            existing.amountKurus !== dto.amountMinor
          )
            throw new ConflictException("conflict:payment_idempotency");
          const entries = await tx
            .select({ amount: paymentAllocations.amountKurus })
            .from(paymentAllocations)
            .where(eq(paymentAllocations.paymentId, existing.id));
          const allocatedMinor = entries.reduce((sum, e) => sum + e.amount, 0);
          return {
            paymentId: existing.id,
            allocatedMinor,
            creditBalanceMinor: Math.max(
              0,
              existing.amountKurus - existing.refundedKurus - allocatedMinor,
            ),
            closedDebtCount: 0,
            reused: true,
          };
        }
      }
      if (dto.payerUserId) {
        const [payer] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.userId, dto.payerUserId),
              isNull(memberships.deletedAt),
            ),
          )
          .limit(1);
        if (!payer)
          throw new BadRequestException("validation_failed:payer_not_member");
      }
      const active = await tx
        .select({
          userId: unitOccupancies.userId,
          relation: unitOccupancies.relation,
          endDate: unitOccupancies.endDate,
        })
        .from(unitOccupancies)
        .where(eq(unitOccupancies.unitId, dto.unitId));
      const unitDebts = await tx
        .select({
          id: debts.id,
          dueDate: debts.dueDate,
          amountKurus: debts.amountKurus,
          paidKurus: debts.paidKurus,
          lateFeeKurus: debts.lateFeeKurus,
          debtorUserId: debts.debtorUserId,
          kind: debts.kind,
          status: debts.status,
        })
        .from(debts)
        .where(
          and(
            eq(debts.unitId, dto.unitId),
            isNull(debts.deletedAt),
            sql`${debts.status} NOT IN ('paid','written_off','cancelled')`,
          ),
        )
        .for("update");
      const preferred = unitDebts.filter((d) => dto.debtIds.includes(d.id));
      if (
        new Set(preferred.map((d) => d.id)).size !== new Set(dto.debtIds).size
      )
        throw new BadRequestException("validation_failed:invalid_target_debts");
      const preferredPeople = [
        ...new Set(preferred.map((d) => d.debtorUserId)),
      ];
      if (preferredPeople.length > 1)
        throw new BadRequestException("validation_failed:mixed_debtors");
      const current = active.filter((o) => o.endDate === null);
      const tenants = current.filter((o) => o.relation === "tenant");
      const owners = current.filter((o) => o.relation === "owner");
      const existingPeople = [...new Set(unitDebts.map((d) => d.debtorUserId))];
      let debtorUserId: string | null;
      if (dto.debtorUserId) {
        if (
          !active.some((o) => o.userId === dto.debtorUserId) &&
          !unitDebts.some((d) => d.debtorUserId === dto.debtorUserId)
        )
          throw new BadRequestException("validation_failed:debtor_not_in_unit");
        debtorUserId = dto.debtorUserId;
      } else if (preferredPeople.length) debtorUserId = preferredPeople[0]!;
      else if (
        dto.payerUserId &&
        current.some((o) => o.userId === dto.payerUserId)
      )
        debtorUserId = dto.payerUserId;
      else if (existingPeople.length === 1 && (existingPeople[0] === null || current.some((o) => o.userId === existingPeople[0])))
        debtorUserId = existingPeople[0]!;
      else if (tenants.length === 1) debtorUserId = tenants[0]!.userId;
      else if (owners.length === 1) debtorUserId = owners[0]!.userId;
      else {
        const people = [...new Set(unitDebts.map((d) => d.debtorUserId))];
        if (owners.length > 1 || people.length > 1)
          throw new BadRequestException("validation_failed:choose_debtor");
        debtorUserId = people[0] ?? null;
      }
      if (preferred.some((d) => d.debtorUserId !== debtorUserId))
        throw new BadRequestException("validation_failed:mixed_debtors");
      const openDebts = unitDebts.filter(
        (d) => d.debtorUserId === debtorUserId,
      );
      const allocation = allocatePayment(dto.amountMinor, openDebts, {
        preferDebtIds: dto.debtIds,
      });
      // Non-cash offsets cannot manufacture a prepaid cash balance.
      if (dto.method === "credit_balance")
        throw new BadRequestException(
          "validation_failed:credit_balance_not_a_payment",
        );
      if (dto.method === "offset" && allocation.creditBalanceKurus > 0)
        throw new BadRequestException("validation_failed:offset_exceeds_debt");

      const [payment] = await tx
        .insert(payments)
        .values({
          tenantId: ctx.tenantId,
          unitId: dto.unitId,
          payerUserId: dto.payerUserId ?? null,
          debtorUserId,
          amountKurus: dto.amountMinor,
          method: dto.method,
          bankAccountId:
            dto.method === "cash" || dto.method === "offset"
              ? null
              : (dto.bankAccountId ?? null),
          processor: "manual",
          status: "completed",
          paidAt: dto.paidAt,
          receiptNo: dto.receiptNo || (await nextReceiptNo(tx, ctx.tenantId)),
          idempotencyKey: idempotencyKey ?? null,
          metadata: dto.note ? { note: dto.note } : {},
        })
        .returning({ id: payments.id });
      if (!payment) throw new BadRequestException("internal");
      let closed = 0;
      for (const entry of allocation.allocations) {
        await tx
          .insert(paymentAllocations)
          .values({
            tenantId: ctx.tenantId,
            paymentId: payment.id,
            debtId: entry.debtId,
            amountKurus: entry.amountKurus,
          });
        const debt = openDebts.find((d) => d.id === entry.debtId)!;
        const newPaid = debt.paidKurus + entry.amountKurus;
        const status =
          debt.status === "cancelled" || debt.status === "written_off"
            ? debt.status
            : resolveStatus(
                debt.amountKurus + debt.lateFeeKurus,
                newPaid,
                debt.dueDate,
              );
        if (status === "paid") closed += 1;
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
        reused: false,
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
      const [target] = await tx
        .select({ unitId: payments.unitId })
        .from(payments)
        .where(eq(payments.id, paymentId));
      if (target?.unitId)
        await tx
          .select({ id: units.id })
          .from(units)
          .where(eq(units.id, target.unitId))
          .for("update");
      // FOR UPDATE: aynı tahsilatın iki sekmeden iki kez iptali yarışmasın.
      const [payment] = await tx
        .select({
          id: payments.id,
          status: payments.status,
          processor: payments.processor,
          amountKurus: payments.amountKurus,
          refundedKurus: payments.refundedKurus,
          metadata: payments.metadata,
        })
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for("update");

      if (!payment) throw new NotFoundException("not_found");
      if (payment.status === "cancelled")
        throw new ConflictException("conflict:payment_already_cancelled");
      if (payment.processor !== "manual")
        throw new BadRequestException(
          "validation_failed:card_payment_requires_refund",
        );
      if (payment.status !== "completed")
        throw new ConflictException(
          `conflict:payment_not_completed:${payment.status}`,
        );

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
        const status =
          debt.status === "cancelled" || debt.status === "written_off"
            ? debt.status
            : resolveStatus(
                debt.amountKurus + debt.lateFeeKurus,
                newPaid,
                debt.dueDate,
              );
        if (debt.status === "paid" && status !== "paid") reopened += 1;
        await tx
          .update(debts)
          .set({ paidKurus: newPaid, status })
          .where(eq(debts.id, debt.id));
      }

      await tx
        .delete(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, paymentId));

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
        reversedMinor: Math.max(0, payment.amountKurus - payment.refundedKurus),
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
  async forgive(
    ids: string[],
    reason: string,
    decisionRef: string,
  ): Promise<number> {
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
/** `period` … `untilPeriod` (dahil); en çok 24 ay. */
export function periodRange(dto: { period: string; untilPeriod?: string | null }): string[] {
  const start = parsePeriodKey(dto.period);
  if (!start) throw new BadRequestException("validation_failed:period");
  const end = dto.untilPeriod ? parsePeriodKey(dto.untilPeriod) : start;
  if (!end) throw new BadRequestException("validation_failed:period");
  const count = (end.year - start.year) * 12 + (end.month - start.month) + 1;
  if (count < 1) throw new BadRequestException("validation_failed:range_order");
  if (count > 24) throw new BadRequestException("validation_failed:range_too_long");
  return Array.from({ length: count }, (_, i) => {
    const p = addMonths(start, i);
    return `${p.year}-${String(p.month).padStart(2, "0")}`;
  });
}

/** Önizleme için dairelerdeki bugünkü kişiler (ad + ilişki). */
async function occupantsOf(
  tx: Database,
  unitIds: string[],
): Promise<Map<string, { unitId: string; relation: string; name: string }>> {
  if (unitIds.length === 0) return new Map();
  const rows = await tx
    .select({
      unitId: unitOccupancies.unitId,
      userId: unitOccupancies.userId,
      relation: unitOccupancies.relation,
      first: users.firstName,
      last: users.lastName,
    })
    .from(unitOccupancies)
    .innerJoin(users, eq(users.id, unitOccupancies.userId))
    .where(and(inArray(unitOccupancies.unitId, unitIds), isNull(unitOccupancies.endDate)));
  // Anahtar `daire:kişi` — aynı kişi başka dairede başka ilişkiyle olabilir.
  const out = new Map<string, { unitId: string; relation: string; name: string }>();
  for (const r of rows) {
    out.set(`${r.unitId}:${r.userId}`, { unitId: r.unitId, relation: r.relation, name: [r.first, r.last].filter(Boolean).join(" ") });
  }
  return out;
}

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

/**
 * Otomatik makbuz numarası — site ayarında açıksa `önek + sıradaki no`.
 * Sayaç tek UPDATE ile ilerletiliyor (aynı anda iki tahsilat aynı numarayı
 * alamaz); kapalıysa `null` (numarasız makbuz, eski davranış).
 */
async function nextReceiptNo(tx: Database, tenantId: string): Promise<string | null> {
  const rows = (await tx.execute(sql`
    UPDATE tenants
    SET settings = jsonb_set(settings, '{receipt,nextNo}',
          to_jsonb(COALESCE((settings->'receipt'->>'nextNo')::bigint, 1) + 1))
    WHERE id = ${tenantId} AND (settings->'receipt'->>'auto')::boolean IS TRUE
    RETURNING COALESCE((settings->'receipt'->>'nextNo')::bigint, 2) - 1 AS no,
              settings->'receipt'->>'prefix' AS prefix
  `)) as unknown as { no: number | string; prefix: string | null }[];
  const row = rows[0];
  return row ? `${row.prefix ?? ""}${row.no}`.slice(0, 30) : null;
}
