import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { errors } from "@yonetim/core";
import { blocks, units, withTenant } from "@yonetim/db";

import {
  apiError, apiList, apiOk, authenticateApi, parseJsonBody, parsePagination,
} from "@/lib/api";

/**
 * `/api/v1/units` — GAP 4.8.3.
 *
 * GET  : sayfalı liste (arama, blok filtresi)
 * POST : yeni bağımsız bölüm
 *
 * Panel ekranları bu ucu kullanmaz (Server Action kullanır); burası dış
 * entegrasyonlar içindir. Sorgular yine `withTenant` üzerinden geçer, yani
 * RLS koruması aynen devrede — API anahtarı tenant sınırını aşamaz.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await authenticateApi(request, "unit:read");
    const url = new URL(request.url);
    const page = parsePagination(url);
    const blockId = url.searchParams.get("blockId");

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const conditions = [isNull(units.deletedAt)];
      if (page.q) {
        const needle = `%${page.q}%`;
        const search = or(ilike(units.number, needle), ilike(blocks.name, needle));
        if (search) conditions.push(search);
      }
      if (blockId) conditions.push(eq(units.blockId, blockId));

      const where = and(...conditions);

      const rows = await tx
        .select({
          id: units.id,
          number: units.number,
          blockId: units.blockId,
          blockName: blocks.name,
          floor: units.floor,
          type: units.type,
          areaM2: units.areaM2,
          landShare: units.landShare,
          landShareNumerator: units.landShareNumerator,
          landShareDenominator: units.landShareDenominator,
          roomCount: units.roomCount,
          residentCount: units.residentCount,
          ownershipType: units.ownershipType,
          duesExempt: units.duesExempt,
          lateFeeExempt: units.lateFeeExempt,
          duesMultiplier: units.duesMultiplier,
          createdAt: units.createdAt,
          updatedAt: units.updatedAt,
        })
        .from(units)
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(where)
        .orderBy(asc(units.number))
        .limit(page.pageSize)
        .offset((page.page - 1) * page.pageSize);

      const [total] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(units)
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(where);

      return { rows, total: Number(total?.value ?? 0) };
    });

    return apiList(result.rows, {
      page: page.page,
      pageSize: page.pageSize,
      total: result.total,
    });
  } catch (error) {
    return apiError(error);
  }
}

const createSchema = z.object({
  number: z.string().min(1).max(20),
  blockId: z.string().uuid().nullish(),
  floor: z.number().int().min(-10).max(200).default(0),
  type: z
    .enum(["flat", "shop", "office", "depot", "garage", "villa", "common_area"])
    .default("flat"),
  areaM2: z.number().positive().max(100_000).nullish(),
  landShareNumerator: z.number().int().positive().nullish(),
  landShareDenominator: z.number().int().positive().nullish(),
  roomCount: z.string().max(10).nullish(),
  residentCount: z.number().int().min(0).max(50).default(0),
  ownershipType: z.enum(["owner", "tenant", "vacant"]).default("vacant"),
  duesExempt: z.boolean().default(false),
  lateFeeExempt: z.boolean().default(false),
  duesMultiplier: z.number().min(0).max(10).default(1),
  notes: z.string().max(2000).nullish(),
});

export async function POST(request: Request) {
  try {
    const ctx = await authenticateApi(request, "unit:write");
    const input = await parseJsonBody(request, createSchema);

    const landShare =
      input.landShareNumerator && input.landShareDenominator
        ? (input.landShareNumerator / input.landShareDenominator).toFixed(6)
        : null;

    const created = await withTenant(
      ctx.tenantId,
      async (tx) => {
        // Aynı blokta aynı numara olamaz — DB index'i de garanti eder, buradaki
        // kontrol anlaşılır 409 dönebilmek için.
        const clash = await tx
          .select({ id: units.id })
          .from(units)
          .where(
            and(
              input.blockId ? eq(units.blockId, input.blockId) : isNull(units.blockId),
              eq(units.number, input.number),
              isNull(units.deletedAt),
            ),
          )
          .limit(1);
        if (clash[0]) {
          throw errors.conflict(`${input.number} numarası bu blokta zaten kullanılıyor.`);
        }

        const [row] = await tx
          .insert(units)
          .values({
            tenantId: ctx.tenantId,
            number: input.number,
            blockId: input.blockId ?? null,
            floor: input.floor,
            type: input.type,
            areaM2: input.areaM2?.toFixed(2) ?? null,
            landShare,
            landShareNumerator: input.landShareNumerator ?? null,
            landShareDenominator: input.landShareDenominator ?? null,
            roomCount: input.roomCount ?? null,
            residentCount: input.residentCount,
            ownershipType: input.ownershipType,
            duesExempt: input.duesExempt,
            lateFeeExempt: input.lateFeeExempt,
            duesMultiplier: input.duesMultiplier.toFixed(3),
            notes: input.notes ?? null,
          })
          .returning();
        return row;
      },
      { userId: ctx.userId },
    );

    return apiOk(created, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
