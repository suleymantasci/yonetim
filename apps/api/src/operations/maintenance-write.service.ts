import { Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type {
  MaintenanceComplete,
  MaintenanceDetail,
  MaintenanceSave,
  MaintenanceSaveResult,
} from "@yonetim/contracts";
import { maintenanceRecords } from "@yonetim/db";

import { AuditService, diffOf } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";

const DAY_MS = 86_400_000;

/**
 * Bakım planı yazma — PROJE-DURUMU §5.2, sıra 3.
 *
 * Bu modülde `maintenance.reminders` worker job'ı **zaten yazılı ve
 * çalışıyor**; eksik olan hatırlatacak kaydı üretmenin yoluydu. Yani burada
 * açılan uç, hazır bir boru hattının kapalı olan girişini açıyor.
 *
 * İKİ AYRI YAZMA YOLU — bilinçli:
 *  - `save`: planın kendisi (ne, nerede, ne sıklıkla, sıradaki vade)
 *  - `complete`: "yapıldı" olayı (ne zaman, ne kadar tuttu, belgesi ne)
 * Tek forma toplamak, planı düzelten birinin son bakım tarihini de farkında
 * olmadan değiştirmesine yol açardı — ve o tarih yasal denetimde sorulan şey.
 */
@Injectable()
export class MaintenanceWriteService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async detail(id: string): Promise<MaintenanceDetail> {
    const row = await this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(maintenanceRecords)
        .where(
          and(
            eq(maintenanceRecords.id, id),
            isNull(maintenanceRecords.deletedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });
    if (!row) throw new NotFoundException("not_found");

    return {
      id: row.id,
      templateId: row.templateId,
      equipmentType: row.equipmentType,
      label: row.label,
      location: row.location,
      intervalDays: row.intervalDays,
      lastDoneAt: row.lastDoneAt,
      nextDueAt: row.nextDueAt,
      lastCostMinor: row.lastCostKurus,
      documentUrl: row.documentUrl,
      isActive: row.isActive,
      notes: row.notes,
      // Okuma ucuyla aynı formül; "kaç gün kaldı" hep sunucu saatinden.
      daysUntilDue: Math.round((row.nextDueAt.getTime() - Date.now()) / DAY_MS),
    };
  }

  async save(
    dto: MaintenanceSave,
    id?: string,
  ): Promise<MaintenanceSaveResult> {
    const values = {
      templateId: dto.templateId ?? null,
      equipmentType: dto.equipmentType,
      label: dto.label,
      location: dto.location ?? null,
      intervalDays: dto.intervalDays,
      nextDueAt: dto.nextDueAt,
      isActive: dto.isActive,
      notes: dto.notes ?? null,
    };

    const result = await this.db.tx(async (tx) => {
      if (!id) {
        const [created] = await tx
          .insert(maintenanceRecords)
          .values({ ...values, tenantId: this.db.ctx().tenantId })
          .returning({
            id: maintenanceRecords.id,
            label: maintenanceRecords.label,
          });
        if (!created) throw new NotFoundException("internal");
        return { ...created, diff: undefined };
      }

      const [before] = await tx
        .select()
        .from(maintenanceRecords)
        .where(
          and(
            eq(maintenanceRecords.id, id),
            isNull(maintenanceRecords.deletedAt),
          ),
        )
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      await tx
        .update(maintenanceRecords)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(maintenanceRecords.id, id));

      return {
        id,
        label: dto.label,
        diff: diffOf(before as unknown as Record<string, unknown>, values),
      };
    });

    await this.audit.record({
      action: id ? "maintenance_updated" : "maintenance_created",
      resource: "maintenance_record",
      resourceId: result.id,
      diff: result.diff,
    });
    return { id: result.id, label: result.label };
  }

  /**
   * "Bakım yapıldı" olayı.
   *
   * Sıradaki vade **yapıldığı tarihten** ilerliyor (sözleşmede gerekçesi
   * yazılı). Not verildiyse kaydın notlarının **başına** tarihli bir satır
   * olarak ekleniyor: bakım geçmişi için ayrı tablo yok ve olması gereken
   * yerde — kayda bakan kişi son ne yapıldığını aynı ekranda görüyor.
   */
  async complete(
    id: string,
    dto: MaintenanceComplete,
  ): Promise<{ id: string; nextDueAt: Date }> {
    const nextDueAt = await this.db.tx(async (tx) => {
      const [before] = await tx
        .select()
        .from(maintenanceRecords)
        .where(
          and(
            eq(maintenanceRecords.id, id),
            isNull(maintenanceRecords.deletedAt),
          ),
        )
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      const next = new Date(
        dto.doneAt.getTime() + before.intervalDays * DAY_MS,
      );

      const entry = dto.note
        ? `${dto.doneAt.toISOString().slice(0, 10)} — ${dto.note}`
        : null;
      const notes = entry
        ? [entry, before.notes].filter(Boolean).join("\n")
        : before.notes;

      await tx
        .update(maintenanceRecords)
        .set({
          lastDoneAt: dto.doneAt,
          nextDueAt: next,
          lastCostKurus: dto.costMinor,
          // Belge verilmediyse **eskisi korunuyor**: yeni bakımın raporu
          // henüz elde olmayabilir ve önceki raporu silmek bilgi kaybı.
          documentUrl: dto.documentUrl ?? before.documentUrl,
          notes,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceRecords.id, id));

      return next;
    });

    await this.audit.record({
      action: "maintenance_completed",
      resource: "maintenance_record",
      resourceId: id,
      diff: {
        lastDoneAt: { from: null, to: dto.doneAt },
        nextDueAt: { from: null, to: nextDueAt },
      },
    });
    return { id, nextDueAt };
  }

  /**
   * Plan kaydını kaldır — **soft delete**.
   *
   * Zorunlu bir bakımın kaydını sertçe silmek, "bu site asansör kontrolünü ne
   * zaman yaptırdı" sorusunu cevapsız bırakırdı. Takip etmeyi bırakmak
   * isteyen `isActive: false` kullanıyor; bu uç yanlış açılmış kayıt için.
   */
  async remove(id: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [row] = await tx
        .select({ id: maintenanceRecords.id })
        .from(maintenanceRecords)
        .where(
          and(
            eq(maintenanceRecords.id, id),
            isNull(maintenanceRecords.deletedAt),
          ),
        )
        .limit(1);
      if (!row) throw new NotFoundException("not_found");

      await tx
        .update(maintenanceRecords)
        .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
        .where(eq(maintenanceRecords.id, id));
    });

    await this.audit.record({
      action: "maintenance_deleted",
      resource: "maintenance_record",
      resourceId: id,
    });
    return { id };
  }
}
