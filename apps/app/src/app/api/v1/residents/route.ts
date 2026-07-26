import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { maskPhone } from "@yonetim/core";
import {
  blocks, memberships, unitOccupancies, units, users, withBypassRls, withTenant,
} from "@yonetim/db";

import { apiError, apiList, authenticateApi, parsePagination } from "@/lib/api";

/**
 * `/api/v1/residents` — sakin listesi (salt okunur).
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
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await authenticateApi(request, "resident:read");
    const url = new URL(request.url);
    const page = parsePagination(url);
    const unitId = url.searchParams.get("unitId");

    const scoped = await withTenant(ctx.tenantId, async (tx) => {
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
      return apiList([], { page: page.page, pageSize: page.pageSize, total: 0 });
    }

    const people = await withBypassRls("api:residents-list", async (tx) =>
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

    return apiList(rows, {
      page: page.page,
      pageSize: page.pageSize,
      total: filtered.length,
    });
  } catch (error) {
    return apiError(error);
  }
}
