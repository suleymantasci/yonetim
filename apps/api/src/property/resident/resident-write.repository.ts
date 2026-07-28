import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { HEALTH_CONSENT_KIND } from "@yonetim/contracts";
import type {
  OccupancyCreate,
  OccupancyEnd,
  ResidentCreate,
  ResidentUpdate,
} from "@yonetim/contracts";
import { normalizePhone } from "@yonetim/core";
import {
  consents,
  debts,
  memberships,
  unitOccupancies,
  units,
  users,
  type Database,
} from "@yonetim/db";

import { DbService } from "../../infra/db/db.service";
import { PiiService } from "./pii.service";

/**
 * Aydınlatma metni sürümü — GAP 4.1.13.
 *
 * Metin değişince artırılır; eski onaylar hangi sürüme verildiğini korur.
 * Sunucuda duruyor çünkü belge veri sorumlusunun: istemcinin "şu sürüme onay
 * verildi" demesine izin vermek, kaydın doğruluğunu istemciye emanet etmekti.
 */
export const KVKK_NOTICE_VERSION = "2026.1";

/**
 * Kan grubunun yazılacak değerini ve rıza kaydının yönünü belirler.
 *
 * TEK YERDE, ÇÜNKÜ İKİ YAZMA YOLU VAR (`create` ve `update`) ve kural ikisinde
 * de aynı olmak zorunda — özel nitelikli veriyi bir yolda rızasız kabul eden
 * bir uygulama, ihlali o yoldan yapar.
 *
 * Üç durum:
 *  - **rıza var + değer var** → yaz, rızayı `granted` kaydet
 *  - **rıza yok + değer var** → `consent_required` (400). Sessizce yok saymak
 *    yöneticiye "kaydettim" der, alan boş kalırdı — en kötü sonuç.
 *  - **değer yok** → alanı NULL'la ve varsa rızayı geri çekilmiş işaretle;
 *    rızası olmayan sağlık verisini saklamaya devam etmek ihlalin kendisi.
 */
function resolveHealthData(dto: {
  bloodType?: string | null;
  healthDataConsent: boolean;
}): { bloodType: string | null; consentGranted: boolean } {
  if (!dto.bloodType) return { bloodType: null, consentGranted: false };
  if (!dto.healthDataConsent) {
    throw new BadRequestException("consent_required:health");
  }
  return { bloodType: dto.bloodType, consentGranted: true };
}

/**
 * Sakin yazma işlemleri — MIMARI-PLAN §8.5.
 *
 * `apps/app/src/app/panel/sakinler/actions.ts` içindeki mantık buraya
 * taşındı. Değişen tek şey nereye yazıldığı değil, **kimin** yazdığı: TCKN
 * şifreleme/çözme artık yalnız bu süreçte mümkün (`FIELD_ENCRYPTION_KEY`
 * app konteynerinde yok).
 */
@Injectable()
export class ResidentWriteRepository {
  constructor(
    private readonly db: DbService,
    private readonly pii: PiiService,
  ) {}

  /**
   * Sakin oluşturur ya da **mevcut kişiyi bu siteye bağlar**.
   *
   * Aynı telefon/e-posta ile kayıt varsa yeni `users` satırı açılmaz: kişi
   * başka bir sitede zaten kayıtlı olabilir (çoklu tenant) ve "tek cari"
   * ilkesi kişinin tek kayıt olmasını gerektiriyor. Hangisinin olduğu
   * `linkedExisting` ile çağırana bildirilir — yönetici için bunlar farklı
   * olaylar.
   */
  async create(
    dto: ResidentCreate,
  ): Promise<{ id: string; linkedExisting: boolean }> {
    const ctx = this.db.ctx();
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.phone && !phone) {
      throw new BadRequestException("validation_failed:phone");
    }
    const tckn = this.pii.sealTckn(dto.tckn ?? undefined, ctx.tenantId);
    // Rıza kontrolü **yazmadan önce**: eksikse hiçbir satır oluşmadan 400 döner.
    const health = resolveHealthData(dto);

    const { userId, linkedExisting } = await this.db.bypass(
      "residents:create",
      async (tx) => {
        const existing = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              isNull(users.deletedAt),
              phone ? eq(users.phone, phone) : eq(users.email, dto.email!),
            ),
          )
          .limit(1);

        const optInAt = dto.whatsappOptIn ? new Date() : null;

        if (existing[0]) {
          await tx
            .update(users)
            .set({
              firstName: dto.firstName,
              lastName: dto.lastName,
              email: dto.email ?? undefined,
              phone: phone ?? undefined,
              locale: dto.locale,
              whatsappOptIn: dto.whatsappOptIn,
              whatsappOptInAt: optInAt,
              emergencyContactName: dto.emergencyContactName ?? undefined,
              emergencyContactPhone: dto.emergencyContactPhone ?? undefined,
              // TCKN'in aksine kan grubu boş gelirse **NULL'lanır** (bkz.
              // sözleşmedeki `bloodType` notu): boş bırakmak silmektir.
              bloodType: health.bloodType,
              // TCKN yalnız yeni değer geldiyse yazılır: boş bırakmak silme değil.
              ...(tckn
                ? { tcknEncrypted: tckn.encrypted, tcknIndex: tckn.index }
                : {}),
            })
            .where(eq(users.id, existing[0].id));
          return { userId: existing[0].id, linkedExisting: true };
        }

        const [created] = await tx
          .insert(users)
          .values({
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone,
            email: dto.email ?? null,
            locale: dto.locale,
            whatsappOptIn: dto.whatsappOptIn,
            whatsappOptInAt: optInAt,
            emergencyContactName: dto.emergencyContactName ?? null,
            emergencyContactPhone: dto.emergencyContactPhone ?? null,
            bloodType: health.bloodType,
            tcknEncrypted: tckn?.encrypted ?? null,
            tcknIndex: tckn?.index ?? null,
          })
          .returning({ id: users.id });
        if (!created) throw new BadRequestException("internal");
        return { userId: created.id, linkedExisting: false };
      },
    );

    await this.db.tx(async (tx) => {
      // Aynı rol için tekil index var; çakışmayı yok say.
      await tx
        .insert(memberships)
        .values({
          tenantId: ctx.tenantId,
          userId,
          role: dto.role,
          notes: dto.notes ?? null,
          invitedBy: ctx.userId,
          invitedAt: new Date(),
          acceptedAt: new Date(),
        })
        .onConflictDoNothing();

      if (dto.unitId && dto.relation) {
        await linkOccupancy(tx, {
          tenantId: ctx.tenantId,
          unitId: dto.unitId,
          userId,
          relation: dto.relation,
          ownershipPct: dto.ownershipPct,
          startDate: dto.startDate ?? new Date(),
          debtTransferPolicy: dto.debtTransferPolicy,
        });
      }
    });

    await this.recordConsents(userId, dto.whatsappOptIn);
    await this.syncHealthConsent(userId, health.consentGranted);
    return { id: userId, linkedExisting };
  }

  /**
   * Sağlık verisi açık rızası (md.6/3) — yalnız **durum değiştiğinde** yazar.
   *
   * `consents` append-only bir kütük; her sakin güncellemesinde "rıza hâlâ
   * var" satırı eklemek onu okunamaz hale getirirdi. Kayıt bir olayı
   * anlatmalı: rıza verildi ya da geri çekildi. Değişiklik yoksa olay da yok.
   */
  private async syncHealthConsent(userId: string, granted: boolean) {
    const ctx = this.db.ctx();
    await this.db.bypass("residents:health-consent", async (tx) => {
      const [latest] = await tx
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

      const current = latest?.granted ?? false;
      if (current === granted) return;

      await tx.insert(consents).values({
        tenantId: ctx.tenantId,
        userId,
        kind: HEALTH_CONSENT_KIND,
        granted,
        documentVersion: KVKK_NOTICE_VERSION,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        grantedAt: granted ? new Date() : null,
        revokedAt: granted ? null : new Date(),
      });
    });
  }

  /** KVKK md.10 aydınlatma onayı — ve verildiyse WhatsApp rızası, ayrı satır. */
  private async recordConsents(userId: string, whatsappOptIn: boolean) {
    const ctx = this.db.ctx();
    await this.db.bypass("residents:consent", async (tx) => {
      await tx.insert(consents).values({
        tenantId: ctx.tenantId,
        userId,
        kind: "kvkk_aydinlatma",
        granted: true,
        documentVersion: KVKK_NOTICE_VERSION,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        grantedAt: new Date(),
      });
      if (whatsappOptIn) {
        await tx.insert(consents).values({
          tenantId: ctx.tenantId,
          userId,
          kind: "whatsapp_iletisim",
          granted: true,
          documentVersion: KVKK_NOTICE_VERSION,
          ip: ctx.ip,
          grantedAt: new Date(),
        });
      }
    });
  }

  /** Güncelleme. Döndürdüğü diff denetim kütüğüne yazılır. */
  async update(
    dto: ResidentUpdate,
  ): Promise<Record<string, { from: unknown; to: unknown }>> {
    const ctx = this.db.ctx();
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.phone && !phone)
      throw new BadRequestException("validation_failed:phone");
    const tckn = this.pii.sealTckn(dto.tckn ?? undefined, ctx.tenantId);
    const health = resolveHealthData(dto);

    const changes = await this.db.bypass("residents:update", async (tx) => {
      const [before] = await tx
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          email: users.email,
          locale: users.locale,
          whatsappOptIn: users.whatsappOptIn,
          bloodType: users.bloodType,
        })
        .from(users)
        .where(eq(users.id, dto.id))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      const patch = {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone,
        email: dto.email ?? null,
        locale: dto.locale,
        whatsappOptIn: dto.whatsappOptIn,
        emergencyContactName: dto.emergencyContactName ?? null,
        emergencyContactPhone: dto.emergencyContactPhone ?? null,
        // Diff'e dahil: özel nitelikli verinin ne zaman kimin tarafından
        // eklendiği/silindiği KVKK izlenebilirliğinin tam olarak sorduğu şey.
        bloodType: health.bloodType,
      };

      await tx
        .update(users)
        .set({
          ...patch,
          whatsappOptInAt: dto.whatsappOptIn ? new Date() : null,
          ...(tckn
            ? { tcknEncrypted: tckn.encrypted, tcknIndex: tckn.index }
            : {}),
        })
        .where(eq(users.id, dto.id));

      const diff: Record<string, { from: unknown; to: unknown }> = {};
      const beforeRecord = before as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (beforeRecord[key] !== value)
          diff[key] = { from: beforeRecord[key], to: value };
      }
      return diff;
    });

    await this.db.tx(async (tx) => {
      await tx
        .insert(memberships)
        .values({
          tenantId: ctx.tenantId,
          userId: dto.id,
          role: dto.role,
          notes: dto.notes ?? null,
          acceptedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [memberships.tenantId, memberships.userId, memberships.role],
          set: { notes: dto.notes ?? null, deletedAt: null },
        });
    });

    await this.syncHealthConsent(dto.id, health.consentGranted);
    return changes;
  }

  async addOccupancy(dto: OccupancyCreate): Promise<string> {
    const ctx = this.db.ctx();
    const id = await this.db.tx(async (tx) =>
      linkOccupancy(tx, {
        tenantId: ctx.tenantId,
        unitId: dto.unitId,
        userId: dto.userId,
        relation: dto.relation,
        ownershipPct: dto.ownershipPct,
        startDate: dto.startDate,
        debtTransferPolicy: dto.debtTransferPolicy,
        contractUrl: dto.contractUrl ?? undefined,
        failOnExisting: true,
      }),
    );
    if (!id) throw new BadRequestException("internal");
    return id;
  }

  /**
   * Kiracı ayrılma akışı + borç devir motoru — GAP 4.2.4.
   *
   * `debt_transfer_policy` alanı şemada vardı ama hiçbir şey onu
   * uygulamıyordu. Motor burada:
   *
   *   - `keep`        → borç kişide kalır
   *   - `owner`       → ödenmemiş borçların yükümlüsü aktif malike geçer
   *   - `next_tenant` → devir **ertelenir**: borç metadata'sına işaret bırakılır,
   *                     yeni kiracı bağlandığında ona geçer
   *
   * Devir sessiz bir UPDATE değil: her borcun metadata'sına kimden geldiği ve
   * gerekçesi yazılır, üstüne denetim kütüğüne olay düşer.
   */
  async endOccupancy(
    occupancyId: string,
    dto: OccupancyEnd,
  ): Promise<{
    transferredDebtCount: number;
    transferredMinor: number;
    pending: boolean;
  }> {
    return this.db.tx(async (tx) => {
      const [occupancy] = await tx
        .select()
        .from(unitOccupancies)
        .where(eq(unitOccupancies.id, occupancyId))
        .limit(1);
      if (!occupancy) throw new NotFoundException("not_found");
      if (occupancy.endDate)
        throw new ConflictException("conflict:already_ended");

      await tx
        .update(unitOccupancies)
        .set({ endDate: dto.endDate, debtTransferPolicy: dto.transferTo })
        .where(eq(unitOccupancies.id, occupancyId));

      const openDebts = await tx
        .select({
          id: debts.id,
          amountKurus: debts.amountKurus,
          paidKurus: debts.paidKurus,
          lateFeeKurus: debts.lateFeeKurus,
        })
        .from(debts)
        .where(
          and(
            eq(debts.unitId, occupancy.unitId),
            eq(debts.debtorUserId, occupancy.userId),
            isNull(debts.deletedAt),
            sql`${debts.status} <> 'paid'`,
          ),
        );

      const remaining = openDebts.reduce(
        (sum, debt) =>
          sum + (debt.amountKurus + debt.lateFeeKurus - debt.paidKurus),
        0,
      );

      if (dto.transferTo === "keep" || openDebts.length === 0) {
        return {
          transferredDebtCount: 0,
          transferredMinor: remaining,
          pending: false,
        };
      }

      if (dto.transferTo === "owner") {
        const [owner] = await tx
          .select({ userId: unitOccupancies.userId })
          .from(unitOccupancies)
          .where(
            and(
              eq(unitOccupancies.unitId, occupancy.unitId),
              eq(unitOccupancies.relation, "owner"),
              isNull(unitOccupancies.endDate),
            ),
          )
          .limit(1);
        // Malik yoksa devir yapılamaz; sessizce borcu kimsesiz bırakmaktansa
        // işlemi durdurup yöneticiden malik tanımlamasını istiyoruz.
        if (!owner) throw new ConflictException("conflict:no_active_owner");

        for (const debt of openDebts) {
          await tx
            .update(debts)
            .set({
              debtorUserId: owner.userId,
              // Her parametre açıkça `::text`: `jsonb_build_object` argüman
              // tiplerini bağlamdan çıkaramıyor, cast'siz bırakılan parametre
              // "could not determine data type" ile düşüyor.
              metadata: sql`${debts.metadata} || jsonb_build_object(
                'transferredFrom', ${occupancy.userId}::text,
                'transferredAt', ${dto.endDate.toISOString()}::text,
                'transferReason', ${dto.reason ?? "occupancy_ended"}::text
              )`,
            })
            .where(eq(debts.id, debt.id));
        }
        return {
          transferredDebtCount: openDebts.length,
          transferredMinor: remaining,
          pending: false,
        };
      }

      for (const debt of openDebts) {
        await tx
          .update(debts)
          .set({
            metadata: sql`${debts.metadata} || jsonb_build_object(
              'pendingTransferTo', 'next_tenant',
              'transferredFrom', ${occupancy.userId}::text,
              'transferMarkedAt', ${dto.endDate.toISOString()}::text
            )`,
          })
          .where(eq(debts.id, debt.id));
      }
      return {
        transferredDebtCount: 0,
        transferredMinor: remaining,
        pending: true,
      };
    });
  }

  /**
   * Sakini siteden çıkarır.
   *
   * `users` kaydı **silinmez**: kişi başka sitelerde de kayıtlı olabilir,
   * global kaydı silmek onların verisini bozar. Silinen şey bu sitedeki
   * üyelik ve açık ilişkilerdir. Kişinin kendi verisinin silinmesi KVKK md.7
   * talebiyle ve anonimleştirme hattıyla yürür (ayrı akış).
   *
   * Açık borcu olan çıkarılmaz: cari hesabı askıda kalırdı.
   */
  async remove(ids: string[]): Promise<{ removed: number; skipped: number }> {
    const removed = await this.db.tx(async (tx) => {
      let count = 0;
      for (const userId of ids) {
        const [debtRow] = await tx
          .select({ value: sql<number>`COUNT(*)` })
          .from(debts)
          .where(
            and(
              eq(debts.debtorUserId, userId),
              isNull(debts.deletedAt),
              sql`${debts.status} <> 'paid'`,
            ),
          );
        if (Number(debtRow?.value ?? 0) > 0) continue;

        await tx
          .update(memberships)
          .set({ deletedAt: new Date() })
          .where(
            and(eq(memberships.userId, userId), isNull(memberships.deletedAt)),
          );
        await tx
          .update(unitOccupancies)
          .set({ endDate: new Date() })
          .where(
            and(
              eq(unitOccupancies.userId, userId),
              isNull(unitOccupancies.endDate),
            ),
          );
        count += 1;
      }
      return count;
    });
    return { removed, skipped: ids.length - removed };
  }

  /** WhatsApp rızası — değişim her zaman ayrı bir `consents` satırı bırakır. */
  async setWhatsappOptIn(ids: string[], optIn: boolean): Promise<number> {
    const ctx = this.db.ctx();
    await this.db.bypass("residents:whatsapp-optin", async (tx) => {
      for (const userId of ids) {
        await tx
          .update(users)
          .set({
            whatsappOptIn: optIn,
            whatsappOptInAt: optIn ? new Date() : null,
          })
          .where(eq(users.id, userId));
        await tx.insert(consents).values({
          tenantId: ctx.tenantId,
          userId,
          kind: "whatsapp_iletisim",
          granted: optIn,
          documentVersion: KVKK_NOTICE_VERSION,
          ip: ctx.ip,
          grantedAt: optIn ? new Date() : null,
          revokedAt: optIn ? null : new Date(),
        });
      }
    });
    return ids.length;
  }

  /**
   * TCKN çakışma kontrolü — blind index üzerinden.
   *
   * Kapsam bilinçli olarak dar: yalnız bu sitenin üyeleri içinde arar.
   * Platform genelinde arasaydı, uç "bu TCKN sistemde var mı" sorusunu
   * herhangi bir site yöneticisine cevaplayan bir sızıntı yüzeyi olurdu.
   */
  async findByTckn(tckn: string): Promise<{ id: string; name: string } | null> {
    const digits = tckn.replace(/\D+/g, "");
    if (digits.length !== 11) return null;
    const index = this.pii.tcknLookupIndex(digits);

    const memberIds = await this.db.tx(async (tx) =>
      (
        await tx
          .select({ userId: memberships.userId })
          .from(memberships)
          .where(isNull(memberships.deletedAt))
      ).map((row) => row.userId),
    );
    if (memberIds.length === 0) return null;

    return this.db.bypass("residents:tckn-lookup", async (tx) => {
      const rows = await tx
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(
          and(
            eq(users.tcknIndex, index),
            isNull(users.deletedAt),
            sql`${users.id} = ANY(${sql.param(memberIds)}::uuid[])`,
          ),
        )
        .limit(1);
      const found = rows[0];
      if (!found) return null;
      return {
        id: found.id,
        name: [found.firstName, found.lastName].filter(Boolean).join(" "),
      };
    });
  }
}

/**
 * İlişki kurar ve `units` üzerindeki özet alanları (currentOwnerId /
 * currentTenantId / ownershipType) tazeler.
 *
 * Aynı birimde aynı kişi için açık ilişki varsa yenisi açılmaz — çift kayıt
 * cari hesabı ikiye bölerdi.
 */
async function linkOccupancy(
  tx: Database,
  params: {
    tenantId: string;
    unitId: string;
    userId: string;
    relation: "owner" | "tenant";
    ownershipPct: number;
    startDate: Date;
    debtTransferPolicy: string;
    contractUrl?: string;
    failOnExisting?: boolean;
  },
): Promise<string | undefined> {
  const existing = await tx
    .select({ id: unitOccupancies.id })
    .from(unitOccupancies)
    .where(
      and(
        eq(unitOccupancies.unitId, params.unitId),
        eq(unitOccupancies.userId, params.userId),
        eq(unitOccupancies.relation, params.relation),
        isNull(unitOccupancies.endDate),
      ),
    )
    .limit(1);

  if (existing[0]) {
    // Kayıt sırasında sessizce mevcut ilişkiyi döndürmek doğru (kullanıcı
    // ilişki kurmaya değil kişi kaydetmeye geldi); ilişki ekleme ekranında
    // ise açıkça hata olmalı.
    if (params.failOnExisting)
      throw new ConflictException("conflict:occupancy_exists");
    return existing[0].id;
  }

  // Kiracı ilişkisi tekildir: yeni kiracı gelirse öncekinin kaydı kapanmalı.
  if (params.relation === "tenant") {
    await tx
      .update(unitOccupancies)
      .set({ endDate: params.startDate })
      .where(
        and(
          eq(unitOccupancies.unitId, params.unitId),
          eq(unitOccupancies.relation, "tenant"),
          isNull(unitOccupancies.endDate),
        ),
      );
  }

  const [created] = await tx
    .insert(unitOccupancies)
    .values({
      tenantId: params.tenantId,
      unitId: params.unitId,
      userId: params.userId,
      relation: params.relation,
      ownershipPct: params.ownershipPct.toFixed(3),
      startDate: params.startDate,
      debtTransferPolicy: params.debtTransferPolicy,
      contractUrl: params.contractUrl ?? null,
    })
    .returning({ id: unitOccupancies.id });

  await tx
    .update(units)
    .set(
      params.relation === "owner"
        ? { currentOwnerId: params.userId, ownershipType: "owner" }
        : { currentTenantId: params.userId, ownershipType: "tenant" },
    )
    .where(eq(units.id, params.unitId));

  return created?.id;
}
