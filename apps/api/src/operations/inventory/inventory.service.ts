import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type {
  InventoryListResponse,
  InventoryPatchResult,
  InventorySave,
} from "@yonetim/contracts";
import { inventoryItems, staff } from "@yonetim/db";

import { AuditService, diffOf } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";

/** Alış bedeli toplamına giren durumlar — elden çıkmış kalem "varlık" değil. */
const OWNED_STATUSES = ["active", "in_repair"];
/** Yöneticinin bir şey yapması gereken durumlar. */
const ATTENTION_STATUSES = ["in_repair", "broken", "lost"];

/**
 * Demirbaş defteri — KMK md.34/9, rakip incelemesi §4.1.
 *
 * Tek dosya (repository/service ayrımı yok): modül tek tablo üzerinde düz
 * CRUD ve türetilmiş sayaçlardan ibaret. `debt` ya da `expense` gibi ayırmak
 * iki dosya arasında gidip gelmekten başka bir şey kazandırmazdı — bu
 * bölünme oralarda iş kuralının hacmi yüzünden vardı.
 *
 * SAYAÇLAR SUNUCUDA (§9a): "garanti doldu mu" bir zaman karşılaştırması ve
 * ölçütü sunucunun saati olmalı.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<InventoryListResponse> {
    const { rows, staffRows } = await this.db.tx(async (tx) => {
      const [rows, staffRows] = await Promise.all([
        tx
          .select({
            id: inventoryItems.id,
            code: inventoryItems.code,
            name: inventoryItems.name,
            category: inventoryItems.category,
            location: inventoryItems.location,
            quantity: inventoryItems.quantity,
            serialNo: inventoryItems.serialNo,
            purchaseDate: inventoryItems.purchaseDate,
            purchasePriceKurus: inventoryItems.purchasePriceKurus,
            warrantyUntil: inventoryItems.warrantyUntil,
            status: inventoryItems.status,
            responsibleStaffId: inventoryItems.responsibleStaffId,
            responsibleStaffName: staff.fullName,
            notes: inventoryItems.notes,
          })
          .from(inventoryItems)
          .leftJoin(staff, eq(staff.id, inventoryItems.responsibleStaffId))
          .where(isNull(inventoryItems.deletedAt))
          .orderBy(asc(inventoryItems.name)),

        tx
          .select({ id: staff.id, name: staff.fullName })
          .from(staff)
          .where(and(isNull(staff.deletedAt), eq(staff.isActive, true)))
          .orderBy(asc(staff.fullName)),
      ]);
      return { rows, staffRows };
    });

    const now = Date.now();
    const mapped = rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      location: row.location,
      quantity: row.quantity,
      serialNo: row.serialNo,
      purchaseDate: row.purchaseDate,
      purchasePriceKurus: row.purchasePriceKurus,
      warrantyUntil: row.warrantyUntil,
      status: row.status,
      responsibleStaffId: row.responsibleStaffId,
      responsibleStaffName: row.responsibleStaffName,
      notes: row.notes,
      // Garanti tarihi yoksa "doldu" denmiyor: bilinmeyen ile geçmiş farklı.
      warrantyExpired: row.warrantyUntil
        ? row.warrantyUntil.getTime() < now
        : false,
    }));

    return {
      rows: mapped.map((row) => ({
        ...row,
        purchasePriceKurus: row.purchasePriceKurus,
      })),
      staffOptions: staffRows,
      totals: {
        items: mapped.length,
        // Satır sayısı ≠ adet: "5 adet sandalye" tek satır, beş adet.
        units: mapped.reduce((sum, row) => sum + row.quantity, 0),
        valueMinor: mapped
          .filter((row) => OWNED_STATUSES.includes(row.status))
          .reduce(
            (sum, row) => sum + row.purchasePriceKurus * row.quantity,
            0,
          ),
        needsAttention: mapped.filter((row) =>
          ATTENTION_STATUSES.includes(row.status),
        ).length,
        lost: mapped.filter((row) => row.status === "lost").length,
      },
    };
  }

  async save(dto: InventorySave): Promise<{ id: string }> {
    const values = {
      code: dto.code?.trim() || null,
      name: dto.name,
      category: dto.category,
      location: dto.location ?? null,
      quantity: dto.quantity,
      serialNo: dto.serialNo ?? null,
      purchaseDate: dto.purchaseDate ?? null,
      purchasePriceKurus: dto.purchasePriceMinor,
      warrantyUntil: dto.warrantyUntil ?? null,
      status: dto.status,
      responsibleStaffId: dto.responsibleStaffId ?? null,
      notes: dto.notes ?? null,
    };

    const { id, diff } = await this.db.tx(async (tx) => {
      /*
       * Envanter numarası çakışması **önceden** yakalanıyor.
       *
       * Kısmi tekil index zaten engelliyor ama sürücünün 23505 hatası
       * yakalanmazsa istisna filtresinden 500 "internal" olarak çıkıyor —
       * kullanıcı "bu numara zaten kullanılıyor" yerine "beklenmeyen hata"
       * görürdü. Index güvenlik ağı, bu kontrol ise mesaj.
       */
      if (values.code) {
        const clash = await tx
          .select({ id: inventoryItems.id })
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.code, values.code),
              isNull(inventoryItems.deletedAt),
            ),
          )
          .limit(1);
        if (clash[0] && clash[0].id !== dto.id) {
          throw new ConflictException("conflict:inventory_code_taken");
        }
      }

      if (!dto.id) {
        const [created] = await tx
          .insert(inventoryItems)
          .values({ ...values, tenantId: this.db.ctx().tenantId })
          .returning({ id: inventoryItems.id });
        if (!created) throw new NotFoundException("internal");
        return { id: created.id, diff: undefined };
      }

      const [before] = await tx
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.id, dto.id),
            isNull(inventoryItems.deletedAt),
          ),
        )
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      await tx
        .update(inventoryItems)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(inventoryItems.id, dto.id));

      return {
        id: dto.id,
        diff: diffOf(before as unknown as Record<string, unknown>, values),
      };
    });

    await this.audit.record({
      action: dto.id ? "inventory_updated" : "inventory_created",
      resource: "inventory_item",
      resourceId: id,
      diff,
    });
    return { id };
  }

  /**
   * Toplu durum değişikliği — yıl sonu sayımının çıktısı.
   *
   * Kayıt **silinmiyor**, durumu değişiyor: "geçen yıl bu jeneratör vardı, ne
   * oldu" sorusu silinmiş bir satırdan cevaplanamaz. `lost` işaretlemesi de
   * denetim kütüğüne düşüyor — devir teslimde sorulacak asıl kalem bu.
   */
  async setStatus(
    ids: string[],
    status: InventorySave["status"],
  ): Promise<InventoryPatchResult> {
    const affected = await this.db.tx(async (tx) => {
      const updated = await tx
        .update(inventoryItems)
        .set({ status, updatedAt: new Date() })
        .where(
          and(
            inArray(inventoryItems.id, ids),
            isNull(inventoryItems.deletedAt),
          ),
        )
        .returning({ id: inventoryItems.id });
      return updated.length;
    });

    await this.audit.record({
      action: "inventory_status_changed",
      resource: "inventory_item",
      reason: `${status}: ${affected}/${ids.length}`,
    });
    return { affected };
  }
}
