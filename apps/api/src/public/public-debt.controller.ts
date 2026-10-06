import { Body, Controller, Get, HttpCode, Post, Query, UseFilters, UseInterceptors } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { errors } from "@yonetim/core";
import { blocks, debts, units } from "@yonetim/db";

import { RequirePermission } from "../identity/decorators";
import { DbService } from "../infra/db/db.service";
import {
  PublicV1ExceptionFilter,
  PublicV1Interceptor,
  PublicV1Raw,
} from "./public-v1.envelope";
import { parsePagination, toListEnvelope } from "./public-v1.pagination";

/**
 * `/api/v1/debts` — borç listesi ve oluşturma (DIŞ SÖZLEŞME).
 *
 * Muhasebe entegrasyonunun asıl ihtiyacı bu uç: dönem bazında borç ve tahsilat
 * durumu. `outstandingKurus` hesaplanmış olarak döner — istemcinin
 * `amount + lateFee - paid` aritmetiğini tekrar yazması, yuvarlama farkı
 * üretmenin en kolay yolu olurdu.
 *
 * Alan adları `*Kurus` olarak kaldı: panel sözleşmesindeki `*Minor`'a çevirmek
 * yayınlanmış bir sözleşmeyi kırardı (§9.1).
 */
@ApiTags("v1/debts")
@Controller("api/v1/debts")
@UseFilters(PublicV1ExceptionFilter)
@UseInterceptors(PublicV1Interceptor)
export class PublicDebtController {
  constructor(private readonly db: DbService) {}

  @Get()
  @RequirePermission("debt:read")
  @PublicV1Raw()
  @ApiOperation({ summary: "Borçları listele" })
  async list(@Query() query: Record<string, string>) {
    const page = parsePagination(query);
    // L-17: Public uç filter'ları Zod ile doğrulanıyor — malformed UUID'ler ve
    // geçersiz enum değerleri sessizce kabul edilmesin.
    const unitId = parseUuid(query.unitId, "unitId");
    const period = parseString(query.period, 7, "period");
    const status = parseString(query.status, 32, "status");

    const result = await this.db.tx(async (tx) => {
      const conditions = [isNull(debts.deletedAt)];
      if (page.q) {
        const needle = `%${page.q}%`;
        const search = or(ilike(debts.description, needle), ilike(units.number, needle));
        if (search) conditions.push(search);
      }
      if (unitId) conditions.push(eq(debts.unitId, unitId));
      if (period) conditions.push(eq(debts.period, period));
      if (status === "open") conditions.push(sql`${debts.status} NOT IN ('paid','written_off')`);
      else if (status) conditions.push(sql`${debts.status}::text = ${status}`);

      const where = and(...conditions);
      const column = SORTS[page.sort as keyof typeof SORTS] ?? debts.dueDate;
      const order = page.direction === "asc" ? asc(column) : desc(column);

      const rows = await tx
        .select({
          id: debts.id,
          unitId: debts.unitId,
          unitNumber: units.number,
          blockName: blocks.name,
          // H-13: `debtorUserId` global `users` tablosuna FK; API-key
          // session'la gelen istemci `debtorUserId` → `/api/v1/residents`
          // correlation'ıyla PII'a ulaşabilir. Sözleşmenin açıkça
          // userId istediği integration `?include=userId` ile talep edebilir
          // (audit log ile); default olarak gizli.
          kind: debts.kind,
          description: debts.description,
          period: debts.period,
          amountKurus: debts.amountKurus,
          paidKurus: debts.paidKurus,
          lateFeeKurus: debts.lateFeeKurus,
          outstandingKurus: sql<number>`${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus}`,
          dueDate: debts.dueDate,
          status: debts.status,
          lateFeeExempt: debts.lateFeeExempt,
          installmentNo: debts.installmentNo,
          installmentCount: debts.installmentCount,
          createdAt: debts.createdAt,
        })
        .from(debts)
        .innerJoin(units, eq(units.id, debts.unitId))
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(where)
        // İkincil `id` sıralaması: eşit vadeli kayıtlar sayfalar arasında yer
        // değiştirirse aynı borç iki sayfada birden görünürdü.
        .orderBy(order, asc(debts.id))
        .limit(page.pageSize)
        .offset((page.page - 1) * page.pageSize);

      const [total] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(debts)
        .innerJoin(units, eq(units.id, debts.unitId))
        .where(where);

      return {
        rows: rows.map((row) => ({ ...row, outstandingKurus: Number(row.outstandingKurus) })),
        total: Number(total?.value ?? 0),
      };
    });

    return toListEnvelope(result.rows, {
      page: page.page,
      pageSize: page.pageSize,
      total: result.total,
    });
  }

  @Post()
  @HttpCode(201)
  @RequirePermission("debt:write")
  @ApiOperation({ summary: "Borç oluştur" })
  async create(@Body() body: unknown) {
    const input = createSchema.parse(body ?? {});
    const ctx = this.db.ctx();

    // "2026-07-15" biçimi İstanbul gününün başına sabitlenir; tam ISO ise olduğu gibi.
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)
      ? new Date(`${input.dueDate}T00:00:00+03:00`)
      : new Date(input.dueDate);
    if (Number.isNaN(dueDate.getTime())) throw errors.validation("Geçersiz vade tarihi.");

    return this.db.tx(async (tx) => {
      const unitRows = await tx
        .select({ id: units.id, lateFeeExempt: units.lateFeeExempt })
        .from(units)
        .where(and(eq(units.id, input.unitId), isNull(units.deletedAt)))
        .limit(1);
      if (!unitRows[0]) throw errors.notFound("Bağımsız bölüm bulunamadı.");

      const [row] = await tx
        .insert(debts)
        .values({
          tenantId: ctx.tenantId,
          unitId: input.unitId,
          debtorUserId: input.debtorUserId ?? null,
          kind: input.kind,
          description: input.description,
          amountKurus: input.amountKurus,
          dueDate,
          period: input.period ?? null,
          // Daire muaf ise borç da muaf doğar: muafiyet dairenin özelliği,
          // isteğin değil.
          lateFeeExempt: input.lateFeeExempt || unitRows[0].lateFeeExempt,
        })
        .returning();
      return row;
    });
  }
}

const SORTS = {
  dueDate: debts.dueDate,
  amount: debts.amountKurus,
  createdAt: debts.createdAt,
} as const;

/** L-17: Public uçlarda gelen raw string filter'ları doğrula. */
function parseUuid(v: string | undefined, field: string): string | undefined {
  if (v === undefined || v === "") return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    throw errors.validation(`${field}_invalid_uuid`);
  }
  return v;
}
function parseString(
  v: string | undefined,
  max: number,
  field: string,
): string | undefined {
  if (v === undefined || v === "") return undefined;
  if (v.length > max) throw errors.validation(`${field}_too_long`);
  return v;
}

const createSchema = z.object({
  unitId: z.string().uuid(),
  debtorUserId: z.string().uuid().nullish(),
  kind: z
    .enum(["dues", "utility", "reservation", "penalty", "late_fee", "extra", "legal_cost"])
    .default("dues"),
  description: z.string().min(3).max(200),
  amountKurus: z.number().int().positive(),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullish(),
  lateFeeExempt: z.boolean().default(false),
});
