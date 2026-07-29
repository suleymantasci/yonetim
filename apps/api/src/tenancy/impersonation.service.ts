import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { createSession, destroySession } from "@yonetim/auth";
import type { ImpersonateResult } from "@yonetim/contracts";
import { errors } from "@yonetim/core";

import { AuditService } from "../governance/audit/audit.service";
import { ContextResolver } from "../identity/context-resolver.service";
import { DbService } from "../infra/db/db.service";

/**
 * Impersonation süresi.
 *
 * 30 dakika: destek görüşmesinin doğal uzunluğu. Uzun tutmanın maliyeti,
 * kapatılması unutulan bir sekmenin müşterinin kişisel verisine yarım gün
 * açık kalması; kısa tutmanın maliyeti destek ekibinin yeniden başlatması.
 * İkincisi ucuz.
 */
const IMPERSONATION_MINUTES = 30;

/**
 * Hesaba geçiş — SPEC Bölüm 18.2.
 *
 * NEDEN BUGÜNE KADAR ÇALIŞMIYORDU: altyapının neredeyse tamamı yazılmıştı —
 * `sessions.impersonated_by` sütunu, `audit_logs.impersonated_by`,
 * `createSession({ impersonatedBy })` parametresi, `impersonationAudit()`
 * yardımcısı, bağlam boyunca taşınan alan. Eksik olan tek şey **başlatan
 * uçtu**: `createSession`'ı çağıran iki yer de bu parametreyi hiç geçmiyordu.
 * Süper-admin ekranındaki "impersonation" kutusu bu yüzden bilgi metninden
 * ibaretti.
 *
 * YALNIZ `super_admin`: yetki `admin:impersonate` ve RBAC matrisinde
 * `support_agent` bu izne sahip **değil**. Destek personelinin salt-okunur
 * finans görüşü var ama başkasının kimliğine bürünmesi yok — impersonation
 * yazma yetkisi de taşıyor ve o yetkiyi devretmek denetim izini bulanıklaştırır.
 *
 * KVKK: her aksiyon `impersonated_by` ile ayrı loglanıyor (kural zaten
 * `AuditService.record` içinde, bağlamdaki alanı okuyor). Geçişin **kendisi**
 * de loglanıyor ve gerekçe zorunlu — "hangi destek talebi için girildi"
 * sorusunun cevabı olmadan erişim meşru sayılamaz.
 */
@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly resolver: ContextResolver,
  ) {}

  async start(params: {
    userId: string;
    tenantId: string;
    reason: string;
  }): Promise<ImpersonateResult> {
    const adminUserId = this.db.ctx().userId;
    if (!adminUserId) throw errors.unauthorized("admin_identity_required");
    if (adminUserId === params.userId) {
      // Kendine geçmek işlevsiz ama zararsız değil: denetim kütüğüne "X, X
      // adına işlem yaptı" satırları düşer ve gerçek impersonation
      // kayıtlarının arasında gürültü yapar.
      throw errors.validation("cannot_impersonate_self");
    }

    const target = await this.db.bypass("platform:impersonate-target", async (tx) => {
      const rows = (await tx.execute(sql`
        SELECT
          u.id, u.first_name, u.last_name, u.email, u.platform_role,
          t.slug AS tenant_slug, t.status AS tenant_status,
          EXISTS (
            SELECT 1 FROM memberships m
            WHERE m.user_id = u.id AND m.tenant_id = t.id AND m.deleted_at IS NULL
          ) AS is_member
        FROM users u
        CROSS JOIN tenants t
        WHERE u.id = ${params.userId} AND u.deleted_at IS NULL
          AND t.id = ${params.tenantId} AND t.deleted_at IS NULL
        LIMIT 1
      `)) as unknown as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        platform_role: string | null;
        tenant_slug: string;
        tenant_status: string;
        is_member: boolean;
      }>;
      return rows[0] ?? null;
    });

    if (!target) throw new NotFoundException("target_not_found");

    /*
     * Üyelik şartı: hedef kullanıcı o sitede üye olmalı.
     *
     * Olmasa da teknik olarak oturum açılabilirdi (`resolveTenantForUser`
     * slug'a göre tenant seçiyor) ama sonuç anlamsız olurdu: kullanıcının o
     * sitede hiç rolü olmadığı için panel boş açılır, destek ekibi de
     * "müşterinin gördüğünü görmek" amacına ulaşamaz. Daha kötüsü, kontrol
     * yoksa uç "herhangi bir kullanıcı kimliğiyle herhangi bir siteye gir"
     * yüzeyine dönüşürdü.
     */
    if (!target.is_member) throw errors.validation("target_not_member_of_tenant");

    /*
     * Başka bir platform kullanıcısına geçiş yasak. İki süper-admin'in
     * birbirine geçebilmesi, denetim izinde "kim yaptı" sorusunun cevabını
     * zincire çevirirdi — ve zincirin bir halkası yetki yükseltme yolu olur.
     */
    if (target.platform_role) throw errors.validation("cannot_impersonate_platform_user");

    const { token, expiresAt } = await createSession({
      userId: params.userId,
      tenantId: params.tenantId,
      impersonatedBy: adminUserId,
      expiresInMinutes: IMPERSONATION_MINUTES,
    });

    await this.audit.record({
      action: "impersonation_started",
      resource: "user",
      resourceId: params.userId,
      reason: params.reason,
      diff: {
        tenantId: { from: null, to: params.tenantId },
        expiresAt: { from: null, to: expiresAt },
      },
    });

    this.logger.warn({
      event: "platform.impersonation_started",
      adminUserId,
      targetUserId: params.userId,
      tenantId: params.tenantId,
      expiresAt,
    });

    return {
      token,
      expiresAt,
      targetUserName:
        [target.first_name, target.last_name].filter(Boolean).join(" ") ||
        target.email ||
        "—",
      tenantSlug: target.tenant_slug,
    };
  }

  /**
   * Geçişi bitirir — impersonation oturumunu **siler**.
   *
   * Süresinin dolmasını beklemek yetmez: destek görüşmesi bittiğinde erişim de
   * bitmeli, 30 dakikanın kalanı boyunca açık kalmamalı. Yöneticinin kendi
   * oturumu bu çağrıdan etkilenmiyor; onun çerezi `apps/app` tarafında ayrı
   * tutuluyor ve geri dönüşte yerine konuyor.
   */
  async stop(impersonationToken: string): Promise<{ ok: true }> {
    const ctx = this.db.ctx();
    if (!ctx.impersonatedBy) throw errors.validation("not_impersonating");

    await this.audit.record({
      action: "impersonation_ended",
      resource: "user",
      resourceId: ctx.userId ?? "",
      reason: "Süper admin hesaba geçişi bitirdi.",
    });

    await destroySession(impersonationToken);
    /*
     * Kaydı silmek yetmiyor: `ContextResolver` çözülmüş kimliği Redis'te 60 sn
     * tutuyor ve o pencerede veritabanına hiç bakmıyor. Düşürülmezse "geçişten
     * çıktım" dedikten sonra jeton bir dakika daha müşteri hesabında geçerli
     * kalırdı — çıkış düğmesinin kapatması gereken şeyin tam olarak kendisi.
     */
    await this.resolver.invalidateSession(impersonationToken);
    this.logger.log({
      event: "platform.impersonation_ended",
      adminUserId: ctx.impersonatedBy,
      targetUserId: ctx.userId,
    });
    return { ok: true };
  }
}
