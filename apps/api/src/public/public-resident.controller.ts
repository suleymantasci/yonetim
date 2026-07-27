import { Controller, Get, Query, UseFilters, UseInterceptors } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { maskPhone } from "@yonetim/core";
import { blocks, memberships, unitOccupancies, units, users } from "@yonetim/db";

import { RequirePermission } from "../identity/decorators";
import { DbService } from "../infra/db/db.service";
import {
  PublicV1ExceptionFilter,
  PublicV1Interceptor,
  PublicV1Raw,
} from "./public-v1.envelope";
import { parsePagination, toListEnvelope } from "./public-v1.pagination";

/**
 * `/api/v1/residents` — sakin listesi (salt okunur, DIŞ SÖZLEŞME).
 *
 * YAZMA UCU BİLİNÇLİ OLARAK YOK. Sakin kaydı açmak KVKK aydınlatma onayı
 * gerektiriyor (md.10) ve o onayın kime, ne zaman, hangi metin sürümüyle
 * verildiği kayda geçmeli. Bir API anahtarının "onay alındı" demesi bu
 * yükümlülüğü karşılamıyor — kayıt panelden, insan onayıyla açılır.
 *
 * KVKK VERİ MİNİMİZASYONU: telefon **maskeli** döner, TCKN hiç dönmez.
 * Muhasebe entegrasyonunun ihtiyacı kimlik eşleştirmesi, ham iletişim
 * bilgisi değil. Ham telefona ihtiyaç duyan bir kullanım çıkarsa ayrı bir
 * scope ve ayrı bir uç ile, gerekçesi kayıtlı biçimde açılmalı.
 */
@ApiTags("v1/residents")
@Controller("api/v1/residents")
@UseFilters(PublicV1ExceptionFilter)
@UseInterceptors(PublicV1Interceptor)
export class PublicResidentController {
  constructor(private readonly db: DbService) {}

  @Get()
  @RequirePermission("resident:read")
  @PublicV1Raw()
  @ApiOperation({ summary: "Sakinleri listele (salt okunur)" })
  async list(@Query() query: Record<string, string>) {
    const page = parsePagination(query);
    const unitId = query.unitId;

    const scoped = await this.db.tx(async (tx) => {
      const memberRows = await tx
        .select({ userId: memberships.userId, role: memberships.role })
        .from(memberships)
        .where(isNull(memberships.deletedAt));

      const occupancyConditions = [isNull(unitOccupancies.endDate), isNull(units.deletedAt)];
      if (unitId) occupancyConditions.push(eq(unitOccupancies.unitId, unitId));

      const occupancyRows = await tx
        .select({
          userId: unitOccupancies.userId,
          unitId: unitOccupancies.unitId,
          unitNumber: units.number,
          blockName: blocks.name,
          relation: unitOccupancies.relation,
          ownershipPct: unitOccupancies.ownershipPct,
        })
        .from(unitOccupancies)
        .innerJoin(units, eq(units.id, unitOccupancies.unitId))
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(and(...occupancyConditions));

      return { memberRows, occupancyRows };
    });

    // Birim filtresi verildiyse yalnız o birimdeki kişiler.
    const candidateIds = unitId
      ? [...new Set(scoped.occupancyRows.map((row) => row.userId))]
      : [...new Set(scoped.memberRows.map((row) => row.userId))];

    if (candidateIds.length === 0) {
      return toListEnvelope([], { page: page.page, pageSize: page.pageSize, total: 0 });
    }

    // `users` global tablo (tenant sütunu yok); erişim yukarıdaki tenant
    // kapsamlı sorgudan çıkan kimlik listesiyle sınırlanıyor.
    const people = await this.db.bypass("api:residents-list", async (tx) =>
      tx
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          email: users.email,
          whatsappOptIn: users.whatsappOptIn,
          locale: users.locale,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(and(inArray(users.id, candidateIds), isNull(users.deletedAt)))
        .orderBy(asc(users.firstName), asc(users.lastName)),
    );

    const needle = page.q?.toLocaleLowerCase("tr");
    const filtered = people.filter((person) => {
      if (!needle) return true;
      return [person.firstName, person.lastName, person.email]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr")
        .includes(needle);
    });

    const rows = filtered
      .slice((page.page - 1) * page.pageSize, page.page * page.pageSize)
      .map((person) => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        // KVKK: ham telefon API üzerinden dışarı çıkmaz.
        phoneMasked: person.phone ? maskPhone(person.phone) : null,
        email: person.email,
        locale: person.locale,
        whatsappOptIn: person.whatsappOptIn,
        roles: scoped.memberRows
          .filter((row) => row.userId === person.id)
          .map((row) => row.role),
        units: scoped.occupancyRows
          .filter((row) => row.userId === person.id)
          .map((row) => ({
            unitId: row.unitId,
            unitNumber: row.unitNumber,
            blockName: row.blockName,
            relation: row.relation,
            ownershipPct: Number(row.ownershipPct),
          })),
        createdAt: person.createdAt,
      }));

    return toListEnvelope(rows, {
      page: page.page,
      pageSize: page.pageSize,
      total: filtered.length,
    });
  }
}
