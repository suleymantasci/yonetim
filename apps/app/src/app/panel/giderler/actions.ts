"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { dueDateFor, parsePeriodKey, periodKey, toIstanbul } from "@yonetim/core";
import { blocks, debts, expenseCategories, expenses, units, withTenant } from "@yonetim/db";
import { distributeDues, type DuesFormula } from "@yonetim/dues";

import { audit, diffOf } from "@/lib/audit";
import { requirePermission } from "@/lib/context";
import {
  ActionError, asArray, checkboxField, dateField, decimalField, intField,
  kurusField, okState, optionalText, optionalUuidField, requiredText, runAction, uuidField, V,
  type ActionState,
} from "@/lib/form";

/**
 * Gider yönetimi — GAP 4.1.4.
 *
 * ÇÖZÜLEN TEMEL SORUN: gider kaydı bir kategori kimliğine bağlıydı ama arayüzden
 * kategori **eklenemiyordu**; yeni bir gider türü çıktığında kayıt eksik kalıyordu.
 * Artık kategori CRUD'u var, hiyerarşik (iki seviye) ve her kategori kendi
 * varsayılan dağıtım formülünü taşıyor.
 *
 * İKİNCİ EKSİK: gider → daire yansıması. `distributeAt` alanı vardı, dağıtan
 * kod yoktu. `distributeExpense` bunu yapıyor: gideri kategorinin formülüne
 * (veya seçilen formüle) göre dairelere borç olarak yazıyor ve gideri
 * "dağıtıldı" olarak işaretliyor — çift dağıtım engelleniyor.
 */

const DISTRIBUTIONS = ["equal", "land_share", "area", "person_count", "meter", "custom"] as const;

/* ------------------------------------------------------------------ *
 * Kategori CRUD
 * ------------------------------------------------------------------ */

const categorySchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  name: requiredText(2, 120),
  parentId: optionalUuidField,
  distribution: z.enum(DISTRIBUTIONS, { errorMap: () => ({ message: V.invalidSelection }) }),
  isShared: checkboxField,
  icon: optionalText(40),
  color: optionalText(9),
  defaultVatRate: decimalField({ min: 0, max: 1 }),
  isActive: checkboxField,
  sortOrder: intField({ min: 0, max: 999 }),
});

export async function saveExpenseCategory(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "expense:write",
      schema: categorySchema,
      meta: { action: "expense_category_saved", resource: "expense_category" },
    },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.expenses");

      const id = await withTenant(
        ctx.tenantId,
        async (tx) => {
          let depth = 0;
          if (input.parentId) {
            const [parent] = await tx
              .select({ id: expenseCategories.id, depth: expenseCategories.depth })
              .from(expenseCategories)
              .where(eq(expenseCategories.id, input.parentId))
              .limit(1);
            if (!parent) throw new ActionError(t("parentNotFound"));
            // İki seviye ile sınırlı: daha derin ağaç yöneticiye fayda vermiyor,
            // dağıtım formülünün hangi seviyeden geldiğini de belirsizleştiriyor.
            if (parent.depth >= 1) throw new ActionError(t("depthLimit"));
            depth = parent.depth + 1;
          }

          // Kendini üst kategori seçme (döngü) engeli.
          if (input.id && input.parentId === input.id) {
            throw new ActionError(t("selfParent"), { parentId: [t("selfParent")] });
          }

          const values = {
            tenantId: ctx.tenantId,
            name: input.name,
            parentId: input.parentId ?? null,
            depth,
            distribution: input.distribution,
            isShared: input.isShared,
            icon: input.icon ?? null,
            color: input.color ?? null,
            defaultVatRate: input.defaultVatRate?.toFixed(2) ?? null,
            isActive: input.isActive,
            sortOrder: input.sortOrder,
          };

          if (input.id) {
            await tx
              .update(expenseCategories)
              .set(values)
              .where(eq(expenseCategories.id, input.id));
            return input.id;
          }

          const [row] = await tx
            .insert(expenseCategories)
            .values(values)
            .returning({ id: expenseCategories.id });
          if (!row) throw new ActionError(t("categorySaveFailed"));
          return row.id;
        },
        { userId: ctx.userId },
      );

      setResourceId(id);
      revalidatePath("/panel/giderler");
      revalidatePath("/panel/giderler/kategoriler");
      return okState(t("categorySaved", { name: input.name }), { data: { id } });
    },
  );
}

export interface BulkResult {
  ok: boolean;
  message: string;
}

/**
 * Kategori arşivleme.
 *
 * Altında gider veya alt kategori varsa **silinmez, pasifleştirilir**: geçmiş
 * gider kayıtlarının kategorisini kopartmak raporları bozardı. Pasif kategori
 * yeni gider formunda görünmez ama eski kayıtlarda adı okunmaya devam eder.
 */
export async function archiveExpenseCategory(id: string): Promise<BulkResult> {
  const ctx = await requirePermission("expense:write");
  const t = await getTranslations("app.expenses");

  const result = await withTenant(
    ctx.tenantId,
    async (tx) => {
      const [usage] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(expenses)
        .where(and(eq(expenses.categoryId, id), isNull(expenses.deletedAt)));
      const [children] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(expenseCategories)
        .where(and(eq(expenseCategories.parentId, id), isNull(expenseCategories.deletedAt)));

      const inUse = Number(usage?.value ?? 0) > 0 || Number(children?.value ?? 0) > 0;

      await tx
        .update(expenseCategories)
        .set(inUse ? { isActive: false } : { isActive: false, deletedAt: new Date() })
        .where(eq(expenseCategories.id, id));

      return { inUse, usageCount: Number(usage?.value ?? 0) };
    },
    { userId: ctx.userId },
  );

  await audit(ctx, {
    action: result.inUse ? "expense_category_deactivated" : "expense_category_archived",
    resource: "expense_category",
    resourceId: id,
  });
  revalidatePath("/panel/giderler/kategoriler");

  return {
    ok: true,
    message: result.inUse
      ? t("categoryDeactivated", { count: result.usageCount })
      : t("categoryArchived"),
  };
}

/* ------------------------------------------------------------------ *
 * Gider CRUD
 * ------------------------------------------------------------------ */

const expenseSchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  categoryId: optionalUuidField,
  vendorName: optionalText(160),
  description: requiredText(3, 240),
  amountKurus: kurusField({ min: 1 }),
  vatRate: decimalField({ min: 0, max: 1 }),
  withholdingKurus: kurusField({ min: 0 }),
  invoiceNo: optionalText(60),
  expenseDate: dateField,
  paidVia: optionalText(40),
  isPaid: checkboxField,
  attachmentUrl: optionalText(500),
  status: z.enum(["draft", "pending_approval", "approved", "rejected", "paid"], {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
});

/**
 * Gider kaydı.
 *
 * KDV **tutar üzerinden hesaplanır, ayrı girilmez**: yönetici 1.200 TL'lik
 * faturayı görüp KDV'yi elle yazmak zorunda kalmasın. `amountKurus` KDV dahil
 * toplamdır; `vatKurus` orandan türetilir. Böylece toplam ile kalem toplamı
 * asla uyuşmazlık göstermez.
 */
export async function saveExpense(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "expense:write",
      schema: expenseSchema,
      meta: { action: "expense_saved", resource: "expense" },
    },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.expenses");
      const vatRate = input.vatRate ?? 0.2;
      // KDV dahil tutardan KDV'yi ayır: toplam / (1 + oran) × oran.
      const vatKurus = Math.round((input.amountKurus * vatRate) / (1 + vatRate));
      const period = periodKey({
        year: toIstanbul(input.expenseDate).getUTCFullYear(),
        month: toIstanbul(input.expenseDate).getUTCMonth() + 1,
      });

      const id = await withTenant(
        ctx.tenantId,
        async (tx) => {
          const values = {
            tenantId: ctx.tenantId,
            categoryId: input.categoryId ?? null,
            vendorName: input.vendorName ?? null,
            description: input.description,
            amountKurus: input.amountKurus,
            vatRate: vatRate.toFixed(2),
            vatKurus,
            withholdingKurus: input.withholdingKurus,
            invoiceNo: input.invoiceNo ?? null,
            expenseDate: input.expenseDate,
            paidAt: input.isPaid ? input.expenseDate : null,
            paidVia: input.paidVia ?? null,
            attachmentUrl: input.attachmentUrl ?? null,
            status: input.status,
            period,
            createdBy: ctx.userId,
            approvedBy: input.status === "approved" || input.status === "paid" ? ctx.userId : null,
          };

          if (input.id) {
            const [before] = await tx
              .select()
              .from(expenses)
              .where(eq(expenses.id, input.id))
              .limit(1);
            if (!before) throw new ActionError(t("notFound"));
            if (before.distributedAt) {
              // Dağıtılmış gider değiştirilemez: sakinlere yazılmış borçlarla
              // tutarsızlık doğar. Düzeltme için borçları iptal etmek gerekir.
              throw new ActionError(t("alreadyDistributedEdit"));
            }
            await tx.update(expenses).set(values).where(eq(expenses.id, input.id));
            await audit(ctx, {
              action: "expense_updated",
              resource: "expense",
              resourceId: input.id,
              diff: diffOf(before as unknown as Record<string, unknown>, values),
            });
            return input.id;
          }

          const [row] = await tx.insert(expenses).values(values).returning({ id: expenses.id });
          if (!row) throw new ActionError(t("saveFailed"));
          return row.id;
        },
        { userId: ctx.userId },
      );

      setResourceId(id);
      revalidatePath("/panel/giderler");
      revalidatePath(`/panel/giderler/${id}`);

      return okState(t("saved"), {
        redirectTo: `/panel/giderler/${id}`,
        data: { id },
      });
    },
  );
}

/** Gider onayı / reddi — GAP 4.1.4 "onay/iptal/red akışı". */
export async function setExpenseStatus(
  ids: string[],
  status: "approved" | "rejected" | "paid",
): Promise<BulkResult> {
  const ctx = await requirePermission("expense:approve");
  const t = await getTranslations("app.expenses");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  const affected = await withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .update(expenses)
        .set({
          status,
          approvedBy: status === "rejected" ? null : ctx.userId,
          paidAt: status === "paid" ? new Date() : undefined,
        })
        .where(and(inArray(expenses.id, targets), isNull(expenses.deletedAt)))
        .returning({ id: expenses.id });
      return rows.length;
    },
    { userId: ctx.userId },
  );

  await audit(ctx, {
    action: `expense_${status}`,
    resource: "expense",
    reason: `${affected}/${targets.length}`,
  });
  revalidatePath("/panel/giderler");
  return { ok: true, message: t(`status_${status}_done`, { count: affected }) };
}

export async function deleteExpenses(ids: string[]): Promise<BulkResult> {
  const ctx = await requirePermission("expense:write");
  const t = await getTranslations("app.expenses");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  const affected = await withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .update(expenses)
        .set({ deletedAt: new Date() })
        .where(
          and(
            inArray(expenses.id, targets),
            isNull(expenses.deletedAt),
            // Dağıtılmış gider silinemez: karşılığında sakin borçları var.
            isNull(expenses.distributedAt),
          ),
        )
        .returning({ id: expenses.id });
      return rows.length;
    },
    { userId: ctx.userId },
  );

  await audit(ctx, {
    action: "expense_bulk_deleted",
    resource: "expense",
    reason: `${affected}/${targets.length}`,
  });
  revalidatePath("/panel/giderler");

  return affected === targets.length
    ? { ok: true, message: t("bulkDeleted", { count: affected }) }
    : {
        ok: true,
        message: t("bulkDeletedPartial", {
          count: affected,
          skipped: targets.length - affected,
        }),
      };
}

/* ------------------------------------------------------------------ *
 * Gider → daire dağıtımı
 * ------------------------------------------------------------------ */

const distributeSchema = z.object({
  expenseId: uuidField,
  /** Boş = kategorinin varsayılan formülü. */
  formula: z.enum(DISTRIBUTIONS, { errorMap: () => ({ message: V.invalidSelection }) }),
  period: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, V.invalidPeriod).optional(),
  ),
  dueDay: intField({ min: 1, max: 28 }),
  blockIds: z.preprocess(
    (value) => (Array.isArray(value) ? value : value ? [value] : []),
    z.array(z.string().uuid()).default([]),
  ),
  /** Yalnız KDV hariç tutarı yansıt (KDV yönetim tarafında kalır). */
  excludeVat: checkboxField,
});

export interface DistributeResult {
  debtCount: number;
  totalKurus: number;
}

/**
 * Gideri dairelere borç olarak yansıtır — GAP 4.1.4.
 *
 * Bir gider **yalnız bir kez** dağıtılabilir (`distributed_at` işareti).
 * İkinci deneme reddedilir; aksi halde aynı fatura sakine iki kez yazılırdı
 * ve bunu geri almak tek tek borç iptali gerektirirdi.
 *
 * Dağıtım tek transaction içinde: borçlar ve "dağıtıldı" işareti birlikte
 * yazılır, yarım kalmış dağıtım oluşmaz.
 */
export async function distributeExpense(
  _previous: ActionState<DistributeResult>,
  formData: FormData,
): Promise<ActionState<DistributeResult>> {
  return runAction(
    {
      permission: "expense:approve",
      schema: distributeSchema,
      meta: { action: "expense_distributed", resource: "expense" },
    },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.expenses");
      setResourceId(input.expenseId);

      const result = await withTenant(
        ctx.tenantId,
        async (tx) => {
          const [expense] = await tx
            .select()
            .from(expenses)
            .where(and(eq(expenses.id, input.expenseId), isNull(expenses.deletedAt)))
            .limit(1);
          if (!expense) throw new ActionError(t("notFound"));
          if (expense.distributedAt) throw new ActionError(t("alreadyDistributed"));
          if (expense.status === "rejected" || expense.status === "draft") {
            throw new ActionError(t("notApprovedYet"));
          }

          const poolKurus = input.excludeVat
            ? expense.amountKurus - expense.vatKurus
            : expense.amountKurus;
          if (poolKurus <= 0) throw new ActionError(t("nothingToDistribute"));

          const conditions = [isNull(units.deletedAt)];
          if (input.blockIds.length > 0) {
            conditions.push(inArray(units.blockId, input.blockIds));
          }

          const targetUnits = await tx
            .select({
              id: units.id,
              number: units.number,
              landShare: units.landShare,
              areaM2: units.areaM2,
              residentCount: units.residentCount,
              duesMultiplier: units.duesMultiplier,
              duesExempt: units.duesExempt,
              lateFeeExempt: units.lateFeeExempt,
              currentOwnerId: units.currentOwnerId,
              currentTenantId: units.currentTenantId,
            })
            .from(units)
            .leftJoin(blocks, eq(blocks.id, units.blockId))
            .where(and(...conditions));

          if (targetUnits.length === 0) throw new ActionError(t("noTargetUnits"));

          const distribution = distributeDues({
            formula: input.formula as DuesFormula,
            totalAmountKurus: poolKurus,
            units: targetUnits.map((unit) => ({
              id: unit.id,
              landShare: unit.landShare === null ? null : Number(unit.landShare),
              areaM2: unit.areaM2 === null ? null : Number(unit.areaM2),
              residentCount: unit.residentCount,
              multiplier: Number(unit.duesMultiplier),
              exempt: unit.duesExempt,
            })),
          });

          const period = input.period ?? expense.period ?? periodKey({
            year: expense.expenseDate.getFullYear(),
            month: expense.expenseDate.getMonth() + 1,
          });
          const parsed = parsePeriodKey(period);
          if (!parsed) throw new ActionError(t("periodInvalid"));
          const dueDate = dueDateFor(parsed, input.dueDay);

          const rows: (typeof debts.$inferInsert)[] = [];
          for (const unit of targetUnits) {
            const share = distribution.shares.find((entry) => entry.unitId === unit.id);
            if (!share || share.amountKurus <= 0) continue;
            rows.push({
              tenantId: ctx.tenantId,
              unitId: unit.id,
              // Gider payı ortak alan kaynaklı: KMK md.20 gereği malik yükümlüdür.
              debtorUserId: unit.currentOwnerId ?? unit.currentTenantId ?? null,
              kind: "utility",
              period,
              description: t("distributedDescription", { expense: expense.description }),
              amountKurus: share.amountKurus,
              dueDate,
              lateFeeExempt: unit.lateFeeExempt,
              metadata: { sourceExpenseId: expense.id, formula: input.formula },
            });
          }

          if (rows.length === 0) throw new ActionError(t("nothingToDistribute"));

          await tx.insert(debts).values(rows);
          await tx
            .update(expenses)
            .set({ distributedAt: new Date(), period })
            .where(eq(expenses.id, expense.id));

          return {
            debtCount: rows.length,
            totalKurus: rows.reduce((sum, row) => sum + (row.amountKurus ?? 0), 0),
          };
        },
        { userId: ctx.userId },
      );

      revalidatePath("/panel/giderler");
      revalidatePath(`/panel/giderler/${input.expenseId}`);
      revalidatePath("/panel/borclar");

      return okState(t("distributed", { count: result.debtCount }), { data: result });
    },
  );
}

/** Dağıtım önizlemesi — hangi daireye ne düşeceğini kaydetmeden gösterir. */
export async function previewDistribution(input: {
  expenseId: string;
  formula: string;
  blockIds: string[];
  excludeVat: boolean;
}): Promise<{ rows: { unitNumber: string; amountKurus: number; exempt: boolean }[]; totalKurus: number; error?: string }> {
  const ctx = await requirePermission("expense:read");
  const t = await getTranslations("app.expenses");

  return withTenant(ctx.tenantId, async (tx) => {
    const [expense] = await tx
      .select({
        amountKurus: expenses.amountKurus,
        vatKurus: expenses.vatKurus,
      })
      .from(expenses)
      .where(eq(expenses.id, input.expenseId))
      .limit(1);
    if (!expense) return { rows: [], totalKurus: 0, error: t("notFound") };

    const poolKurus = input.excludeVat
      ? expense.amountKurus - expense.vatKurus
      : expense.amountKurus;

    const conditions = [isNull(units.deletedAt)];
    if (input.blockIds.length > 0) conditions.push(inArray(units.blockId, input.blockIds));

    const targetUnits = await tx
      .select({
        id: units.id,
        number: units.number,
        landShare: units.landShare,
        areaM2: units.areaM2,
        residentCount: units.residentCount,
        duesMultiplier: units.duesMultiplier,
        duesExempt: units.duesExempt,
      })
      .from(units)
      .where(and(...conditions))
      .orderBy(units.number);

    if (targetUnits.length === 0) return { rows: [], totalKurus: 0, error: t("noTargetUnits") };

    const distribution = distributeDues({
      formula: input.formula as DuesFormula,
      totalAmountKurus: poolKurus,
      units: targetUnits.map((unit) => ({
        id: unit.id,
        landShare: unit.landShare === null ? null : Number(unit.landShare),
        areaM2: unit.areaM2 === null ? null : Number(unit.areaM2),
        residentCount: unit.residentCount,
        multiplier: Number(unit.duesMultiplier),
        exempt: unit.duesExempt,
      })),
    });

    const rows = targetUnits.map((unit) => ({
      unitNumber: unit.number,
      amountKurus:
        distribution.shares.find((entry) => entry.unitId === unit.id)?.amountKurus ?? 0,
      exempt: unit.duesExempt,
    }));

    return {
      rows,
      totalKurus: rows.reduce((sum, row) => sum + row.amountKurus, 0),
      error: distribution.fellBackToEqual ? t("formulaFellBack") : undefined,
    };
  });
}
