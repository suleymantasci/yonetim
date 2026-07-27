import { Injectable, NotFoundException } from "@nestjs/common";

import { siteConfig } from "@yonetim/config";
import type {
  AuditDetail,
  AuditListQuery,
  AuditListResponse,
} from "@yonetim/contracts";

import { AuditRepository } from "./audit.repository";

/**
 * Denetim kütüğü okuma akışı — MIMARI-PLAN §6.4 `governance/audit`.
 *
 * Yazma `AuditService`'te ve **yalnız** iş akışının içinden çağrılıyor;
 * burada bilinçli olarak hiçbir yazma yok. Bu ayrım kütüğün değerini
 * koruyor: dışarıya açık bir "kayıt oluştur" ucu olsaydı, uydurulmuş bir
 * satır gerçek olandan ayırt edilemezdi.
 */
@Injectable()
export class AuditReadService {
  constructor(private readonly repo: AuditRepository) {}

  async list(q: AuditListQuery): Promise<AuditListResponse> {
    const data = await this.repo.list(q);

    return {
      rows: data.rows.map((row) => ({
        id: row.id,
        action: row.action,
        resource: row.resource,
        resourceId: row.resourceId ?? null,
        // Listede diff'in kendisi değil **kaç alan değiştiği**: diff kişisel
        // veri taşıyabiliyor ve liste ekranı onu göstermek için yanlış yer.
        changeCount: countChanges(row.diff),
        reason: row.reason,
        ip: row.ip,
        actorName: row.actorName,
        impersonatedBy: row.impersonatedBy ?? null,
        createdAt: row.createdAt,
      })),
      meta: {
        page: q.page,
        perPage: q.perPage,
        total: data.total,
        pageCount: Math.max(1, Math.ceil(data.total / q.perPage)),
      },
      facets: {
        actions: data.actions.map((a) => ({
          id: a.value,
          label: a.value,
          count: a.count,
        })),
        resources: data.resources.map((r) => ({
          id: r.value,
          label: r.value,
          count: r.count,
        })),
      },
      retentionDays: siteConfig.legal.logRetentionDays,
    };
  }

  async detail(id: string): Promise<AuditDetail> {
    const found = await this.repo.detail(id);
    if (!found) throw new NotFoundException("not_found");

    const { row, actorName } = found;
    return {
      id: row.id,
      action: row.action,
      resource: row.resource,
      resourceId: row.resourceId ?? null,
      changeCount: countChanges(row.diff),
      reason: row.reason,
      ip: row.ip,
      actorName,
      impersonatedBy: row.impersonatedBy ?? null,
      createdAt: row.createdAt,
      diff: (row.diff as AuditDetail["diff"]) ?? null,
      userAgent: row.userAgent,
    };
  }
}

function countChanges(diff: unknown): number {
  return diff && typeof diff === "object" ? Object.keys(diff).length : 0;
}
