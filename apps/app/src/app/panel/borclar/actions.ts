"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { addMonths, currentPeriod, dueDateFor, parsePeriodKey, periodKey } from "@yonetim/core";
import {
  blocks, debts, paymentAllocations, payments, unitOccupancies, units, withTenant,
} from "@yonetim/db";
import { allocatePayment, distributeDues, splitAmount, type DuesFormula } from "@yonetim/dues";

import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/context";
import {
  ActionError, asArray, checkboxField, dateField, errorState, intField, kurusField, okState,
  optionalText, optionalUuidField, periodField, requiredText, runAction, uuidField, V,
  type ActionState,
} from "@/lib/form";

/**
 * Borçlandırma — GAP 4.1.3.
 *
 * ÜÇ AKIŞ:
 *   1. `createDebt`      — tek birime tek/çoklu kalem
 *   2. `createBulkDebts` — çok birime formülle dağıtım (toplu sihirbaz)
 *   3. `collectPayment`  — tahsilat + mahsup (en eski vade önce)
 *
 * ŞEFFAFLIK (SPEC 3.2 — vurucu özellik): borç tutarı veya vadesi
 * değiştirildiğinde `audit_debt_changes` tablosuna kayıt **veritabanı
 * trigger'ı** ile düşer. Uygulama tarafında yaptığımız tek şey `app.change_reason`
 * oturum değişkenini set etmek: gerekçe zorunlu tutulur, çünkü sakine
 * "neden arttı?" sorusunun cevabı verilebilmelidir. Gerekçesiz güncelleme
 * yolu bilinçli olarak yok.
 */

const DEBT_KINDS = [
  "dues", "utility", "reservation", "penalty", "late_fee", "extra", "legal_cost",
] as const;

const SHARE_TARGETS = ["owner", "tenant", "split", "share"] as const;

/* ------------------------------------------------------------------ *
 * Yardımcı: borç yükümlüsünü belirle
 * ------------------------------------------------------------------ */

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * Borcun kime yazılacağını belirler — GAP 4.1.3 "borç paylaşımı seçimi".
 *
 * `split` (yarı yarıya) ve `share` (hisseye göre) tek bir `debtorUserId`
 * alanına sığmaz; bu yüzden bunlar **birden fazla borç kaydı** üretir.
 * Tek kayıt üretip "yarısı şunun" demek, cari hesapları ve tahsilat
 * mahsubunu bozardı.
 */
async function resolveDebtors(
  tx: Tx,
  unitId: string,
  target: (typeof SHARE_TARGETS)[number],
  translate: (key: string) => string,
): Promise<{ userId: string | null; weight: number }[]> {
  const active = await tx
    .select({
      userId: unitOccupancies.userId,
      relation: unitOccupancies.relation,
      ownershipPct: unitOccupancies.ownershipPct,
    })
    .from(unitOccupancies)
    .where(and(eq(unitOccupancies.unitId, unitId), isNull(unitOccupancies.endDate)));

  const owners = active.filter((row) => row.relation === "owner");
  const tenants = active.filter((row) => row.relation === "tenant");

  switch (target) {
    case "owner": {
      if (owners.length === 0) return [{ userId: null, weight: 1 }];
      // Tek malik → tek borç. Hisseli mülkiyette 'share' seçilmelidir.
      return owners.length === 1
        ? [{ userId: owners[0]!.userId, weight: 1 }]
        : owners.map((row) => ({ userId: row.userId, weight: Number(row.ownershipPct) }));
    }
    case "tenant": {
      if (tenants.length === 0) throw new ActionError(translate("noTenant"));
      return [{ userId: tenants[0]!.userId, weight: 1 }];
    }
    case "split": {
      const owner = owners[0];
      const tenant = tenants[0];
      if (!owner || !tenant) throw new ActionError(translate("splitNeedsBoth"));
      return [
        { userId: owner.userId, weight: 50 },
        { userId: tenant.userId, weight: 50 },
      ];
    }
    case "share": {
      if (owners.length === 0) return [{ userId: null, weight: 1 }];
      return owners.map((row) => ({ userId: row.userId, weight: Number(row.ownershipPct) }));
    }
    default:
      return [{ userId: null, weight: 1 }];
  }
}

/* ------------------------------------------------------------------ *
 * 1) Tek borç
 * ------------------------------------------------------------------ */

const debtSchema = z.object({
  unitId: uuidField,
  kind: z.enum(DEBT_KINDS, { errorMap: () => ({ message: V.invalidSelection }) }),
  description: requiredText(3, 200),
  amountKurus: kurusField({ min: 1 }),
  dueDate: dateField,
  period: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, V.invalidPeriod).optional(),
  ),
  shareTarget: z.enum(SHARE_TARGETS, { errorMap: () => ({ message: V.invalidSelection }) }),
  lateFeeExempt: checkboxField,
  /** Taksit sayısı; 1 = tek seferlik. */
  installmentCount: intField({ min: 1, max: 36 }),
  notes: optionalText(1000),
});

export async function createDebt(
  _previous: ActionState<{ ids: string[] }>,
  formData: FormData,
): Promise<ActionState<{ ids: string[] }>> {
  return runAction(
    { permission: "debt:write", schema: debtSchema, meta: { action: "debt_created", resource: "debt" } },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.debts");

      const created = await withTenant(
        ctx.tenantId,
        async (tx) => {
          const [unit] = await tx
            .select({ id: units.id, number: units.number, lateFeeExempt: units.lateFeeExempt })
            .from(units)
            .where(and(eq(units.id, input.unitId), isNull(units.deletedAt)))
            .limit(1);
          if (!unit) throw new ActionError(t("unitNotFound"));

          const debtors = await resolveDebtors(tx, input.unitId, input.shareTarget, (key) => t(key));
          const perDebtor = splitAmount(
            input.amountKurus,
            debtors.map((entry) => entry.weight),
          );

          const rows: (typeof debts.$inferInsert)[] = [];

          for (const [debtorIndex, debtor] of debtors.entries()) {
            const debtorTotal = perDebtor[debtorIndex] ?? 0;
            if (debtorTotal <= 0) continue;

            // Taksit: tutar eşit bölünür, vadeler ay ay ileri kayar.
            const installments = splitAmount(
              debtorTotal,
              Array.from({ length: input.installmentCount }, () => 1),
            );

            for (const [index, amount] of installments.entries()) {
              const dueDate = new Date(input.dueDate);
              dueDate.setMonth(dueDate.getMonth() + index);
              rows.push({
                tenantId: ctx.tenantId,
                unitId: input.unitId,
                debtorUserId: debtor.userId,
                kind: input.kind,
                period: input.period ?? null,
                description:
                  input.installmentCount > 1
                    ? `${input.description} (${index + 1}/${input.installmentCount})`
                    : input.description,
                amountKurus: amount,
                dueDate,
                // Taksitlendirilen borçta gecikme faizi işlemez: taksit
                // anlaşması zaten gecikmenin çözümüdür (GAP 3.1 şikâyeti).
                lateFeeExempt: input.lateFeeExempt || unit.lateFeeExempt || input.installmentCount > 1,
                installmentNo: input.installmentCount > 1 ? index + 1 : null,
                installmentCount: input.installmentCount > 1 ? input.installmentCount : null,
                metadata: input.notes ? { notes: input.notes } : {},
              });
            }
          }

          if (rows.length === 0) throw new ActionError(t("nothingToCreate"));
          const inserted = await tx.insert(debts).values(rows).returning({ id: debts.id });
          return { ids: inserted.map((row) => row.id), unitNumber: unit.number };
        },
        { userId: ctx.userId },
      );

      if (created.ids[0]) setResourceId(created.ids[0]);
      revalidatePath("/panel/borclar");
      revalidatePath(`/panel/birimler/${input.unitId}`);

      return okState(
        created.ids.length === 1
          ? t("created", { unit: created.unitNumber })
          : t("createdMany", { count: created.ids.length, unit: created.unitNumber }),
        {
          redirectTo: created.ids.length === 1 ? `/panel/borclar/${created.ids[0]}` : "/panel/borclar",
          data: { ids: created.ids },
        },
      );
    },
  );
}

/* ------------------------------------------------------------------ *
 * 2) Toplu borçlandırma
 * ------------------------------------------------------------------ */

const bulkDebtSchema = z.object({
  description: requiredText(3, 200),
  kind: z.enum(DEBT_KINDS, { errorMap: () => ({ message: V.invalidSelection }) }),
  period: periodField,
  dueDay: intField({ min: 1, max: 28 }),
  formula: z.enum(["equal", "land_share", "area", "person_count", "custom"], {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  /** equal: birim başı tutar; diğerleri: dağıtılacak havuz. */
  amountKurus: kurusField({ min: 1 }),
  shareTarget: z.enum(SHARE_TARGETS, { errorMap: () => ({ message: V.invalidSelection }) }),
  /** Boş = tüm bloklar. */
  blockIds: z.preprocess(
    (value) => (Array.isArray(value) ? value : value ? [value] : []),
    z.array(z.string().uuid()).default([]),
  ),
  unitTypes: z.preprocess(
    (value) => (Array.isArray(value) ? value : value ? [value] : []),
    z.array(z.string()).default([]),
  ),
  skipExisting: checkboxField,
  lateFeeExempt: checkboxField,
});

export interface BulkDebtPreview {
  unitId: string;
  unitNumber: string;
  blockName: string | null;
  amountKurus: number;
  exempt: boolean;
  alreadyExists: boolean;
}

export interface BulkDebtResult {
  createdCount: number;
  skippedCount: number;
  totalKurus: number;
}

/** Toplu borçlandırma önizlemesi — kaydetmeden hangi daireye ne düşeceğini gösterir. */
export async function previewBulkDebts(
  input: z.input<typeof bulkDebtSchema>,
): Promise<{ rows: BulkDebtPreview[]; totalKurus: number; error?: string }> {
  const ctx = await requirePermission("debt:write");
  const t = await getTranslations("app.debts");
  const parsed = bulkDebtSchema.safeParse(input);
  if (!parsed.success) return { rows: [], totalKurus: 0, error: t("previewInvalid") };

  const data = parsed.data;
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await selectTargetUnits(tx, data);
    if (rows.length === 0) return { rows: [], totalKurus: 0, error: t("noTargetUnits") };

    const distribution = distributeDues({
      formula: data.formula as DuesFormula,
      baseAmountKurus: data.formula === "equal" ? data.amountKurus : undefined,
      totalAmountKurus: data.formula === "equal" ? undefined : data.amountKurus,
      units: rows.map((row) => ({
        id: row.id,
        landShare: row.landShare === null ? null : Number(row.landShare),
        areaM2: row.areaM2 === null ? null : Number(row.areaM2),
        residentCount: row.residentCount,
        multiplier: Number(row.duesMultiplier),
        exempt: row.duesExempt,
        customAmountKurus: data.formula === "custom" ? data.amountKurus : undefined,
      })),
    });

    const existing = new Set(
      (
        await tx
          .select({ unitId: debts.unitId })
          .from(debts)
          .where(
            and(
              eq(debts.period, data.period),
              eq(debts.kind, data.kind),
              isNull(debts.deletedAt),
            ),
          )
      ).map((row) => row.unitId),
    );

    const preview: BulkDebtPreview[] = rows.map((row) => {
      const share = distribution.shares.find((entry) => entry.unitId === row.id);
      return {
        unitId: row.id,
        unitNumber: row.number,
        blockName: row.blockName,
        amountKurus: share?.amountKurus ?? 0,
        exempt: row.duesExempt,
        alreadyExists: existing.has(row.id),
      };
    });

    return {
      rows: preview,
      totalKurus: preview
        .filter((row) => !(data.skipExisting && row.alreadyExists))
        .reduce((sum, row) => sum + row.amountKurus, 0),
    };
  });
}

export async function createBulkDebts(
  _previous: ActionState<BulkDebtResult>,
  formData: FormData,
): Promise<ActionState<BulkDebtResult>> {
  return runAction(
    {
      permission: "debt:write",
      schema: bulkDebtSchema,
      meta: { action: "debt_bulk_created", resource: "debt" },
    },
    formData,
    async ({ ctx, input }) => {
      const t = await getTranslations("app.debts");
      const period = parsePeriodKey(input.period);
      if (!period) return errorState(t("periodInvalid"), { period: [t("periodInvalid")] });

      const result = await withTenant(
        ctx.tenantId,
        async (tx) => {
          const targetUnits = await selectTargetUnits(tx, input);
          if (targetUnits.length === 0) throw new ActionError(t("noTargetUnits"));

          const distribution = distributeDues({
            formula: input.formula as DuesFormula,
            baseAmountKurus: input.formula === "equal" ? input.amountKurus : undefined,
            totalAmountKurus: input.formula === "equal" ? undefined : input.amountKurus,
            units: targetUnits.map((row) => ({
              id: row.id,
              landShare: row.landShare === null ? null : Number(row.landShare),
              areaM2: row.areaM2 === null ? null : Number(row.areaM2),
              residentCount: row.residentCount,
              multiplier: Number(row.duesMultiplier),
              exempt: row.duesExempt,
              customAmountKurus: input.formula === "custom" ? input.amountKurus : undefined,
            })),
          });

          const existing = new Set(
            (
              await tx
                .select({ unitId: debts.unitId })
                .from(debts)
                .where(
                  and(
                    eq(debts.period, input.period),
                    eq(debts.kind, input.kind),
                    isNull(debts.deletedAt),
                  ),
                )
            ).map((row) => row.unitId),
          );

          const dueDate = dueDateFor(period, input.dueDay);
          const rows: (typeof debts.$inferInsert)[] = [];
          let skipped = 0;

          for (const unit of targetUnits) {
            const share = distribution.shares.find((entry) => entry.unitId === unit.id);
            if (!share || share.amountKurus <= 0) {
              skipped += 1;
              continue;
            }
            if (input.skipExisting && existing.has(unit.id)) {
              skipped += 1;
              continue;
            }

            const debtors = await resolveDebtors(tx, unit.id, input.shareTarget, (key) => t(key));
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
                kind: input.kind,
                period: input.period,
                description: input.description,
                amountKurus: amount,
                dueDate,
                lateFeeExempt: input.lateFeeExempt || unit.lateFeeExempt,
              });
            }
          }

          if (rows.length === 0) throw new ActionError(t("nothingToCreate"));

          // Tek INSERT, tek transaction: kısmen oluşmuş borçlandırma olmaz.
          await tx.insert(debts).values(rows);
          return {
            createdCount: rows.length,
            skippedCount: skipped,
            totalKurus: rows.reduce((sum, row) => sum + (row.amountKurus ?? 0), 0),
          };
        },
        { userId: ctx.userId },
      );

      revalidatePath("/panel/borclar");
      revalidatePath("/panel");

      return okState(
        result.skippedCount > 0
          ? t("bulkCreatedWithSkips", {
              count: result.createdCount,
              skipped: result.skippedCount,
            })
          : t("bulkCreated", { count: result.createdCount }),
        { data: result },
      );
    },
  );
}

/** Filtreye uyan birimleri döner (toplu borçlandırma hedefi). */
async function selectTargetUnits(
  tx: Tx,
  filter: { blockIds: string[]; unitTypes: string[] },
) {
  const conditions = [isNull(units.deletedAt)];
  if (filter.blockIds.length > 0) conditions.push(inArray(units.blockId, filter.blockIds));
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
    })
    .from(units)
    .leftJoin(blocks, eq(blocks.id, units.blockId))
    .where(and(...conditions))
    .orderBy(units.number);
}

/* ------------------------------------------------------------------ *
 * 3) Borç düzeltme (gerekçe zorunlu)
 * ------------------------------------------------------------------ */

const adjustSchema = z.object({
  id: uuidField,
  amountKurus: kurusField({ min: 0 }),
  dueDate: dateField,
  /** Zorunlu — sakine gösterilecek gerekçe (SPEC 3.2). */
  reason: requiredText(10, 500),
  visibleToResident: checkboxField,
  lateFeeExempt: checkboxField,
});

/**
 * Borç tutarı/vadesi düzeltme.
 *
 * Gerekçe **10 karakterden kısa olamaz**: "düzeltme" gibi içi boş bir metin
 * sakinin sorusunu cevaplamıyor. Gerekçe `app.change_reason` oturum
 * değişkenine yazılır; `trg_debts_change_log` trigger'ı onu timeline'a taşır.
 */
export async function adjustDebt(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    { permission: "debt:write", schema: adjustSchema, meta: { action: "debt_adjusted", resource: "debt" } },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.debts");
      setResourceId(input.id);

      await withTenant(
        ctx.tenantId,
        async (tx) => {
          const [before] = await tx
            .select({
              id: debts.id,
              unitId: debts.unitId,
              amountKurus: debts.amountKurus,
              paidKurus: debts.paidKurus,
              status: debts.status,
            })
            .from(debts)
            .where(and(eq(debts.id, input.id), isNull(debts.deletedAt)))
            .limit(1);
          if (!before) throw new ActionError(t("notFound"));
          if (input.amountKurus < before.paidKurus) {
            throw new ActionError(t("belowPaid"), {
              amountKurus: [t("belowPaid")],
            });
          }

          // Gerekçeyi trigger'ın okuyacağı oturum değişkenine yaz.
          await tx.execute(sql`SELECT set_config('app.change_reason', ${input.reason}, true)`);

          await tx
            .update(debts)
            .set({
              amountKurus: input.amountKurus,
              dueDate: input.dueDate,
              lateFeeExempt: input.lateFeeExempt,
              status: resolveStatus(input.amountKurus, before.paidKurus, input.dueDate),
            })
            .where(eq(debts.id, input.id));
        },
        { userId: ctx.userId },
      );

      await audit(ctx, {
        action: "debt_adjusted",
        resource: "debt",
        resourceId: input.id,
        reason: input.reason,
      });

      revalidatePath("/panel/borclar");
      revalidatePath(`/panel/borclar/${input.id}`);
      return okState(t("adjusted"));
    },
  );
}

/** Ödenen tutar ve vadeye göre durum. Tek yerde tutulur ki tutarsızlık olmasın. */
function resolveStatus(
  amountKurus: number,
  paidKurus: number,
  dueDate: Date,
): "pending" | "partial" | "paid" | "overdue" {
  if (paidKurus >= amountKurus) return "paid";
  if (paidKurus > 0) return "partial";
  return dueDate.getTime() < Date.now() ? "overdue" : "pending";
}

/* ------------------------------------------------------------------ *
 * 4) Tahsilat
 * ------------------------------------------------------------------ */

const collectSchema = z.object({
  unitId: uuidField,
  amountKurus: kurusField({ min: 1 }),
  method: z.enum(["cash", "bank_transfer", "card", "credit_balance", "offset"], {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  paidAt: dateField,
  payerUserId: optionalUuidField,
  receiptNo: optionalText(30),
  /** Belirli borçlara öncelik verilsin (boşsa en eski vade önce). */
  debtIds: z.preprocess(
    (value) => (Array.isArray(value) ? value : value ? [value] : []),
    z.array(z.string().uuid()).default([]),
  ),
  note: optionalText(500),
});

export interface CollectResult {
  allocatedKurus: number;
  creditBalanceKurus: number;
  closedDebtCount: number;
}

/**
 * Manuel tahsilat kaydı + mahsup.
 *
 * Mahsup sırası `packages/dues/allocation` tarafından belirlenir (en eski vade,
 * her borçta önce gecikme tazminatı). Bu mantık kasıtlı olarak paket içinde:
 * hem burada hem ödeme webhook'unda aynı kural işlemeli, iki kopya olamaz.
 *
 * Borcu aşan kısım `creditBalance` olarak döner ve kullanıcıya bildirilir;
 * sessizce yutmak yönetici için görünmez bir fark yaratırdı.
 */
export async function collectPayment(
  _previous: ActionState<CollectResult>,
  formData: FormData,
): Promise<ActionState<CollectResult>> {
  return runAction(
    {
      permission: "payment:create",
      schema: collectSchema,
      meta: { action: "payment_collected", resource: "payment" },
    },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.debts");

      const result = await withTenant(
        ctx.tenantId,
        async (tx) => {
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
                eq(debts.unitId, input.unitId),
                isNull(debts.deletedAt),
                sql`${debts.status} <> 'paid'`,
              ),
            );

          if (openDebts.length === 0) throw new ActionError(t("noOpenDebts"));

          const allocation = allocatePayment(input.amountKurus, openDebts, {
            preferDebtIds: input.debtIds,
          });

          // Borçlu: seçilen borçların yükümlüsü (ödeyenden farklı olabilir).
          const firstDebt = openDebts.find(
            (debt) => debt.id === allocation.allocations[0]?.debtId,
          );

          const [payment] = await tx
            .insert(payments)
            .values({
              tenantId: ctx.tenantId,
              unitId: input.unitId,
              payerUserId: input.payerUserId ?? null,
              debtorUserId: firstDebt?.debtorUserId ?? null,
              amountKurus: input.amountKurus,
              method: input.method,
              processor: "manual",
              status: "completed",
              paidAt: input.paidAt,
              receiptNo: input.receiptNo ?? null,
              metadata: input.note ? { note: input.note } : {},
            })
            .returning({ id: payments.id });

          if (!payment) throw new ActionError(t("collectFailed"));

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
            await tx.update(debts).set({ paidKurus: newPaid, status }).where(eq(debts.id, debt.id));
          }

          return {
            paymentId: payment.id,
            allocatedKurus: allocation.allocatedKurus,
            creditBalanceKurus: allocation.creditBalanceKurus,
            closedDebtCount: closed,
          };
        },
        { userId: ctx.userId },
      );

      setResourceId(result.paymentId);
      revalidatePath("/panel/borclar");
      revalidatePath(`/panel/birimler/${input.unitId}`);
      revalidatePath("/panel");

      return okState(
        result.creditBalanceKurus > 0
          ? t("collectedWithCredit", { credit: (result.creditBalanceKurus / 100).toFixed(2) })
          : t("collected", { count: result.closedDebtCount }),
        {
          data: {
            allocatedKurus: result.allocatedKurus,
            creditBalanceKurus: result.creditBalanceKurus,
            closedDebtCount: result.closedDebtCount,
          },
        },
      );
    },
  );
}

/* ------------------------------------------------------------------ *
 * 5) Toplu işlemler
 * ------------------------------------------------------------------ */

export interface BulkResult {
  ok: boolean;
  message: string;
}

/** Borç iptali (soft-delete). Ödenmiş borç iptal edilemez. */
export async function cancelDebts(ids: string[], reason: string): Promise<BulkResult> {
  const ctx = await requirePermission("debt:write");
  const t = await getTranslations("app.debts");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };
  if (reason.trim().length < 10) return { ok: false, message: t("reasonTooShort") };

  const affected = await withTenant(
    ctx.tenantId,
    async (tx) => {
      await tx.execute(sql`SELECT set_config('app.change_reason', ${reason}, true)`);
      const rows = await tx
        .update(debts)
        .set({ status: "cancelled", deletedAt: new Date() })
        .where(
          and(
            inArray(debts.id, targets),
            isNull(debts.deletedAt),
            // Kısmen bile ödenmiş borç iptal edilemez: para geri ödeme akışı gerektirir.
            eq(debts.paidKurus, 0),
          ),
        )
        .returning({ id: debts.id });
      return rows.length;
    },
    { userId: ctx.userId },
  );

  await audit(ctx, {
    action: "debt_bulk_cancelled",
    resource: "debt",
    reason: `${reason} (${affected}/${targets.length})`,
  });
  revalidatePath("/panel/borclar");

  return affected === targets.length
    ? { ok: true, message: t("bulkCancelled", { count: affected }) }
    : {
        ok: true,
        message: t("bulkCancelledPartial", {
          count: affected,
          skipped: targets.length - affected,
        }),
      };
}

/** Gecikme tazminatı muafiyetini toplu aç/kapat — GAP 4.2.5. */
export async function setLateFeeExempt(ids: string[], exempt: boolean): Promise<BulkResult> {
  const ctx = await requirePermission("debt:write");
  const t = await getTranslations("app.debts");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  const affected = await withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .update(debts)
        .set({ lateFeeExempt: exempt })
        .where(and(inArray(debts.id, targets), isNull(debts.deletedAt)))
        .returning({ id: debts.id });
      return rows.length;
    },
    { userId: ctx.userId },
  );

  await audit(ctx, {
    action: exempt ? "debt_late_fee_exempted" : "debt_late_fee_reinstated",
    resource: "debt",
    reason: String(affected),
  });
  revalidatePath("/panel/borclar");
  return {
    ok: true,
    message: exempt ? t("exemptApplied", { count: affected }) : t("exemptRemoved", { count: affected }),
  };
}

/** Sonraki dönem anahtarını verir (form varsayılanı). */
export async function nextPeriodKey(): Promise<string> {
  return periodKey(addMonths(currentPeriod(), 1));
}
