import { Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";

import type { LawyerList, LawyerSave } from "@yonetim/contracts";
import { lawyers } from "@yonetim/db";

import { AuditService } from "../audit/audit.service";
import { DbService } from "../../infra/db/db.service";

/**
 * Avukat tanımları — icra dosyaları avukata atanır, liste avukata göre
 * süzülür. Silme yok: geçmiş dosyalar avukat adını korumalı; pasifleştirme.
 */
@Injectable()
export class LawyerService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<LawyerList> {
    const rows = await this.db.tx((tx) =>
      tx
        .select({
          row: lawyers,
          openCases: sql<number>`(SELECT COUNT(*)::int FROM legal_cases c WHERE c.lawyer_id = lawyers.id AND c.closed_at IS NULL)`,
          collected: sql<number>`(SELECT COALESCE(SUM(c.collected_kurus), 0)::bigint FROM legal_cases c WHERE c.lawyer_id = lawyers.id)`,
        })
        .from(lawyers)
        .orderBy(asc(lawyers.name)),
    );
    return {
      rows: rows.map(({ row, openCases, collected }) => ({
        id: row.id,
        name: row.name,
        barNo: row.barNo,
        barCity: row.barCity,
        phone: row.phone,
        email: row.email,
        commissionPct: Number(row.commissionPct),
        isActive: row.isActive,
        openCases: Number(openCases),
        collectedMinor: Number(collected),
      })),
    };
  }

  async create(dto: LawyerSave): Promise<{ id: string }> {
    const [row] = await this.db.tx((tx) =>
      tx
        .insert(lawyers)
        .values({ tenantId: this.db.ctx().tenantId, ...columns(dto) })
        .returning({ id: lawyers.id }),
    );
    await this.audit.record({ action: "lawyer_created", resource: "lawyer", resourceId: row!.id });
    return { id: row!.id };
  }

  async update(id: string, dto: LawyerSave): Promise<{ id: string }> {
    const updated = await this.db.tx((tx) =>
      tx
        .update(lawyers)
        .set({ ...columns(dto), updatedAt: new Date() })
        .where(eq(lawyers.id, id))
        .returning({ id: lawyers.id }),
    );
    if (updated.length === 0) throw new NotFoundException("not_found");
    await this.audit.record({ action: "lawyer_updated", resource: "lawyer", resourceId: id });
    return { id };
  }
}

function columns(dto: LawyerSave) {
  return {
    name: dto.name,
    barNo: dto.barNo || null,
    barCity: dto.barCity || null,
    phone: dto.phone || null,
    email: dto.email || null,
    commissionPct: String(dto.commissionPct),
    isActive: dto.isActive,
  };
}
