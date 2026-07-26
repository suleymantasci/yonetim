import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { errors } from "@yonetim/core";
import { blocks, units, withTenant } from "@yonetim/db";

import { apiError, apiOk, authenticateApi, parseJsonBody } from "@/lib/api";

/**
 * `/api/v1/units/[id]` — detay, güncelleme, soft-delete.
 *
 * DELETE **kalıcı silmez**: `deleted_at` işaretler. Dış entegrasyonun kalıcı
 * veri kaybına yol açabilmesi kabul edilemez; geri alma yolu her zaman açık
 * kalır (SPEC 11.2).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticateApi(request, "unit:read");
    const { id } = await params;

    const row = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx
        .select({
          unit: units,
          blockName: blocks.name,
        })
        .from(units)
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(eq(units.id, id))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!row) throw errors.notFound("Bağımsız bölüm bulunamadı.");
    return apiOk({ ...row.unit, blockName: row.blockName });
  } catch (error) {
    return apiError(error);
  }
}

const patchSchema = z
  .object({
    number: z.string().min(1).max(20).optional(),
    blockId: z.string().uuid().nullish(),
    floor: z.number().int().min(-10).max(200).optional(),
    type: z.enum(["flat", "shop", "office", "depot", "garage", "villa", "common_area"]).optional(),
    areaM2: z.number().positive().max(100_000).nullish(),
    landShareNumerator: z.number().int().positive().nullish(),
    landShareDenominator: z.number().int().positive().nullish(),
    roomCount: z.string().max(10).nullish(),
    residentCount: z.number().int().min(0).max(50).optional(),
    ownershipType: z.enum(["owner", "tenant", "vacant"]).optional(),
    duesExempt: z.boolean().optional(),
    lateFeeExempt: z.boolean().optional(),
    duesMultiplier: z.number().min(0).max(10).optional(),
    notes: z.string().max(2000).nullish(),
  })
  // Boş gövde ile PATCH, sessizce hiçbir şey yapmak yerine hata verir:
  // çağıran taraf bir şeyi yanlış gönderdiğini anlamalı.
  .refine((data) => Object.keys(data).length > 0, {
    message: "Güncellenecek en az bir alan gönderilmeli.",
  });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticateApi(request, "unit:write");
    const { id } = await params;
    const input = await parseJsonBody(request, patchSchema);

    const updated = await withTenant(
      ctx.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(units)
          .where(and(eq(units.id, id), isNull(units.deletedAt)))
          .limit(1);
        if (!existing) throw errors.notFound("Bağımsız bölüm bulunamadı.");

        const patch: Record<string, unknown> = {};
        if (input.number !== undefined) patch.number = input.number;
        if (input.blockId !== undefined) patch.blockId = input.blockId ?? null;
        if (input.floor !== undefined) patch.floor = input.floor;
        if (input.type !== undefined) patch.type = input.type;
        if (input.areaM2 !== undefined) patch.areaM2 = input.areaM2?.toFixed(2) ?? null;
        if (input.roomCount !== undefined) patch.roomCount = input.roomCount ?? null;
        if (input.residentCount !== undefined) patch.residentCount = input.residentCount;
        if (input.ownershipType !== undefined) patch.ownershipType = input.ownershipType;
        if (input.duesExempt !== undefined) patch.duesExempt = input.duesExempt;
        if (input.lateFeeExempt !== undefined) patch.lateFeeExempt = input.lateFeeExempt;
        if (input.duesMultiplier !== undefined) {
          patch.duesMultiplier = input.duesMultiplier.toFixed(3);
        }
        if (input.notes !== undefined) patch.notes = input.notes ?? null;

        // Kesir gönderildiyse ondalık arsa payı yeniden türetilir.
        if (input.landShareNumerator !== undefined || input.landShareDenominator !== undefined) {
          const numerator = input.landShareNumerator ?? existing.landShareNumerator;
          const denominator = input.landShareDenominator ?? existing.landShareDenominator;
          patch.landShareNumerator = numerator ?? null;
          patch.landShareDenominator = denominator ?? null;
          patch.landShare =
            numerator && denominator ? (numerator / denominator).toFixed(6) : null;
        }

        const [row] = await tx.update(units).set(patch).where(eq(units.id, id)).returning();
        return row;
      },
      { userId: ctx.userId },
    );

    return apiOk(updated);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticateApi(request, "unit:write");
    const { id } = await params;

    const deleted = await withTenant(
      ctx.tenantId,
      async (tx) => {
        const rows = await tx
          .update(units)
          .set({ deletedAt: new Date() })
          .where(and(eq(units.id, id), isNull(units.deletedAt)))
          .returning({ id: units.id, deletedAt: units.deletedAt });
        return rows[0] ?? null;
      },
      { userId: ctx.userId },
    );

    if (!deleted) throw errors.notFound("Bağımsız bölüm bulunamadı veya zaten silinmiş.");
    return apiOk({ id: deleted.id, deletedAt: deleted.deletedAt, softDeleted: true });
  } catch (error) {
    return apiError(error);
  }
}
