import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { errors } from "@yonetim/core";
import { blocks, unitOrder, units } from "@yonetim/db";

import { RequirePermission } from "../identity/decorators";
import { assertUnitQuota } from "../property/unit/unit-quota";
import { DbService } from "../infra/db/db.service";
import {
  PublicV1ExceptionFilter,
  PublicV1Interceptor,
  PublicV1Raw,
} from "./public-v1.envelope";
import { parsePagination, toListEnvelope } from "./public-v1.pagination";

/**
 * `/api/v1/units` — DIŞ SÖZLEŞME (GAP 4.8.3, MIMARI-PLAN §9.1).
 *
 * Next'teki route handler'dan **birebir** taşındı: aynı sorgu, aynı alan
 * listesi, aynı doğrulama kuralları, aynı hata metinleri. Değişen tek şey
 * çalıştığı süreç.
 *
 * Neden panel servisleri yeniden kullanılmadı: panel uçları ekran ihtiyacına
 * göre şekilleniyor ve şekilleri **değişebilir** (§9.1). Bu yüzeyin şekli
 * değişemez. İkisini aynı servise bağlamak, bir ekran değişikliğinin dış
 * entegrasyonu kırmasına açık kapı bırakırdı — sözleşmenin donukluğu ancak
 * ayrı bir yüzeyle korunabilir. Paylaşılan şey sorgu değil, veritabanı.
 */
@ApiTags("v1/units")
@Controller("api/v1/units")
@UseFilters(PublicV1ExceptionFilter)
@UseInterceptors(PublicV1Interceptor)
export class PublicUnitController {
  constructor(private readonly db: DbService) {}

  @Get()
  @RequirePermission("unit:read")
  @PublicV1Raw()
  @ApiOperation({ summary: "Bağımsız bölüm listesi (sayfalı)" })
  async list(@Query() query: Record<string, string>) {
    const page = parsePagination(query);
    const blockId = query.blockId;

    const result = await this.db.tx(async (tx) => {
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
        .orderBy(...unitOrder())
        .limit(page.pageSize)
        .offset((page.page - 1) * page.pageSize);

      const [total] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(units)
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(where);

      return { rows, total: Number(total?.value ?? 0) };
    });

    return toListEnvelope(result.rows, {
      page: page.page,
      pageSize: page.pageSize,
      total: result.total,
    });
  }

  @Get(":id")
  @RequirePermission("unit:read")
  async detail(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.db.tx(async (tx) => {
      const rows = await tx
        .select({ unit: units, blockName: blocks.name })
        .from(units)
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(eq(units.id, id))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!row) throw errors.notFound("Bağımsız bölüm bulunamadı.");
    return { ...row.unit, blockName: row.blockName };
  }

  @Post()
  @HttpCode(201)
  @RequirePermission("unit:write")
  @ApiOperation({ summary: "Bağımsız bölüm oluştur" })
  async create(@Body() body: unknown) {
    const input = createSchema.parse(body ?? {});
    const ctx = this.db.ctx();

    const landShare =
      input.landShareNumerator && input.landShareDenominator
        ? (input.landShareNumerator / input.landShareDenominator).toFixed(6)
        : null;

    const created = await this.db.tx(async (tx) => {
      // Aynı blokta aynı numara olamaz — DB index'i de garanti ediyor;
      // buradaki kontrol anlaşılır bir 409 dönebilmek için.
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
      await assertUnitQuota(tx, ctx.tenantId, 1);

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
    });

    // Durum kodu da sözleşmenin parçası: `@HttpCode(201)` yukarıda.
    // Gövde zarfı interceptor'dan geliyor.
    return created;
  }

  @Patch(":id")
  @RequirePermission("unit:write")
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = patchSchema.parse(body ?? {});

    return this.db.tx(async (tx) => {
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
        patch.landShare = numerator && denominator ? (numerator / denominator).toFixed(6) : null;
      }

      const [row] = await tx.update(units).set(patch).where(eq(units.id, id)).returning();
      return row;
    });
  }

  @Delete(":id")
  @RequirePermission("unit:write")
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    const deleted = await this.db.tx(async (tx) => {
      const rows = await tx
        .update(units)
        .set({ deletedAt: new Date() })
        .where(and(eq(units.id, id), isNull(units.deletedAt)))
        .returning({ id: units.id, deletedAt: units.deletedAt });
      return rows[0] ?? null;
    });

    if (!deleted) {
      throw errors.notFound("Bağımsız bölüm bulunamadı veya zaten silinmiş.");
    }
    return { id: deleted.id, deletedAt: deleted.deletedAt, softDeleted: true };
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

const patchSchema = z
  .object({
    number: z.string().min(1).max(20).optional(),
    blockId: z.string().uuid().nullish(),
    floor: z.number().int().min(-10).max(200).optional(),
    type: z
      .enum(["flat", "shop", "office", "depot", "garage", "villa", "common_area"])
      .optional(),
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
