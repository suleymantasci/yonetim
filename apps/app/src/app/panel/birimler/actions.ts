"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { blocks, units, withTenant } from "@yonetim/db";
import { resolveLandShare } from "@yonetim/dues";

import { audit, diffOf } from "@/lib/audit";
import { requirePermission } from "@/lib/context";
import {
  ActionError, asArray, checkboxField, decimalField, errorState, intField, okState,
  optionalText, optionalUuidField, requiredText, runAction, uuidField, V,
  type ActionState,
} from "@/lib/form";

/**
 * Bağımsız bölüm (birim) ve blok CRUD — GAP 4.1.1.
 *
 * Silme her zaman **soft-delete**: `deleted_at` işaretlenir, kayıt 30 gün çöp
 * kutusunda kalır (SPEC 11.2 "onay yerine geri alma"). Kalıcı silme arayüzden
 * hiç sunulmaz; KVKK saklama süresi imhası ayrı bir cron işidir.
 */

const UNIT_TYPES = ["flat", "shop", "office", "depot", "garage", "villa", "common_area"] as const;
const OWNERSHIP_TYPES = ["owner", "tenant", "vacant"] as const;

/* ------------------------------------------------------------------ *
 * Tek birim oluşturma / güncelleme
 * ------------------------------------------------------------------ */

const unitSchema = z.object({
  blockId: optionalUuidField,
  number: requiredText(1, 20),
  floor: intField({ min: -10, max: 200 }),
  type: z.enum(UNIT_TYPES, { errorMap: () => ({ message: V.invalidSelection }) }),
  areaM2: decimalField({ min: 1, max: 100_000 }),
  landShare: decimalField({ min: 0, max: 1000 }),
  landShareNumerator: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
    z.number().int(V.invalidAmount).min(1, V.minValue(1)).optional(),
  ),
  landShareDenominator: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
    z.number().int(V.invalidAmount).min(1, V.minValue(1)).optional(),
  ),
  roomCount: optionalText(10),
  residentCount: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? 0 : Number(value)),
    z.number().int(V.invalidAmount).min(0, V.minValue(0)).max(50, V.maxValue(50)),
  ),
  ownershipType: z.enum(OWNERSHIP_TYPES, { errorMap: () => ({ message: V.invalidSelection }) }),
  duesExempt: checkboxField,
  lateFeeExempt: checkboxField,
  duesMultiplier: decimalField({ min: 0, max: 10 }),
  notes: optionalText(2000),
});

export async function createUnit(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    { permission: "unit:write", schema: unitSchema, meta: { action: "unit_created", resource: "unit" } },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.units");
      const share = resolveLandShare({
        landShare: input.landShare,
        numerator: input.landShareNumerator,
        denominator: input.landShareDenominator,
      });

      const created = await withTenant(
        ctx.tenantId,
        async (tx) => {
          await assertNumberAvailable(tx, input.blockId ?? null, input.number, null, t);
          const [row] = await tx
            .insert(units)
            .values({
              tenantId: ctx.tenantId,
              blockId: input.blockId ?? null,
              number: input.number,
              floor: input.floor,
              type: input.type,
              areaM2: input.areaM2?.toFixed(2) ?? null,
              landShare: share.landShare,
              landShareNumerator: share.numerator,
              landShareDenominator: share.denominator,
              roomCount: input.roomCount ?? null,
              residentCount: input.residentCount,
              ownershipType: input.ownershipType,
              duesExempt: input.duesExempt,
              lateFeeExempt: input.lateFeeExempt,
              duesMultiplier: (input.duesMultiplier ?? 1).toFixed(3),
              notes: input.notes ?? null,
            })
            .returning({ id: units.id });
          await refreshBlockCount(tx, input.blockId ?? null);
          return row;
        },
        { userId: ctx.userId },
      );

      if (!created) throw new ActionError(t("createFailed"));
      setResourceId(created.id);
      revalidatePath("/panel/birimler");

      return okState(t("created", { number: input.number }), {
        redirectTo: `/panel/birimler/${created.id}`,
        data: { id: created.id },
      });
    },
  );
}

export async function updateUnit(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  const schema = unitSchema.extend({ id: uuidField });

  return runAction(
    { permission: "unit:write", schema, meta: { action: "unit_updated", resource: "unit" } },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.units");
      const share = resolveLandShare({
        landShare: input.landShare,
        numerator: input.landShareNumerator,
        denominator: input.landShareDenominator,
      });
      setResourceId(input.id);

      const changes = await withTenant(
        ctx.tenantId,
        async (tx) => {
          const [before] = await tx.select().from(units).where(eq(units.id, input.id)).limit(1);
          if (!before) throw new ActionError(t("notFound"));

          await assertNumberAvailable(tx, input.blockId ?? null, input.number, input.id, t);

          const patch = {
            blockId: input.blockId ?? null,
            number: input.number,
            floor: input.floor,
            type: input.type,
            areaM2: input.areaM2?.toFixed(2) ?? null,
            landShare: share.landShare,
            landShareNumerator: share.numerator,
            landShareDenominator: share.denominator,
            roomCount: input.roomCount ?? null,
            residentCount: input.residentCount,
            ownershipType: input.ownershipType,
            duesExempt: input.duesExempt,
            lateFeeExempt: input.lateFeeExempt,
            duesMultiplier: (input.duesMultiplier ?? 1).toFixed(3),
            notes: input.notes ?? null,
          };

          await tx.update(units).set(patch).where(eq(units.id, input.id));

          // Blok değiştiyse iki bloğun da sayacı tazelenir.
          if (before.blockId !== patch.blockId) {
            await refreshBlockCount(tx, before.blockId);
            await refreshBlockCount(tx, patch.blockId);
          }

          return diffOf(before as unknown as Record<string, unknown>, patch);
        },
        { userId: ctx.userId },
      );

      await audit(ctx, {
        action: "unit_updated",
        resource: "unit",
        resourceId: input.id,
        diff: changes,
      });

      revalidatePath("/panel/birimler");
      revalidatePath(`/panel/birimler/${input.id}`);

      return okState(t("updated", { number: input.number }), {
        redirectTo: `/panel/birimler/${input.id}`,
        data: { id: input.id },
      });
    },
  );
}

/* ------------------------------------------------------------------ *
 * Toplu üretim (blok sihirbazı)
 * ------------------------------------------------------------------ */

const bulkCreateSchema = z.object({
  blockId: optionalUuidField,
  /** Yeni blok adı (blockId boşsa oluşturulur). */
  newBlockName: optionalText(60),
  floorFrom: intField({ min: -5, max: 200 }),
  floorTo: intField({ min: -5, max: 200 }),
  perFloor: intField({ min: 1, max: 40 }),
  /** "{blok}-{no}" gibi kalıp; {kat} ve {no} desteklenir. */
  pattern: requiredText(1, 40),
  /** Numaralandırma katta 1'den mi başlar, kat*100+n mi (301, 302…). */
  numbering: z.enum(["sequential", "floorPrefixed"], {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  type: z.enum(UNIT_TYPES, { errorMap: () => ({ message: V.invalidSelection }) }),
  areaM2: decimalField({ min: 1, max: 100_000 }),
  landShareDenominator: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
    z.number().int(V.invalidAmount).min(1, V.minValue(1)).optional(),
  ),
});

export interface BulkCreateResult {
  created: number;
  skipped: string[];
}

/**
 * Toplu birim üretimi — GAP 4.1.1 ("tüm A blok otomatik").
 *
 * Zaten var olan numaralar **atlanır, hata verilmez**: yönetici sihirbazı
 * ikinci kez çalıştırdığında eksik kalanları tamamlamak isteyebilir. Hangi
 * numaraların atlandığı sonuç mesajında döner, sessizce yutulmaz.
 */
export async function createUnitsBulk(
  _previous: ActionState<BulkCreateResult>,
  formData: FormData,
): Promise<ActionState<BulkCreateResult>> {
  return runAction(
    {
      permission: "unit:write",
      schema: bulkCreateSchema,
      meta: { action: "unit_bulk_created", resource: "unit" },
    },
    formData,
    async ({ ctx, input }) => {
      const t = await getTranslations("app.units");

      if (input.floorTo < input.floorFrom) {
        return errorState(t("floorRangeInvalid"), { floorTo: [t("floorRangeInvalid")] });
      }
      if (!input.blockId && !input.newBlockName) {
        return errorState(t("blockRequired"), { newBlockName: [t("blockRequired")] });
      }

      const floorCount = input.floorTo - input.floorFrom + 1;
      const planned = floorCount * input.perFloor;
      if (planned > 500) {
        return errorState(t("bulkTooMany", { max: 500 }));
      }

      const result = await withTenant(
        ctx.tenantId,
        async (tx) => {
          let blockId = input.blockId ?? null;
          let blockName = "";

          if (blockId) {
            const [existing] = await tx
              .select({ name: blocks.name })
              .from(blocks)
              .where(eq(blocks.id, blockId))
              .limit(1);
            if (!existing) throw new ActionError(t("blockNotFound"));
            blockName = existing.name;
          } else {
            blockName = input.newBlockName!;
            const [createdBlock] = await tx
              .insert(blocks)
              .values({
                tenantId: ctx.tenantId,
                name: blockName,
                floorCount,
                sortOrder: 0,
              })
              .returning({ id: blocks.id });
            blockId = createdBlock?.id ?? null;
          }

          const existingNumbers = new Set(
            (
              await tx
                .select({ number: units.number })
                .from(units)
                .where(
                  blockId === null
                    ? isNull(units.blockId)
                    : eq(units.blockId, blockId),
                )
            ).map((row) => row.number),
          );

          const rows: (typeof units.$inferInsert)[] = [];
          const skipped: string[] = [];
          // Arsa payı paydası verildiyse pay eşit bölünür (yönetici sonra düzeltir).
          const numeratorEach =
            input.landShareDenominator !== undefined
              ? Math.max(1, Math.floor(input.landShareDenominator / planned))
              : undefined;

          for (let floor = input.floorFrom; floor <= input.floorTo; floor += 1) {
            for (let index = 1; index <= input.perFloor; index += 1) {
              const sequence =
                input.numbering === "floorPrefixed"
                  ? `${floor}${String(index).padStart(2, "0")}`
                  : String((floor - input.floorFrom) * input.perFloor + index);
              const number = input.pattern
                .replaceAll("{blok}", blockName)
                .replaceAll("{kat}", String(floor))
                .replaceAll("{no}", sequence)
                .slice(0, 20);

              if (existingNumbers.has(number)) {
                skipped.push(number);
                continue;
              }
              existingNumbers.add(number);
              rows.push({
                tenantId: ctx.tenantId,
                blockId,
                number,
                floor,
                type: input.type,
                areaM2: input.areaM2?.toFixed(2) ?? null,
                landShare:
                  numeratorEach !== undefined && input.landShareDenominator
                    ? (numeratorEach / input.landShareDenominator).toFixed(6)
                    : null,
                landShareNumerator: numeratorEach ?? null,
                landShareDenominator: input.landShareDenominator ?? null,
                ownershipType: "vacant",
              });
            }
          }

          if (rows.length > 0) await tx.insert(units).values(rows);
          await refreshBlockCount(tx, blockId);

          return { created: rows.length, skipped };
        },
        { userId: ctx.userId },
      );

      revalidatePath("/panel/birimler");

      return okState(
        result.skipped.length > 0
          ? t("bulkCreatedWithSkips", {
              created: result.created,
              skipped: result.skipped.length,
            })
          : t("bulkCreated", { created: result.created }),
        { data: result },
      );
    },
  );
}

/* ------------------------------------------------------------------ *
 * Toplu düzenleme / silme
 * ------------------------------------------------------------------ */

export interface BulkResult {
  ok: boolean;
  message: string;
}

/**
 * Toplu soft-delete. Tek transaction; herhangi bir kayıt başka tenant'a aitse
 * (RLS yüzünden hiç görünmez) sayı eksik döner ve kullanıcı bilgilendirilir.
 */
export async function softDeleteUnits(ids: string[]): Promise<BulkResult> {
  const ctx = await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  const affected = await withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .update(units)
        .set({ deletedAt: new Date() })
        .where(and(inArray(units.id, targets), isNull(units.deletedAt)))
        .returning({ id: units.id, blockId: units.blockId });
      const blockIds = [...new Set(rows.map((row) => row.blockId))];
      for (const blockId of blockIds) await refreshBlockCount(tx, blockId);
      return rows.length;
    },
    { userId: ctx.userId },
  );

  await audit(ctx, {
    action: "unit_bulk_deleted",
    resource: "unit",
    reason: `${affected}/${targets.length}`,
  });

  revalidatePath("/panel/birimler");
  return { ok: true, message: t("bulkDeleted", { count: affected }) };
}

/** Çöp kutusundan geri alma — GAP 4.1.1 (30 gün içinde). */
export async function restoreUnits(ids: string[]): Promise<BulkResult> {
  const ctx = await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  const affected = await withTenant(
    ctx.tenantId,
    async (tx) => {
      const rows = await tx
        .update(units)
        .set({ deletedAt: null })
        .where(inArray(units.id, targets))
        .returning({ id: units.id, blockId: units.blockId });
      for (const blockId of [...new Set(rows.map((r) => r.blockId))]) {
        await refreshBlockCount(tx, blockId);
      }
      return rows.length;
    },
    { userId: ctx.userId },
  );

  await audit(ctx, { action: "unit_bulk_restored", resource: "unit", reason: String(affected) });
  revalidatePath("/panel/birimler");
  return { ok: true, message: t("bulkRestored", { count: affected }) };
}

const bulkPatchSchema = z.object({
  ids: z.array(uuidField).min(1, V.required),
  /** Aidat çarpanına oran uygula (örn. 1.10 = %10 zam). */
  multiplierFactor: z.number().min(0.1).max(10).optional(),
  duesExempt: z.boolean().optional(),
  lateFeeExempt: z.boolean().optional(),
  blockId: z.string().uuid().nullable().optional(),
});

/**
 * Toplu alan güncellemesi — GAP 4.1.1 ("tüm birimlere %10 zam").
 *
 * Zam, `duesMultiplier` üzerinden **oransal** uygulanır; tutar doğrudan
 * yazılmaz. Böylece aidat planı değiştiğinde çarpan korunur ve "kime ne kadar
 * zam yapıldı" bilgisi tek yerde kalır.
 */
export async function bulkPatchUnits(
  input: z.input<typeof bulkPatchSchema>,
): Promise<BulkResult> {
  const ctx = await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const parsed = bulkPatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("selectionEmpty") };
  const data = parsed.data;

  const affected = await withTenant(
    ctx.tenantId,
    async (tx) => {
      const patch: Record<string, unknown> = {};
      if (data.duesExempt !== undefined) patch.duesExempt = data.duesExempt;
      if (data.lateFeeExempt !== undefined) patch.lateFeeExempt = data.lateFeeExempt;
      if (data.blockId !== undefined) patch.blockId = data.blockId;
      if (data.multiplierFactor !== undefined) {
        // Çarpan SQL içinde çarpılır: okuma-yazma yarışını önler ve tek turda biter.
        patch.duesMultiplier = sql`LEAST(9.999, GREATEST(0, ${units.duesMultiplier} * ${data.multiplierFactor}))`;
      }
      if (Object.keys(patch).length === 0) return 0;

      const rows = await tx
        .update(units)
        .set(patch)
        .where(and(inArray(units.id, data.ids), isNull(units.deletedAt)))
        .returning({ id: units.id });
      return rows.length;
    },
    { userId: ctx.userId },
  );

  await audit(ctx, {
    action: "unit_bulk_patched",
    resource: "unit",
    reason: JSON.stringify({ count: affected, patch: { ...data, ids: undefined } }),
  });

  revalidatePath("/panel/birimler");
  return { ok: true, message: t("bulkPatched", { count: affected }) };
}

/* ------------------------------------------------------------------ *
 * Blok CRUD
 * ------------------------------------------------------------------ */

const blockSchema = z.object({
  id: optionalUuidField,
  name: requiredText(1, 60),
  floorCount: intField({ min: 1, max: 200 }),
  hasElevator: checkboxField,
  sortOrder: intField({ min: 0, max: 999 }),
});

export async function saveBlock(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    { permission: "unit:write", schema: blockSchema, meta: { action: "block_saved", resource: "block" } },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.units");

      const id = await withTenant(
        ctx.tenantId,
        async (tx) => {
          if (input.id) {
            await tx
              .update(blocks)
              .set({
                name: input.name,
                floorCount: input.floorCount,
                hasElevator: input.hasElevator,
                sortOrder: input.sortOrder,
              })
              .where(eq(blocks.id, input.id));
            return input.id;
          }
          const [row] = await tx
            .insert(blocks)
            .values({
              tenantId: ctx.tenantId,
              name: input.name,
              floorCount: input.floorCount,
              hasElevator: input.hasElevator,
              sortOrder: input.sortOrder,
            })
            .returning({ id: blocks.id });
          return row?.id;
        },
        { userId: ctx.userId },
      );

      if (id) setResourceId(id);
      revalidatePath("/panel/birimler");
      revalidatePath("/panel/birimler/bloklar");
      return okState(t("blockSaved", { name: input.name }));
    },
  );
}

/**
 * Blok silme. İçinde aktif birim varsa **engellenir**: birimleri sahipsiz
 * bırakmak (blockId = null) yöneticinin fark etmediği veri kaybı olurdu.
 */
export async function softDeleteBlock(id: string): Promise<BulkResult> {
  const ctx = await requirePermission("unit:write");
  const t = await getTranslations("app.units");

  const result = await withTenant(
    ctx.tenantId,
    async (tx) => {
      const [unitRow] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(units)
        .where(and(eq(units.blockId, id), isNull(units.deletedAt)));
      if (Number(unitRow?.value ?? 0) > 0) return { blocked: Number(unitRow?.value) };

      await tx.update(blocks).set({ deletedAt: new Date() }).where(eq(blocks.id, id));
      return { blocked: 0 };
    },
    { userId: ctx.userId },
  );

  if (result.blocked > 0) {
    return { ok: false, message: t("blockNotEmpty", { count: result.blocked }) };
  }

  await audit(ctx, { action: "block_deleted", resource: "block", resourceId: id });
  revalidatePath("/panel/birimler");
  return { ok: true, message: t("blockDeleted") };
}

/* ------------------------------------------------------------------ *
 * Yardımcılar
 * ------------------------------------------------------------------ */

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * Aynı blokta aynı numara olamaz. Veritabanında zaten unique index var; buradaki
 * kontrol kullanıcıya alan bazlı anlaşılır hata verebilmek için — yalnız index'e
 * güvenmek "duplicate key value violates constraint" mesajı üretirdi.
 */
async function assertNumberAvailable(
  tx: Tx,
  blockId: string | null,
  number: string,
  excludeId: string | null,
  t: (key: string, values?: Record<string, string | number>) => string,
): Promise<void> {
  const rows = await tx
    .select({ id: units.id })
    .from(units)
    .where(
      and(
        blockId === null ? isNull(units.blockId) : eq(units.blockId, blockId),
        eq(units.number, number),
        isNull(units.deletedAt),
      ),
    );
  const clash = rows.find((row) => row.id !== excludeId);
  if (clash) {
    throw new ActionError(t("numberTaken", { number }), {
      number: [t("numberTaken", { number })],
    });
  }
}

/** `blocks.unit_count` denormalize sayacını tazeler. */
async function refreshBlockCount(tx: Tx, blockId: string | null): Promise<void> {
  if (!blockId) return;
  await tx
    .update(blocks)
    .set({
      unitCount: sql`(SELECT COUNT(*) FROM units u WHERE u.block_id = ${blockId} AND u.deleted_at IS NULL)`,
    })
    .where(eq(blocks.id, blockId));
}
