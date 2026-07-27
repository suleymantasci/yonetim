import { Injectable } from "@nestjs/common";

import { auditLogs, dataAccessLogs } from "@yonetim/db";

import { DbService } from "../../infra/db/db.service";

export interface AuditEntry {
  action: string;
  resource: string;
  resourceId?: string;
  diff?: Record<string, { from: unknown; to: unknown }>;
  reason?: string;
}

/**
 * Denetim kütüğü ve KVKK erişim kaydı — MIMARI-PLAN §8.4.
 *
 * Bugün bu iki kayıt `apps/app/src/lib/audit.ts` içinde, yani **render
 * katmanında** yazılıyor. HTTP'ye geçişte buraya taşınıyor ve bir tuzak
 * açılıyor: log "API 50 kişi döndürdü" derken kullanıcının ekranında 12 kişi
 * olabilir.
 *
 * Kural: kayıt **interceptor'da değil, servis içinde** yazılır ve **yanıtta
 * dönen** kümeyi kullanır. Sayfalama sunucuda yapıldığı için API'nin döndürdüğü
 * küme = ekrandaki küme; kaydın doğruluğu tasarımdan geliyor, disiplinden değil.
 */
@Injectable()
export class AuditService {
  constructor(private readonly db: DbService) {}

  async record(entry: AuditEntry): Promise<void> {
    const ctx = this.db.ctx();
    // Kütük append-only; DB trigger'ı UPDATE/DELETE'i zaten engelliyor.
    await this.db.bypass("audit:write", async (tx) => {
      await tx.insert(auditLogs).values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        diff: entry.diff,
        reason: entry.reason ?? ctx.changeReason,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        impersonatedBy: ctx.impersonatedBy,
      });
    });
  }

  /**
   * Kişisel veri görüntülemesi (KVKK md.12 izlenebilirlik).
   *
   * `subjectUserIds` **yanıtta dönen** kişi kümesidir — §8.4'ün tek kuralı.
   * Boş küme yazılmaz: "hiç kimseye bakılmadı" satırı kütüğü şişirir.
   */
  async recordDataAccess(params: {
    subjectUserIds: string[];
    dataCategory: string;
    action: "view" | "export" | "share" | "update" | "delete";
    purpose?: string;
  }): Promise<void> {
    const unique = [...new Set(params.subjectUserIds)].filter(Boolean);
    if (unique.length === 0) return;

    const ctx = this.db.ctx();
    await this.db.bypass("kvkk:data-access", async (tx) => {
      await tx.insert(dataAccessLogs).values(
        unique.map((subjectUserId) => ({
          tenantId: ctx.tenantId,
          subjectUserId,
          accessorUserId: ctx.userId,
          dataCategory: params.dataCategory,
          action: params.action,
          purpose: params.purpose,
          ip: ctx.ip,
        })),
      );
    });
  }
}

/** İki nesne arasındaki farkı denetim diff formatına çevirir. */
export function diffOf<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) diff[key] = { from: before[key], to: value };
  }
  return diff;
}
