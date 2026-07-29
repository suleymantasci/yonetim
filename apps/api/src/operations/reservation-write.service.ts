import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";

import type {
  ReservationCreate,
  ReservationDecide,
  ReservationSaveResult,
  ResourceDetail,
  ResourceSave,
  ResourceSaveResult,
} from "@yonetim/contracts";
import { reservations, resources } from "@yonetim/db";

import { AuditService, diffOf } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";

const HOUR_MS = 3_600_000;

/**
 * Yeri hâlâ tutan durumlar — çakışma kontrolü bunlara bakıyor.
 *
 * `pending` **dahil**: onay bekleyen bir talep henüz reddedilmediği sürece o
 * saati tutar. Dahil olmasaydı iki sakin aynı saate başvurur, ikisi de
 * onaylanmayı bekler ve yönetici birini reddetmek zorunda kalırdı — çakışmayı
 * baştan engellemek yerine sonradan hakem olmak.
 */
const BLOCKING_STATUSES = ["pending", "approved"] as const;

/**
 * Rezervasyon ve tesis yazma — PROJE-DURUMU §5.2, sıra 5.
 *
 * MODÜLÜN GİRİŞİ TESİS TANIMI: `resources` tablosunun da yazma yolu yoktu,
 * yani ekran yalnız boş bir liste gösterebiliyordu. Banka modülündekiyle aynı
 * örüntü — okuma tarafı hazır, giriş kapısı hiç açılmamış.
 */
@Injectable()
export class ReservationWriteService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------- Tesis ---------------- */

  async resourceDetail(id: string): Promise<ResourceDetail> {
    const row = await this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(resources)
        .where(and(eq(resources.id, id), isNull(resources.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
    if (!row) throw new NotFoundException("not_found");

    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      capacity: row.capacity,
      feeMinor: row.feeKurus,
      feeUnit: row.feeUnit,
      depositMinor: row.depositKurus,
      requiresApproval: row.requiresApproval,
      maxHoursPerBooking: row.maxHoursPerBooking,
      maxBookingsPerMonth: row.maxBookingsPerMonth,
      openHour: row.openHour,
      closeHour: row.closeHour,
      rulesText: row.rulesText,
      isActive: row.isActive,
    };
  }

  async saveResource(
    dto: ResourceSave,
    id?: string,
  ): Promise<ResourceSaveResult> {
    const values = {
      name: dto.name,
      kind: dto.kind,
      capacity: dto.capacity ?? null,
      feeKurus: dto.feeMinor,
      feeUnit: dto.feeUnit,
      depositKurus: dto.depositMinor,
      requiresApproval: dto.requiresApproval,
      maxHoursPerBooking: dto.maxHoursPerBooking,
      maxBookingsPerMonth: dto.maxBookingsPerMonth,
      openHour: dto.openHour,
      closeHour: dto.closeHour,
      rulesText: dto.rulesText ?? null,
      isActive: dto.isActive,
    };

    const result = await this.db.tx(async (tx) => {
      if (!id) {
        const [created] = await tx
          .insert(resources)
          .values({ ...values, tenantId: this.db.ctx().tenantId })
          .returning({ id: resources.id, name: resources.name });
        if (!created) throw new NotFoundException("internal");
        return { ...created, diff: undefined };
      }

      const [before] = await tx
        .select()
        .from(resources)
        .where(and(eq(resources.id, id), isNull(resources.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      await tx
        .update(resources)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(resources.id, id));

      return {
        id,
        name: dto.name,
        diff: diffOf(before as unknown as Record<string, unknown>, values),
      };
    });

    await this.audit.record({
      action: id ? "resource_updated" : "resource_created",
      resource: "resource",
      resourceId: result.id,
      diff: result.diff,
    });
    return { id: result.id, name: result.name };
  }

  /* ---------------- Rezervasyon ---------------- */

  async create(dto: ReservationCreate): Promise<ReservationSaveResult> {
    if (dto.endAt <= dto.startAt) {
      throw new BadRequestException("invalid:end_before_start");
    }

    const outcome = await this.db.tx(async (tx) => {
      const [resource] = await tx
        .select()
        .from(resources)
        .where(
          and(eq(resources.id, dto.resourceId), isNull(resources.deletedAt)),
        )
        .limit(1);
      if (!resource) throw new NotFoundException("not_found");
      if (!resource.isActive) {
        throw new BadRequestException("invalid:resource_inactive");
      }

      const hours = (dto.endAt.getTime() - dto.startAt.getTime()) / HOUR_MS;
      if (hours > resource.maxHoursPerBooking) {
        throw new BadRequestException("invalid:exceeds_max_hours");
      }

      /*
       * AÇILIŞ/KAPANIŞ SAATİ **YEREL SAATE GÖRE** kontrol ediliyor.
       *
       * "Havuz 08:00–23:00 açık" cümlesi site sakininin saatiyle söylenmiş bir
       * cümle; UTC saatiyle kontrol etmek yaz saati uygulamasında kuralı bir
       * saat kaydırırdı. Tarihler tenant'ın saat diliminde yorumlanıyor.
       */
      const startHour = istanbulHour(dto.startAt);
      const endHour = istanbulHour(dto.endAt);
      const endsAtMidnight = endHour === 0;
      if (
        startHour < resource.openHour ||
        (!endsAtMidnight && endHour > resource.closeHour) ||
        (endsAtMidnight && resource.closeHour !== 24)
      ) {
        throw new BadRequestException("invalid:outside_open_hours");
      }

      /*
       * ÇAKIŞMA KONTROLÜ — yarı açık aralık [start, end).
       *
       * Bitişik iki rezervasyon (14:00–16:00 ve 16:00–18:00) çakışma
       * **değil**: kapalı aralık kullanılsaydı arka arkaya kullanım imkânsız
       * olur ve salon gereksiz yere boş kalırdı.
       */
      const [clash] = await tx
        .select({ id: reservations.id })
        .from(reservations)
        .where(
          and(
            eq(reservations.resourceId, dto.resourceId),
            inArray(reservations.status, [...BLOCKING_STATUSES]),
            lt(reservations.startAt, dto.endAt),
            gt(reservations.endAt, dto.startAt),
          ),
        )
        .limit(1);
      if (clash) throw new ConflictException("conflict:reservation_overlap");

      // Ücret tarifeden ve süreden türüyor; istemciden alınsaydı aynı salon
      // iki sakine iki farklı fiyata verilebilirdi.
      const feeKurus = feeFor(resource, hours);
      const status = resource.requiresApproval ? "pending" : "approved";

      const [created] = await tx
        .insert(reservations)
        .values({
          tenantId: this.db.ctx().tenantId,
          resourceId: dto.resourceId,
          userId: dto.userId,
          unitId: dto.unitId ?? null,
          startAt: dto.startAt,
          endAt: dto.endAt,
          guestCount: dto.guestCount,
          feeKurus,
          depositKurus: resource.depositKurus,
          status,
          note: dto.note ?? null,
          // Onay gerekmiyorsa kaydı açan kişi onaylamış sayılıyor: "kim
          // onayladı" sorusunun cevabı boş kalmamalı.
          approvedBy: status === "approved" ? (this.db.ctx().userId ?? null) : null,
        })
        .returning({ id: reservations.id });
      if (!created) throw new NotFoundException("internal");

      return { id: created.id, status, feeMinor: feeKurus };
    });

    await this.audit.record({
      action: "reservation_created",
      resource: "reservation",
      resourceId: outcome.id,
      diff: { status: { from: null, to: outcome.status } },
    });
    return outcome;
  }

  /**
   * Onay / ret / iptal / tamamlandı.
   *
   * Ret ve iptalde gerekçe kaydediliyor — sakine gösterilen tek açıklama o ve
   * "neden reddedildi" sorusu üç ay sonra da sorulabiliyor.
   */
  async decide(
    id: string,
    dto: ReservationDecide,
  ): Promise<{ id: string; status: string }> {
    await this.db.tx(async (tx) => {
      const [before] = await tx
        .select({ id: reservations.id, status: reservations.status })
        .from(reservations)
        .where(eq(reservations.id, id))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      /*
       * İPTAL EDİLMİŞ BİR REZERVASYON YENİDEN ONAYLANMIYOR.
       *
       * Aradaki sürede o saat başkasına verilmiş olabilir ve geri almak
       * çakışma kontrolünü atlatmak olurdu. Doğru yol yeni kayıt açmak.
       */
      if (
        before.status === "cancelled" &&
        dto.decision === "approved"
      ) {
        throw new BadRequestException("invalid:cancelled_cannot_reapprove");
      }

      const now = new Date();
      await tx
        .update(reservations)
        .set({
          status: dto.decision,
          approvedBy:
            dto.decision === "approved"
              ? (this.db.ctx().userId ?? null)
              : undefined,
          cancelledAt:
            dto.decision === "cancelled" || dto.decision === "rejected"
              ? now
              : null,
          cancelReason: dto.reason ?? null,
          updatedAt: now,
        })
        .where(eq(reservations.id, id));
    });

    await this.audit.record({
      action: "reservation_decided",
      resource: "reservation",
      resourceId: id,
      diff: { status: { from: null, to: dto.decision } },
      reason: dto.reason ?? undefined,
    });
    return { id, status: dto.decision };
  }

  /** Tesisi kaldır — soft delete; geçmiş rezervasyonlar kaydı referans alıyor. */
  async removeResource(id: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [row] = await tx
        .select({ id: resources.id })
        .from(resources)
        .where(and(eq(resources.id, id), isNull(resources.deletedAt)))
        .limit(1);
      if (!row) throw new NotFoundException("not_found");

      /*
       * Gelecek tarihli aktif rezervasyonu olan tesis silinmiyor.
       *
       * Silinseydi sakinin elinde onaylanmış ama artık var olmayan bir
       * rezervasyon kalırdı. Önce rezervasyonlar iptal edilmeli — bu, silme
       * anında verilmesi gereken bir karar ve sessizce alınmamalı.
       */
      const [future] = await tx
        .select({ id: reservations.id })
        .from(reservations)
        .where(
          and(
            eq(reservations.resourceId, id),
            ne(reservations.status, "cancelled"),
            sql`${reservations.endAt} > now()`,
          ),
        )
        .limit(1);
      if (future) throw new ConflictException("conflict:resource_has_bookings");

      await tx
        .update(resources)
        .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
        .where(eq(resources.id, id));
    });

    await this.audit.record({
      action: "resource_deleted",
      resource: "resource",
      resourceId: id,
    });
    return { id };
  }
}

/**
 * Ücret — tarifenin birimine göre.
 *
 * `booking` (rezervasyon başına sabit) ayrı bir birim çünkü bazı tesisler
 * süreye bakmaksızın tek ücret alıyor; saatlik hesaba zorlamak, iki saatlik
 * bir toplantıyı dört saatlikten ucuz göstermek gibi yanlış bir sinyal
 * verirdi.
 */
function feeFor(
  resource: { feeKurus: number; feeUnit: string },
  hours: number,
): number {
  if (resource.feeUnit === "booking") return resource.feeKurus;
  if (resource.feeUnit === "day") {
    return resource.feeKurus * Math.max(1, Math.ceil(hours / 24));
  }
  // Saatlik: başlanan saat tam sayılıyor — yarım saatlik kalıntı için kesir
  // faturalamak, tahsilatta kuruş artıklarına yol açardı.
  return resource.feeKurus * Math.max(1, Math.ceil(hours));
}

/**
 * Tarihin İstanbul saat dilimindeki saati (0–23).
 *
 * `hourCycle: "h23"` açıkça veriliyor: `hour12: false` bazı ICU sürümlerinde
 * gece yarısını **24** olarak biçimlendiriyor ve bu, açılış saati kontrolünü
 * sessizce ters çevirirdi.
 */
function istanbulHour(value: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(value),
  );
}
