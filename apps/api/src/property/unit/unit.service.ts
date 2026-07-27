import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import type {
  BulkResult,
  UnitBulkCreate,
  UnitBulkCreateResult,
  UnitBulkPatch,
  UnitBulkPreview,
  UnitCreate,
  UnitDetail,
  UnitListQuery,
  UnitListResponse,
} from "@yonetim/contracts";
import { maskPhone } from "@yonetim/core";

import { AuditService, diffOf } from "../../governance/audit/audit.service";
import { BulkUnitBuilder } from "./unit-bulk.service";
import { UnitRepository } from "./unit.repository";

/**
 * Birim iş akışı — MIMARI-PLAN §8.5.
 *
 * Servis üç şey yapar: repository'yi çağırır, KVKK/denetim kaydını yazar,
 * olay yayar. SQL burada yok; HTTP de yok.
 */
@Injectable()
export class UnitService {
  constructor(
    private readonly repo: UnitRepository,
    private readonly audit: AuditService,
    private readonly bulk: BulkUnitBuilder,
    private readonly events: EventEmitter2,
  ) {}

  async list(q: UnitListQuery): Promise<UnitListResponse> {
    return this.repo.list(q);
  }

  async detail(id: string): Promise<UnitDetail> {
    const data = await this.repo.detail(id);
    if (!data) throw new NotFoundException("not_found");

    // §8.4: DÖNEN kümeyi logla. Detay ekranı bu birimdeki kişileri gösteriyor,
    // dolayısıyla kütükteki küme ile ekrandaki küme birebir örtüşüyor.
    await this.audit.recordDataAccess({
      subjectUserIds: data.userIds,
      dataCategory: "identity",
      action: "view",
      purpose: "unit.detail",
    });

    const raw = data.raw as Record<string, unknown>;
    return {
      unit: {
        ...data.unit,
        roomCount: (raw.roomCount as string | null) ?? null,
        residentCount: Number(raw.residentCount ?? 0),
        currentOwnerId: (raw.currentOwnerId as string | null) ?? null,
        currentTenantId: (raw.currentTenantId as string | null) ?? null,
        notes: (raw.notes as string | null) ?? null,
        createdAt: raw.createdAt as Date,
        updatedAt: raw.updatedAt as Date,
      },
      block: data.unit.blockId
        ? { id: data.unit.blockId, name: data.unit.blockName ?? "" }
        : null,
      occupants: data.occupancyRows.map((row) => {
        const person = data.people.find((p) => p.id === row.userId);
        return {
          ...row,
          firstName: person?.firstName ?? null,
          lastName: person?.lastName ?? null,
          // Ham numara panel listesine hiç inmiyor (KVKK md.4 ölçülülük).
          // Arama/gönderim gerektiğinde ayrı, yetkiye bağlı uçtan alınır.
          phoneMasked: person?.phone ? maskPhone(person.phone) : null,
          email: person?.email ?? null,
          whatsappOptIn: person?.whatsappOptIn ?? false,
        };
      }),
      debtSummary: data.debtSummary,
      recentDebts: data.recentDebts,
      recentPayments: data.recentPayments,
      meters: data.meters,
      documents: data.documents,
    } as UnitDetail;
  }

  async create(dto: UnitCreate) {
    const created = await this.repo.create(dto);
    await this.audit.record({
      action: "unit_created",
      resource: "unit",
      resourceId: created.id,
    });
    this.events.emit("unit.created", { id: created.id, number: dto.number });
    return created;
  }

  async update(id: string, dto: UnitCreate, reason: string) {
    const { before, patch } = await this.repo.update(id, dto, reason);
    const diff = diffOf(before, patch as Record<string, unknown>);

    await this.audit.record({
      action: "unit_updated",
      resource: "unit",
      resourceId: id,
      diff,
      reason,
    });
    this.events.emit("unit.updated", { id, diff });
    return { id, diff };
  }

  async softDelete(ids: string[]): Promise<BulkResult> {
    const affected = await this.repo.softDelete(ids);
    await this.audit.record({
      action: "unit_bulk_deleted",
      resource: "unit",
      reason: `${affected}/${ids.length}`,
    });
    return { affected, requested: ids.length };
  }

  async restore(ids: string[]): Promise<BulkResult> {
    const affected = await this.repo.restore(ids);
    await this.audit.record({
      action: "unit_bulk_restored",
      resource: "unit",
      reason: `${affected}/${ids.length}`,
    });
    return { affected, requested: ids.length };
  }

  async bulkPatch(dto: UnitBulkPatch, reason: string): Promise<BulkResult> {
    const affected = await this.repo.bulkPatch(dto, reason);
    await this.audit.record({
      action: "unit_bulk_patched",
      resource: "unit",
      reason,
      diff: {
        selection: { from: null, to: dto.ids.length },
        patch: { from: null, to: { ...dto, ids: undefined } },
      },
    });
    return { affected, requested: dto.ids.length };
  }

  /* ---------------------------------------------------------------- *
   * Toplu üretim — önizleme zorunlu (GAP-DURUM kararı 8)
   * ---------------------------------------------------------------- */

  preview(dto: UnitBulkCreate): Promise<UnitBulkPreview> {
    this.assertBulkRange(dto);
    return this.bulk.preview(dto);
  }

  async bulkCreate(dto: UnitBulkCreate): Promise<UnitBulkCreateResult> {
    this.assertBulkRange(dto);
    // Kural protokol seviyesinde: önizlemeden geçmemiş toplu üretim yazılmaz.
    if (!dto.confirmed) throw new BadRequestException("preview_required");

    const result = await this.bulk.create(dto);
    await this.audit.record({
      action: "unit_bulk_created",
      resource: "unit",
      reason: `${result.created} üretildi, ${result.skipped.length} atlandı`,
    });
    return result;
  }

  private assertBulkRange(dto: UnitBulkCreate): void {
    if (dto.floorTo < dto.floorFrom)
      throw new BadRequestException("validation_failed:floor_range");
    if (!dto.blockId && !dto.newBlockName) {
      throw new BadRequestException("validation_failed:block_required");
    }
    const planned = (dto.floorTo - dto.floorFrom + 1) * dto.perFloor;
    if (planned > 500)
      throw new BadRequestException("validation_failed:bulk_too_many");
  }

  options() {
    return this.repo.options();
  }

  blockOptions() {
    return this.repo.blockOptions();
  }
}
