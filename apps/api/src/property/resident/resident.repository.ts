import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";

import { HEALTH_CONSENT_KIND } from "@yonetim/contracts";
import type { ResidentListQuery } from "@yonetim/contracts";
import {
  blocks,
  consents,
  debts,
  memberships,
  payments,
  unitOccupancies,
  units,
  users,
} from "@yonetim/db";

import { DbService } from "../../infra/db/db.service";

/**
 * Sakin okuma sorguları — MIMARI-PLAN §8.5. SQL yalnız burada.
 *
 * MİMARİ ZORLUK — İKİ AŞAMALI SORGU: kişi verisi `users` tablosunda ve bu
 * tablo RLS kapsamı **dışında** (kişi platform genelinde tekil, tenant'a ait
 * değil). İlişki verisi (`memberships`, `unit_occupancies`) ise tenant
 * kapsamında. Bu yüzden her okuma iki adımlı:
 *
 *   1. tenant kapsamında (`tx`) → bu sitedeki **kimlik listesi**
 *   2. yalnız o kimlikler için dar kapsamlı baypas (`bypass`) → kişi bilgisi
 *
 * Baypas hiçbir zaman "tüm kullanıcıları getir" biçiminde kullanılmıyor:
 * `inArray(users.id, …)` her zaman 1. adımın ürettiği kümeyle sınırlı.
 * GAP 4.2.7'nin işaret ettiği sorun tam buydu.
 */
@Injectable()
export class ResidentRepository {
  constructor(private readonly db: DbService) {}

  /**
   * Liste.
   *
   * Sayfalama neden bellekte: sıralama ölçütleri (ad, birim numarası) RLS
   * dışındaki `users` tablosunda ya da çoklu ilişkinin **ilk** öğesinde;
   * arama da ad/telefon/e-posta/birim numarası üzerinde birleşik. Tek SQL'e
   * indirmek iki kapsamı tek sorguda birleştirmeyi, yani baypas kapsamını
   * genişletmeyi gerektirirdi. Bir sitedeki kişi sayısı (yüzler mertebesi)
   * bu bedeli taşıyor; kapsamı genişletmek taşımazdı.
   */
  async list(q: ResidentListQuery) {
    const scoped = await this.db.tx(async (tx) => {
      const conditions: SQL[] = [isNull(memberships.deletedAt)];
      if (q.role) conditions.push(sql`${memberships.role}::text = ${q.role}`);

      const [memberRows, occupancyRows, balanceRows, blockRows] =
        await Promise.all([
          tx
            .select({ userId: memberships.userId, role: memberships.role })
            .from(memberships)
            .where(and(...conditions)),

          tx
            .select({
              userId: unitOccupancies.userId,
              unitId: unitOccupancies.unitId,
              unitNumber: units.number,
              blockId: units.blockId,
              blockName: blocks.name,
              relation: unitOccupancies.relation,
            })
            .from(unitOccupancies)
            .innerJoin(units, eq(units.id, unitOccupancies.unitId))
            .leftJoin(blocks, eq(blocks.id, units.blockId))
            .where(
              and(isNull(unitOccupancies.endDate), isNull(units.deletedAt)),
            ),

          tx
            .select({
              userId: debts.debtorUserId,
              outstanding: sql<number>`COALESCE(SUM(${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus}), 0)`,
              overdue: sql<number>`COALESCE(SUM(CASE WHEN ${debts.dueDate} < now()
              THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
            })
            .from(debts)
            .where(and(isNull(debts.deletedAt), sql`${debts.status} <> 'paid'`))
            .groupBy(debts.debtorUserId),

          tx
            .select({ id: blocks.id, name: blocks.name })
            .from(blocks)
            .where(isNull(blocks.deletedAt))
            .orderBy(asc(blocks.sortOrder), asc(blocks.name)),
        ]);

      return { memberRows, occupancyRows, balanceRows, blockRows };
    });

    const rolesByUser = new Map<string, string[]>();
    for (const row of scoped.memberRows) {
      const list = rolesByUser.get(row.userId) ?? [];
      list.push(row.role);
      rolesByUser.set(row.userId, list);
    }

    type Brief = {
      unitId: string;
      unitNumber: string;
      blockName: string | null;
      relation: string;
    };
    const occupanciesByUser = new Map<string, Brief[]>();
    for (const row of scoped.occupancyRows) {
      const list = occupanciesByUser.get(row.userId) ?? [];
      list.push({
        unitId: row.unitId,
        unitNumber: row.unitNumber,
        blockName: row.blockName,
        relation: row.relation,
      });
      occupanciesByUser.set(row.userId, list);
    }

    const balances = new Map(
      scoped.balanceRows
        .filter(
          (row): row is typeof row & { userId: string } => row.userId !== null,
        )
        .map((row) => [
          row.userId,
          {
            outstanding: Number(row.outstanding),
            overdue: Number(row.overdue),
          },
        ]),
    );

    let candidateIds = [...rolesByUser.keys()];
    if (q.blockId) {
      // Blok filtresi: kişinin **en az bir** ilişkisi o blokta olmalı.
      const inBlock = new Set(
        scoped.occupancyRows
          .filter((row) => row.blockId === q.blockId)
          .map((row) => row.userId),
      );
      candidateIds = candidateIds.filter((id) => inBlock.has(id));
    }
    if (q.status === "inDebt") {
      candidateIds = candidateIds.filter(
        (id) => (balances.get(id)?.outstanding ?? 0) > 0,
      );
    }
    if (q.status === "multiUnit") {
      candidateIds = candidateIds.filter(
        (id) => (occupanciesByUser.get(id)?.length ?? 0) > 1,
      );
    }

    const emptyTotals = {
      activeCount: 0,
      ownerCount: 0,
      tenantCount: 0,
      optInCount: 0,
    };
    if (candidateIds.length === 0) {
      return {
        rows: [],
        total: 0,
        blocks: scoped.blockRows,
        totals: emptyTotals,
      };
    }

    const people = await this.db.bypass(
      "residents:list-by-membership",
      async (tx) =>
        tx
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            email: users.email,
            whatsappOptIn: users.whatsappOptIn,
            tcknIndex: users.tcknIndex,
          })
          .from(users)
          .where(and(inArray(users.id, candidateIds), isNull(users.deletedAt))),
    );

    const needle = q.search.toLocaleLowerCase("tr");
    let rows = people
      .map((person) => {
        const balance = balances.get(person.id);
        return {
          userId: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          phone: person.phone,
          email: person.email,
          whatsappOptIn: person.whatsappOptIn,
          hasTckn: person.tcknIndex !== null,
          roles: rolesByUser.get(person.id) ?? [],
          occupancies: occupanciesByUser.get(person.id) ?? [],
          outstandingMinor: balance?.outstanding ?? 0,
          overdueMinor: balance?.overdue ?? 0,
        };
      })
      .filter((row) => {
        if (!needle) return true;
        const haystack = [
          row.firstName,
          row.lastName,
          row.phone,
          row.email,
          ...row.occupancies.map((o) => o.unitNumber),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr");
        return haystack.includes(needle);
      });

    rows.sort((a, b) => {
      if (q.sort === "outstanding")
        return b.outstandingMinor - a.outstandingMinor;
      if (q.sort === "unit") {
        // Blok önce, sonra daire: "A Blok 1, 2 … B Blok 1, 2". Blok atlanırsa
        // iki bloğun 1 numaralı daireleri yan yana gelir ve liste okunmaz olur.
        // `numeric: true` daire numarasını doğal sıraya sokuyor (`2` < `10`).
        const first = a.occupancies[0];
        const second = b.occupancies[0];
        const byBlock = (first?.blockName ?? "").localeCompare(
          second?.blockName ?? "",
          "tr",
        );
        if (byBlock !== 0) return byBlock;
        return (first?.unitNumber ?? "").localeCompare(
          second?.unitNumber ?? "",
          "tr",
          { numeric: true },
        );
      }
      return `${a.firstName ?? ""} ${a.lastName ?? ""}`.localeCompare(
        `${b.firstName ?? ""} ${b.lastName ?? ""}`,
        "tr",
      );
    });
    if (q.dir === "desc") rows.reverse();

    const total = rows.length;
    const start = (q.page - 1) * q.perPage;
    rows = rows.slice(start, start + q.perPage);

    return {
      rows,
      total,
      blocks: scoped.blockRows,
      totals: {
        activeCount: candidateIds.length,
        ownerCount: scoped.occupancyRows.filter(
          (row) => row.relation === "owner",
        ).length,
        tenantCount: scoped.occupancyRows.filter(
          (row) => row.relation === "tenant",
        ).length,
        optInCount: people.filter((person) => person.whatsappOptIn).length,
      },
    };
  }

  /**
   * Detay. Üyelik yoksa `null` → 404.
   *
   * Bu, `users` RLS dışında olduğu için **yatay yetki sınırıdır**: başka bir
   * sitenin sakinini id'yle çağırmak buradan geçmez.
   */
  async detail(userId: string) {
    const scoped = await this.db.tx(async (tx) => {
      const memberRows = await tx
        .select({ role: memberships.role, notes: memberships.notes })
        .from(memberships)
        .where(
          and(eq(memberships.userId, userId), isNull(memberships.deletedAt)),
        );
      if (memberRows.length === 0) return null;

      const [occupancyRows, balanceRows, paidRows, debtRows, paymentRows] =
        await Promise.all([
          tx
            .select({
              occupancyId: unitOccupancies.id,
              unitId: unitOccupancies.unitId,
              unitNumber: units.number,
              blockName: blocks.name,
              relation: unitOccupancies.relation,
              ownershipPct: unitOccupancies.ownershipPct,
              startDate: unitOccupancies.startDate,
              endDate: unitOccupancies.endDate,
              debtTransferPolicy: unitOccupancies.debtTransferPolicy,
              contractUrl: unitOccupancies.contractUrl,
            })
            .from(unitOccupancies)
            .innerJoin(units, eq(units.id, unitOccupancies.unitId))
            .leftJoin(blocks, eq(blocks.id, units.blockId))
            .where(eq(unitOccupancies.userId, userId))
            .orderBy(desc(unitOccupancies.startDate)),

          tx
            .select({
              outstanding: sql<number>`COALESCE(SUM(CASE WHEN ${debts.status} <> 'paid'
              THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
              overdue: sql<number>`COALESCE(SUM(CASE WHEN ${debts.status} <> 'paid' AND ${debts.dueDate} < now()
              THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
            })
            .from(debts)
            .where(
              and(eq(debts.debtorUserId, userId), isNull(debts.deletedAt)),
            ),

          tx
            .select({
              total: sql<number>`COALESCE(SUM(${payments.amountKurus}), 0)`,
            })
            .from(payments)
            .where(
              and(
                eq(payments.payerUserId, userId),
                eq(payments.status, "completed"),
              ),
            ),

          tx
            .select({
              id: debts.id,
              // `unitId` de dönüyor: sakin ekranından tahsilat girilebilmesi
              // için borcun hangi birime ait olduğu gerekiyor ve daire
              // **numarası** birim kimliği değil (aynı numara başka blokta
              // tekrar edebilir).
              unitId: debts.unitId,
              unitNumber: units.number,
              description: debts.description,
              period: debts.period,
              amountMinor: debts.amountKurus,
              paidMinor: debts.paidKurus,
              lateFeeMinor: debts.lateFeeKurus,
              dueDate: debts.dueDate,
              status: debts.status,
            })
            .from(debts)
            .innerJoin(units, eq(units.id, debts.unitId))
            .where(and(eq(debts.debtorUserId, userId), isNull(debts.deletedAt)))
            .orderBy(desc(debts.dueDate))
            .limit(50),

          tx
            .select({
              id: payments.id,
              amountMinor: payments.amountKurus,
              method: payments.method,
              status: payments.status,
              paidAt: payments.paidAt,
              receiptNo: payments.receiptNo,
              debtorUserId: payments.debtorUserId,
            })
            .from(payments)
            .where(eq(payments.payerUserId, userId))
            .orderBy(desc(payments.createdAt))
            .limit(50),
        ]);

      return {
        memberRows,
        occupancyRows,
        balanceRow: balanceRows[0],
        paidRow: paidRows[0],
        debtRows,
        paymentRows,
      };
    });

    if (!scoped) return null;

    const person = await this.db.bypass("residents:detail", async (tx) => {
      const rows = await tx
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          email: users.email,
          locale: users.locale,
          whatsappOptIn: users.whatsappOptIn,
          whatsappOptInAt: users.whatsappOptInAt,
          tcknEncrypted: users.tcknEncrypted,
          emergencyContactName: users.emergencyContactName,
          emergencyContactPhone: users.emergencyContactPhone,
          bloodType: users.bloodType,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return rows[0] ?? null;
    });
    if (!person) return null;

    const tenantId = this.db.ctx().tenantId;
    const consentRows = await this.db.bypass("residents:consents", async (tx) =>
      tx
        .select({
          kind: consents.kind,
          granted: consents.granted,
          documentVersion: consents.documentVersion,
          grantedAt: consents.grantedAt,
          revokedAt: consents.revokedAt,
          createdAt: consents.createdAt,
        })
        .from(consents)
        .where(
          and(eq(consents.userId, userId), eq(consents.tenantId, tenantId)),
        )
        .orderBy(desc(consents.createdAt))
        .limit(20),
    );

    // Ödeme başkası adına yapıldıysa borçlunun adını göstermek için.
    const otherDebtorIds = [
      ...new Set(
        scoped.paymentRows
          .map((row) => row.debtorUserId)
          .filter((id): id is string => id !== null && id !== userId),
      ),
    ];
    const otherDebtors =
      otherDebtorIds.length > 0
        ? await this.db.bypass("residents:payment-debtors", async (tx) =>
            tx
              .select({
                id: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
              })
              .from(users)
              .where(inArray(users.id, otherDebtorIds)),
          )
        : [];

    return { scoped, person, consentRows, otherDebtors };
  }

  /**
   * Düzenleme formunun ön dolgusu — ham telefon dahil.
   *
   * Üyelik kontrolü burada da yapılıyor (`users` RLS dışında): başka sitenin
   * sakininin ham numarası bu uçtan çıkamaz.
   */
  async editForm(userId: string) {
    const member = await this.db.tx(async (tx) => {
      const rows = await tx
        .select({ role: memberships.role, notes: memberships.notes })
        .from(memberships)
        .where(
          and(eq(memberships.userId, userId), isNull(memberships.deletedAt)),
        )
        .limit(1);
      return rows[0] ?? null;
    });
    if (!member) return null;

    return this.db.bypass("residents:edit-form", async (tx) => {
      const rows = await tx
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          email: users.email,
          locale: users.locale,
          whatsappOptIn: users.whatsappOptIn,
          emergencyContactName: users.emergencyContactName,
          emergencyContactPhone: users.emergencyContactPhone,
          bloodType: users.bloodType,
          tcknIndex: users.tcknIndex,
        })
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1);
      const person = rows[0];
      if (!person) return null;

      // Geçerli sağlık rızası: `granted` olan **en son** satır. `consents`
      // append-only olduğu için "verildi → geri çekildi → tekrar verildi"
      // dizisinde yalnız sonuncusu bağlayıcı; `granted = true` var mı diye
      // bakmak geri çekilmiş bir rızayı geçerli sayardı.
      const [latestConsent] = await tx
        .select({ granted: consents.granted })
        .from(consents)
        .where(
          and(
            eq(consents.userId, userId),
            eq(consents.kind, HEALTH_CONSENT_KIND),
          ),
        )
        .orderBy(desc(consents.createdAt))
        .limit(1);

      return {
        person,
        member,
        hasHealthConsent: latestConsent?.granted === true,
      };
    });
  }

  /**
   * Acil durum raporu — GAP 4.1.2.
   *
   * Telefon **maskesiz** dönüyor (uç notu: `emergencyContactRow`), bu yüzden
   * kapsam üyeliklerle sıkı sınırlı: önce bu sitenin üye kimlikleri tenant
   * içinden çıkarılıyor, sonra yalnız o kimlikler için bypass yapılıyor —
   * `withBypassRls` daraltma kararının (PROJE-DURUMU §3) aynı deseni.
   */
  async emergencyContacts() {
    const scoped = await this.db.tx(async (tx) => {
      const memberRows = await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(isNull(memberships.deletedAt));

      // Daire etiketleri tenant içinden geliyor; bypass'a hiç gerek yok.
      const occupancyRows = await tx
        .select({
          userId: unitOccupancies.userId,
          number: units.number,
          blockName: blocks.name,
        })
        .from(unitOccupancies)
        .innerJoin(units, eq(units.id, unitOccupancies.unitId))
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(isNull(unitOccupancies.endDate));

      return { memberRows, occupancyRows };
    });

    const ids = [...new Set(scoped.memberRows.map((row) => row.userId))];
    if (ids.length === 0) return [];

    const people = await this.db.bypass("residents:emergency", async (tx) =>
      tx
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          bloodType: users.bloodType,
          emergencyContactName: users.emergencyContactName,
          emergencyContactPhone: users.emergencyContactPhone,
        })
        .from(users)
        .where(and(inArray(users.id, ids), isNull(users.deletedAt)))
        .orderBy(asc(users.firstName), asc(users.lastName)),
    );

    const unitsByUser = new Map<string, string[]>();
    for (const row of scoped.occupancyRows) {
      const label = row.blockName
        ? `${row.blockName}/${row.number}`
        : row.number;
      const existing = unitsByUser.get(row.userId);
      if (existing) existing.push(label);
      else unitsByUser.set(row.userId, [label]);
    }

    return people.map((person) => ({
      userId: person.id,
      fullName:
        [person.firstName, person.lastName].filter(Boolean).join(" ") || "—",
      phone: person.phone,
      units: unitsByUser.get(person.id) ?? [],
      bloodType: person.bloodType,
      emergencyContactName: person.emergencyContactName,
      emergencyContactPhone: person.emergencyContactPhone,
    }));
  }

  /** Combobox için sakin listesi (borç/ödeme ekranlarında). */
  async options() {
    const ids = await this.db.tx(async (tx) =>
      (
        await tx
          .select({ userId: memberships.userId })
          .from(memberships)
          .where(isNull(memberships.deletedAt))
      ).map((row) => row.userId),
    );
    if (ids.length === 0) return [];

    return this.db.bypass("residents:options", async (tx) =>
      tx
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
        })
        .from(users)
        .where(
          and(inArray(users.id, [...new Set(ids)]), isNull(users.deletedAt)),
        )
        .orderBy(asc(users.firstName), asc(users.lastName)),
    );
  }

  /** Bu kişi bu sitede kayıtlı mı — yazma uçlarının yatay yetki kontrolü. */
  async isMember(userId: string): Promise<boolean> {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(eq(memberships.userId, userId), isNull(memberships.deletedAt)),
        )
        .limit(1);
      return rows.length > 0;
    });
  }
}
