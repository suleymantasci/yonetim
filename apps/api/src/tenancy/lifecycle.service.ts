import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";

import { siteConfig } from "@yonetim/config";
import type { TenantLifecycleResult, TenantLifecycleState } from "@yonetim/contracts";
import { errors, type TenantStatus } from "@yonetim/core";
import type { Database } from "@yonetim/db";
import { subscriptions, tenants, users } from "@yonetim/db";

import { AuditService } from "../governance/audit/audit.service";
import { ContextResolver } from "../identity/context-resolver.service";
import { DbService } from "../infra/db/db.service";

const DAY_MS = 86_400_000;

/** Arşiv sonrası geri dönülecek durum bilinmiyorsa buraya düşer. */
const DEFAULT_RESTORE_STATUS: TenantStatus = "active";

/**
 * Site yaşam döngüsü — pasife alma, geri açma, kalıcı tasfiye.
 *
 * NEDEN BU SERVİS VARDI DA YOKTU: `tenant_status` enum'unda `archived` ve
 * `cancelled` baştan beri duruyordu, `tenants` tablosunda `cancelled_at` ve
 * `suspension_reason` sütunları da. Ama bu sütunlara yazan **tek bir satır kod
 * yoktu**: bir yönetici bir siteyle işini bitirdiğinde yapabileceği hiçbir şey
 * yoktu, site sonsuza kadar aktif ve faturalanabilir kalıyordu. Bu servis o
 * yazma yolunu açıyor.
 *
 * ÜÇ SEVİYE, İKİ SORUMLU (2026-07-29 kararı):
 *  1. **Arşivle** — yönetici yapar (`tenant:archive`). Site salt-okunur olur,
 *     faturalama durur, veri **silinmez**. 90 gün geri alınabilir.
 *  2. **Geri aç** — yönetici yapar, pencere içinde. Site arşivden önceki
 *     durumuna döner (denemedeyse denemeye, aktifse aktife).
 *  3. **Kalıcı sil** — yalnız süper-admin (`tenant:delete`). Geri alınamaz.
 *
 * Bu ayrımın sebebi: arşivleme geri alınabilir ve kararı yönetimin kendi işi;
 * kalıcı tasfiye geri alınamaz ve bir sitenin tüm aidat/borç/karar defteri
 * geçmişini yok ediyor. Tek yetkiyle ifade edilseydi, yöneticiye "işim bitti"
 * deme hakkı vermek aynı anda geçmişi imha etme hakkı vermek olurdu.
 *
 * KALICI SİLME SATIRI GERÇEKTEN SİLMİYOR: `deleted_at` işaretliyor. Fatura,
 * denetim kütüğü ve KVKK kayıtları platformun yasal yükümlülüğü ve onlar
 * `tenant_id` ile bu satıra bağlı; satırı `DELETE` etmek (şemadaki
 * `ON DELETE cascade` zincirleriyle) kesilmiş faturaların dayanağını da
 * götürürdü. Veri **erişilemez** hâle geliyor: `deleted_at IS NULL` filtresi
 * kimlik çözümlemesinin her yolunda var, yani oturum bile açılamıyor.
 */
@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly resolver: ContextResolver,
  ) {}

  /* ------------------------------------------------- okuma (yönetici) */

  async state(): Promise<TenantLifecycleState> {
    const ctx = this.db.ctx();
    const row = await this.db.bypass("lifecycle:state", async (tx) =>
      this.readOne(tx, ctx.tenantId),
    );
    if (!row) throw new NotFoundException("tenant_not_found");
    return row;
  }

  /* ------------------------------------------------ arşivle (yönetici) */

  /**
   * Siteyi arşive alır. `tenantId` verilmezse bağlamdaki site — yönetici kendi
   * sitesini kapatıyor; süper-admin panelinden çağrıldığında hedef açıkça
   * geliyor.
   */
  async archive(reason: string, tenantId?: string): Promise<TenantLifecycleResult> {
    const target = tenantId ?? this.db.ctx().tenantId;
    const recoveryDays = siteConfig.billing.archiveRecoveryDays;

    const result = await this.db.bypass("lifecycle:archive", async (tx) => {
      const [before] = await tx
        .select({
          id: tenants.id,
          status: tenants.status,
          name: tenants.name,
        })
        .from(tenants)
        .where(and(eq(tenants.id, target), isNull(tenants.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("tenant_not_found");
      if (before.status === "archived") {
        // Tekrar arşivlemek `purge_after_at`'ı ileri atardı: pencereyi her
        // düğme basışında sıfırlamak, tasfiyeyi süresiz erteleme yolu olurdu.
        throw errors.validation("already_archived");
      }

      const now = new Date();
      const purgeAfterAt = new Date(now.getTime() + recoveryDays * DAY_MS);

      await tx
        .update(tenants)
        .set({
          status: "archived",
          statusBeforeArchive: before.status,
          archivedAt: now,
          archivedBy: this.db.ctx().userId ?? null,
          purgeAfterAt,
          suspensionReason: reason,
          cancelledAt: now,
          updatedAt: now,
        })
        .where(eq(tenants.id, target));

      /*
       * Abonelik de duruyor. Site salt-okunur olurken faturalamanın devam
       * etmesi, kullanmadığı bir hizmetin parasını ödemeye devam eden bir
       * müşteri bırakırdı — iade talebi olarak geri gelirdi.
       */
      await tx
        .update(subscriptions)
        .set({ status: "archived", cancelledAt: now, updatedAt: now })
        .where(eq(subscriptions.tenantId, target));

      return { id: before.id, name: before.name, purgeAfterAt, previous: before.status };
    });

    await this.audit.record({
      action: "tenant_archived",
      resource: "tenant",
      resourceId: result.id,
      reason,
      diff: {
        status: { from: result.previous, to: "archived" },
        purgeAfterAt: { from: null, to: result.purgeAfterAt },
      },
    });

    /*
     * Arşivleyen kişinin kendi oturum önbelleği eski durumu 60 sn daha
     * taşıyordu; `TenantWritableGuard` bağlamdaki `tenantStatus`'a bakıyor,
     * yani düşürülmezse yönetici arşivledikten sonra bir dakika daha
     * yazabilirdi. Kararın etkisi kendi ekranında **anında** görünmeli.
     */
    await this.dropSessionsFor(target);

    this.logger.log({ event: "tenant.archived", tenantId: target, recoveryDays });
    return { id: result.id, status: "archived", purgeAfterAt: result.purgeAfterAt };
  }

  /* ------------------------------------------------- geri aç */

  async restore(reason: string, tenantId?: string): Promise<TenantLifecycleResult> {
    const target = tenantId ?? this.db.ctx().tenantId;
    const isPlatform = this.db.ctx().roles.some(
      (role) => role === "super_admin" || role === "support_agent",
    );

    const result = await this.db.bypass("lifecycle:restore", async (tx) => {
      const [before] = await tx
        .select({
          id: tenants.id,
          status: tenants.status,
          statusBeforeArchive: tenants.statusBeforeArchive,
          purgeAfterAt: tenants.purgeAfterAt,
        })
        .from(tenants)
        .where(and(eq(tenants.id, target), isNull(tenants.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("tenant_not_found");
      if (before.status !== "archived") throw errors.validation("not_archived");

      /*
       * Pencere dolduysa yönetici geri açamaz, süper-admin açabilir.
       *
       * Sertlik bilinçli: pencerenin bir anlamı olmalı, yoksa "90 gün" bir
       * tavsiyeye dönüşür ve tasfiye hiç çalışmaz. Ama sertliğin bir kaçış
       * kapısı da olmalı — müşteri 95. günde arayıp "yanlışlıkla kapattık"
       * dediğinde, veri hâlâ ordayken cevabın "elden bir şey gelmez" olması
       * kimseye hizmet etmez. Kaçış kapısı destek ekibinde, kullanıcıda değil.
       */
      const expired =
        before.purgeAfterAt !== null && before.purgeAfterAt.getTime() < Date.now();
      if (expired && !isPlatform) throw errors.validation("recovery_window_expired");

      const now = new Date();
      const restored: TenantStatus =
        (before.statusBeforeArchive as TenantStatus | null) ?? DEFAULT_RESTORE_STATUS;

      await tx
        .update(tenants)
        .set({
          status: restored,
          statusBeforeArchive: null,
          archivedAt: null,
          archivedBy: null,
          purgeAfterAt: null,
          suspensionReason: null,
          cancelledAt: null,
          updatedAt: now,
        })
        .where(eq(tenants.id, target));

      /*
       * Abonelik geri açılırken `trialing` mi `active` mi olacağı siteden
       * türetiliyor: denemedeyken arşivlenen site geri açıldığında ücretli
       * duruma geçmemeli. Ödemesi alınmamış bir hesabı `active` yapmak,
       * faturası kesilmemiş bir aboneliği "tahsil edildi" saymak olurdu.
       */
      await tx
        .update(subscriptions)
        .set({
          status: restored === "trial" ? "trialing" : "active",
          cancelledAt: null,
          updatedAt: now,
        })
        .where(eq(subscriptions.tenantId, target));

      return { id: before.id, restored, expired };
    });

    await this.audit.record({
      action: "tenant_restored",
      resource: "tenant",
      resourceId: result.id,
      reason,
      diff: { status: { from: "archived", to: result.restored } },
    });

    await this.dropSessionsFor(target);
    this.logger.log({
      event: "tenant.restored",
      tenantId: target,
      status: result.restored,
      afterWindow: result.expired,
    });
    return { id: result.id, status: result.restored, purgeAfterAt: null };
  }

  /* ------------------------------------------- kalıcı sil (süper-admin) */

  /**
   * Kalıcı tasfiye — yalnız `tenant:delete` (süper-admin).
   *
   * Kurtarma penceresi dolmadan da çalışabiliyor: KVKK silme talebi ya da
   * müşterinin açık isteği pencereyi beklemez. Ama **arşivden geçmek zorunlu**:
   * aktif bir siteyi tek çağrıda yok etmek, yanlış id ile yapılmış bir isteğin
   * geri dönüşü olmayan sonuç doğurması demekti. Arşiv adımı hem bir onay
   * mekanizması hem de "bu site gerçekten kullanım dışı mı" kanıtı.
   */
  async purge(reason: string, tenantId: string): Promise<TenantLifecycleResult> {
    const result = await this.db.bypass("lifecycle:purge", async (tx) => {
      const [before] = await tx
        .select({ id: tenants.id, status: tenants.status, name: tenants.name })
        .from(tenants)
        .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("tenant_not_found");
      if (before.status !== "archived") throw errors.validation("archive_required_first");

      const now = new Date();
      await tx
        .update(tenants)
        .set({
          status: "cancelled",
          deletedAt: now,
          landingPublished: false,
          purgeAfterAt: null,
          updatedAt: now,
        })
        .where(eq(tenants.id, tenantId));

      await tx
        .update(subscriptions)
        .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
        .where(eq(subscriptions.tenantId, tenantId));

      return { id: before.id, name: before.name };
    });

    await this.audit.record({
      action: "tenant_purged",
      resource: "tenant",
      resourceId: result.id,
      reason,
      diff: { deletedAt: { from: null, to: new Date() } },
    });

    await this.dropSessionsFor(tenantId);
    this.logger.warn({ event: "tenant.purged", tenantId, name: result.name });
    return { id: result.id, status: "cancelled", purgeAfterAt: null };
  }

  /* ------------------------------------------------------------ ortak */

  /**
   * Tek sitenin yaşam döngüsü satırı — yönetici ekranı ve süper-admin
   * detayı aynı hesabı kullansın diye burada.
   */
  async readOne(tx: Database, tenantId: string): Promise<TenantLifecycleState | null> {
    const rows = await tx
      .select({
        id: tenants.id,
        name: tenants.name,
        status: tenants.status,
        archivedAt: tenants.archivedAt,
        purgeAfterAt: tenants.purgeAfterAt,
        reason: tenants.suspensionReason,
        archivedByFirst: users.firstName,
        archivedByLast: users.lastName,
      })
      .from(tenants)
      .leftJoin(users, eq(users.id, tenants.archivedBy))
      .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const archived = row.status === "archived";
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      archivedAt: row.archivedAt,
      archivedByName:
        [row.archivedByFirst, row.archivedByLast].filter(Boolean).join(" ") || null,
      purgeAfterAt: row.purgeAfterAt,
      archiveReason: archived ? row.reason : null,
      daysLeftToRecover: daysLeft(row.purgeAfterAt),
      recoveryWindowDays: siteConfig.billing.archiveRecoveryDays,
      canArchive: !archived && row.status !== "cancelled",
      canRestore: archived,
    };
  }

  /**
   * Tasfiye penceresi dolmuş arşivler — `billing.archive-purge` job'ı için.
   *
   * Silmeyi **kendisi yapmıyor**, listeyi döndürüyor: otomatik ve geri dönüşü
   * olmayan bir imha, tek bir hatalı tarih hesabıyla müşteri verisi kaybına
   * dönüşür. Job bu listeyi süper-admin kuyruğuna düşürüyor, karar insanda
   * kalıyor.
   */
  async purgeCandidates(tx: Database): Promise<Array<{ id: string; name: string }>> {
    return tx
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(
        and(
          eq(tenants.status, "archived"),
          isNull(tenants.deletedAt),
          sql`${tenants.purgeAfterAt} IS NOT NULL AND ${tenants.purgeAfterAt} < now()`,
        ),
      );
  }

  /**
   * Sitenin oturumlarını düşürür.
   *
   * `TenantWritableGuard` bağlamdaki `tenantStatus`'a bakıyor ve o değer oturum
   * önbelleğinde 60 sn yaşıyor; düşürülmezse arşivleme bir dakika gecikmeli
   * etkili olurdu. Oturumlar silinmiyor — amaç yetkiyi tazelemek, kullanıcıyı
   * sistemden atmak değil: arşivlenmiş sitenin geçmişi hâlâ okunabilmeli.
   */
  private async dropSessionsFor(tenantId: string): Promise<void> {
    await this.resolver
      .invalidateTenantSessions(tenantId)
      .catch((error: unknown) => {
        // Önbellek düşmezse kural en fazla 60 sn gecikir; isteği düşürmeye
        // değmez, ama sessiz kalmamalı.
        this.logger.warn({
          event: "lifecycle.session_invalidate_failed",
          tenantId,
          error: String(error),
        });
      });
  }
}

/** Kalan gün — negatifse 0. Tek yerde, hem yönetici hem platform ekranı için. */
function daysLeft(purgeAfterAt: Date | null): number | null {
  if (!purgeAfterAt) return null;
  const ms = purgeAfterAt.getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}
