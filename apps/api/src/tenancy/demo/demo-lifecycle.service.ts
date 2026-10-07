import { Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { hashPassword } from "@yonetim/auth";
import { encryptField } from "@yonetim/core/crypto";
import { demoRequests, tenants } from "@yonetim/db";
import { provisionDemo } from "@yonetim/demo-seed";
import { demoReadyEmail, demoReminderEmail, sendEmail } from "@yonetim/emails";

import { env } from "../../infra/config/env";
import { DbService } from "../../infra/db/db.service";
import { translatorFor } from "../../infra/i18n/translator";
import {
  DEMO_PROVISION_TIMEOUT_MINUTES,
  DEMO_REMINDER_HOURS,
  appUrl,
  demoSettings,
  formatIstanbul,
  openDemoPassword,
  splitName,
} from "./demo-shared";

export interface DemoMaintenanceSummary {
  purged: number;
  reminded: number;
  timedOut: number;
  expiredLinks: number;
  orphans: number;
  failures: number;
}

/**
 * Demo hesabının yaşam döngüsü — kurulum, silme, hatırlatma.
 *
 * Worker çağırıyor (kuyruk + zamanlanmış iş); API yalnız superadmin'in elle
 * silmesinde. Bütün yazmalar baypas bağlamında (`yonetim_admin`), çünkü demo
 * talebi platform kaydı ve kurulum siteyi henüz yokken yaratıyor.
 */
@Injectable()
export class DemoLifecycleService {
  private readonly logger = new Logger(DemoLifecycleService.name);

  constructor(private readonly db: DbService) {}

  /* ------------------------------------------------------------ kurulum */

  /**
   * Onaylanmış talebin demo sitesini kurar. Tek transaction: hata olursa
   * hiçbir satır kalmaz, talep `failed` olur ve bağlantıdan yeniden denenebilir.
   * İkinci kez çalışırsa (kuyruk tekrarı) satır kilidi ve durum kontrolü
   * aynı talebin iki kez kurulmasını engeller.
   */
  async provision(requestId: string): Promise<"ready" | "skipped" | "failed"> {
    const started = Date.now();
    const settings = demoSettings();
    try {
      const outcome = await this.db.bypass("demo:provision", async (tx) => {
        const [row] = await tx.select().from(demoRequests).where(eq(demoRequests.id, requestId)).limit(1).for("update");
        if (!row || row.status !== "provisioning" || row.tenantIds.length > 0) return null;
        const password = openDemoPassword(row.passwordSealed, row.id);
        if (!password || !row.loginEmail) throw new Error("demo_credentials_missing");

        const now = new Date();
        const expiresAt = new Date(now.getTime() + settings.ttlHours * 3_600_000);
        const name = splitName(row.fullName);
        const key = env().FIELD_ENCRYPTION_KEY;
        const result = await provisionDemo(tx, {
          kind: row.kind === "company" ? "company" : "manager",
          code: row.code,
          now,
          expiresAt,
          manager: {
            firstName: name.firstName,
            lastName: name.lastName,
            loginEmail: row.loginEmail,
            passwordHash: await hashPassword(password),
          },
          phoneSlot: row.phoneSlot ?? 0,
          emailDomain: settings.emailDomain,
          encrypt: (plain, scope) => encryptField(plain, key, scope),
        });
        await tx
          .update(demoRequests)
          .set({
            status: "ready",
            readyAt: now,
            expiresAt,
            userId: result.userId,
            companyId: result.companyId,
            tenantIds: result.tenantIds,
            error: null,
            updatedAt: now,
          })
          .where(eq(demoRequests.id, row.id));
        return result;
      });
      if (!outcome) return "skipped";
      this.logger.log({ event: "demo.ready", requestId, sites: outcome.tenantIds.length, ms: Date.now() - started });
    } catch (error) {
      this.logger.error({ event: "demo.provision_failed", requestId, error: error instanceof Error ? error.message : String(error) });
      await this.markFailed(requestId, "provision_failed");
      return "failed";
    }

    // E-posta kurulumdan SONRA ve ayrı: gönderilemezse demo yine hazır,
    // bilgiler onay ekranında görünüyor.
    await this.sendReadyMail(requestId).catch((error: unknown) =>
      this.logger.error({ event: "demo.ready_mail_failed", requestId, error: String(error) }),
    );
    return "ready";
  }

  async markFailed(requestId: string, reason: string): Promise<void> {
    await this.db.bypass("demo:mark-failed", (tx) =>
      tx
        .update(demoRequests)
        .set({ status: "failed", error: reason, updatedAt: new Date() })
        .where(and(eq(demoRequests.id, requestId), eq(demoRequests.status, "provisioning"))),
    );
  }

  async sendReadyMail(requestId: string): Promise<void> {
    const data = await this.db.bypass("demo:ready-mail", async (tx) => {
      const [row] = await tx.select().from(demoRequests).where(eq(demoRequests.id, requestId)).limit(1);
      if (!row || row.status !== "ready" || !row.loginEmail || !row.expiresAt) return null;
      const sites = row.tenantIds.length
        ? await tx.select({ name: tenants.name }).from(tenants).where(inArray(tenants.id, row.tenantIds))
        : [];
      return { row, sites: sites.map((s) => s.name) };
    });
    if (!data) return;
    const { row, sites } = data;
    const password = openDemoPassword(row.passwordSealed, row.id);
    if (!password) return;
    const mail = demoReadyEmail(translatorFor("notification", "tr"), {
      name: splitName(row.fullName).firstName,
      loginUrl: appUrl(`/giris?e=${encodeURIComponent(row.loginEmail!)}`),
      loginEmail: row.loginEmail!,
      password,
      expiresAt: formatIstanbul(row.expiresAt!),
      sites,
    });
    const sent = await sendEmail({ to: row.email, subject: mail.subject, html: mail.html });
    if (!sent.ok) throw new Error(sent.error.message);
    await this.db.bypass("demo:ready-mail-mark", (tx) =>
      tx.update(demoRequests).set({ credentialsMailedAt: new Date() }).where(eq(demoRequests.id, row.id)),
    );
  }

  /* ------------------------------------------------------------ silme */

  /**
   * Talebin bütün demo sitelerini fiziksel olarak siler. Her site ayrı
   * transaction: biri hata verirse diğerleri yine silinir, talep `ready`
   * kalır ve sonraki bakım turunda yeniden denenir.
   */
  async purgeRequest(requestId: string, reason: string): Promise<{ status: string; tenants: number }> {
    const row = await this.db.bypass("demo:purge-load", async (tx) => {
      const [found] = await tx.select().from(demoRequests).where(eq(demoRequests.id, requestId)).limit(1);
      return found ?? null;
    });
    if (!row) return { status: "missing", tenants: 0 };

    let purged = 0;
    let failed = 0;
    for (const tenantId of row.tenantIds) {
      try {
        await this.purgeTenant(tenantId);
        purged += 1;
      } catch (error) {
        failed += 1;
        this.logger.error({ event: "demo.purge_tenant_failed", requestId, tenantId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (failed > 0) {
      await this.db.bypass("demo:purge-error", (tx) =>
        tx.update(demoRequests).set({ error: `purge_failed:${failed}`, updatedAt: new Date() }).where(eq(demoRequests.id, row.id)),
      );
      return { status: row.status, tenants: purged };
    }

    // Kişisel veriler: demo kullanıcısı ve şifreli parola gidiyor; talep
    // kaydı (iletişim bilgisi) satış takibi için kalıyor.
    const now = new Date();
    await this.db.bypass("demo:purge-finish", (tx) =>
      tx
        .update(demoRequests)
        .set({
          status: row.status === "pending" ? "cancelled" : "purged",
          purgedAt: now,
          passwordSealed: null,
          tenantIds: [],
          metadata: sql`${demoRequests.metadata} || ${JSON.stringify({ purgeReason: reason, purgedTenants: row.tenantIds.length })}::jsonb`,
          updatedAt: now,
        })
        .where(eq(demoRequests.id, row.id)),
    );
    this.logger.log({ event: "demo.purged", requestId, tenants: purged, reason });
    return { status: row.status === "pending" ? "cancelled" : "purged", tenants: purged };
  }

  /** Tek demo site — `app_purge_demo_tenant()` demo olmayan siteyi reddeder. */
  private async purgeTenant(tenantId: string): Promise<void> {
    await this.db.bypass(
      "demo:purge-tenant",
      (tx) => tx.execute(sql`SELECT app_purge_demo_tenant(${tenantId}::uuid)`),
      { allowLogPurge: true },
    );
  }

  /* ------------------------------------------------------------ bakım turu */

  async maintenance(now = new Date()): Promise<DemoMaintenanceSummary> {
    const summary: DemoMaintenanceSummary = { purged: 0, reminded: 0, timedOut: 0, expiredLinks: 0, orphans: 0, failures: 0 };

    // 1) Süresi dolan demolar.
    const expired = await this.db.bypass("demo:due-purge", (tx) =>
      tx
        .select({ id: demoRequests.id })
        .from(demoRequests)
        .where(and(eq(demoRequests.status, "ready"), lt(demoRequests.expiresAt, now))),
    );
    for (const { id } of expired) {
      const result = await this.purgeRequest(id, "expired").catch((error: unknown) => {
        this.logger.error({ event: "demo.purge_failed", requestId: id, error: String(error) });
        return null;
      });
      if (result?.status === "purged") summary.purged += 1;
      else summary.failures += 1;
    }

    // 2) Bitişe 3 saat kala hatırlatma (bir kez).
    const soon = new Date(now.getTime() + DEMO_REMINDER_HOURS * 3_600_000);
    const remind = await this.db.bypass("demo:due-reminder", (tx) =>
      tx
        .select()
        .from(demoRequests)
        .where(
          and(
            eq(demoRequests.status, "ready"),
            isNull(demoRequests.reminderSentAt),
            lt(demoRequests.expiresAt, soon),
            sql`${demoRequests.expiresAt} > ${now}`,
          ),
        ),
    );
    for (const row of remind) {
      const hours = Math.max(1, Math.round((row.expiresAt!.getTime() - now.getTime()) / 3_600_000));
      const mail = demoReminderEmail(translatorFor("notification", "tr"), {
        name: splitName(row.fullName).firstName,
        hours,
        signupUrl: appUrl("/kayit"),
      });
      const sent = await sendEmail({ to: row.email, subject: mail.subject, html: mail.html });
      if (sent.ok) {
        await this.db.bypass("demo:reminder-mark", (tx) =>
          tx.update(demoRequests).set({ reminderSentAt: now }).where(eq(demoRequests.id, row.id)),
        );
        summary.reminded += 1;
      } else {
        summary.failures += 1;
      }
    }

    // 3) Takılan kurulum (worker çöktü / kuyruk kayboldu). Kurulum tek
    // transaction olduğu için geride yarım site yok; talep tekrar denenebilir.
    const stuckBefore = new Date(now.getTime() - DEMO_PROVISION_TIMEOUT_MINUTES * 60_000);
    const stuck = await this.db.bypass("demo:stuck", (tx) =>
      tx
        .update(demoRequests)
        .set({ status: "failed", error: "timeout", updatedAt: now })
        .where(and(eq(demoRequests.status, "provisioning"), lt(demoRequests.updatedAt, stuckBefore)))
        .returning({ id: demoRequests.id }),
    );
    summary.timedOut = stuck.length;

    // 4) Bağlantısı tıklanmadan süresi dolan talepler — e-posta tekilliği
    // serbest kalsın (aynı kişi yeniden talep edebilsin).
    const links = await this.db.bypass("demo:expire-links", (tx) =>
      tx
        .update(demoRequests)
        .set({ status: "cancelled", error: "link_expired", updatedAt: now })
        .where(and(eq(demoRequests.status, "pending"), lt(demoRequests.tokenExpiresAt, now)))
        .returning({ id: demoRequests.id }),
    );
    summary.expiredLinks = links.length;

    // 5) Emniyet ağı: süresi 1 saatten fazla geçmiş ama hiçbir canlı talebe
    // bağlı olmayan demo site (ör. talep satırı elle silinmiş).
    const orphanBefore = new Date(now.getTime() - 3_600_000);
    const orphans = await this.db.bypass("demo:orphans", (tx) =>
      tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(
          and(
            eq(tenants.isDemo, true),
            lt(tenants.demoExpiresAt, orphanBefore),
            sql`NOT EXISTS (SELECT 1 FROM ${demoRequests} d WHERE ${tenants.id} = ANY(d.tenant_ids) AND d.status = 'ready')`,
          ),
        ),
    );
    for (const { id } of orphans) {
      await this.purgeTenant(id)
        .then(() => {
          summary.orphans += 1;
        })
        .catch((error: unknown) => {
          summary.failures += 1;
          this.logger.error({ event: "demo.orphan_purge_failed", tenantId: id, error: String(error) });
        });
    }

    return summary;
  }
}
