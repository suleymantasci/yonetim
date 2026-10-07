import { InjectQueue } from "@nestjs/bullmq";
import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import type { Queue } from "bullmq";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

import type {
  DemoRequestCreate,
  DemoRequestCreateResult,
  DemoStatusResult,
  PlatformDemoList,
  PlatformDemoPurgeResult,
} from "@yonetim/contracts";
import { errors, normalizePhone } from "@yonetim/core";
import { demoRequests, tenants, users } from "@yonetim/db";
import { demoConfirmEmail, sendEmail } from "@yonetim/emails";
import { QUEUE_DEMO, type DemoJobData } from "@yonetim/jobs";

import { DbService } from "../../infra/db/db.service";
import { translatorFor } from "../../infra/i18n/translator";
import {
  DEMO_MAX_ATTEMPTS,
  DEMO_TOKEN_TTL_MINUTES,
  appUrl,
  demoSettings,
  hashToken,
  isDisposableEmail,
  loginEmailFor,
  newDemoCode,
  newDemoPassword,
  newToken,
  openDemoPassword,
  sealDemoPassword,
  splitName,
} from "./demo-shared";
import { DemoLifecycleService } from "./demo-lifecycle.service";

type DemoRow = typeof demoRequests.$inferSelect;

/** Kullanıcıya dönen hatalar — panel bu kodlardan Türkçe metin seçiyor. */
function demoError(code: string, status = HttpStatus.BAD_REQUEST): HttpException {
  // Hata filtresi bilinmeyen kodu mesaj olarak taşıyor; panel o koddan
  // kullanıcıya gösterilecek metni seçiyor.
  return new HttpException(code, status);
}

/**
 * Demo hesabı talepleri — landing formu, onay bağlantısı, durum ekranı.
 *
 * GÜVENLİK KATMANLARI (hepsi sunucuda):
 *   * bal küpü alanı dolu → sessizce "gönderildi" (bot öğrenmesin),
 *   * tek kullanımlık / geçici e-posta servisleri reddedilir,
 *   * IP başına günlük talep sınırı, aynı anda yaşayan demo üst sınırı,
 *   * aynı e-postaya aynı anda tek canlı demo (veritabanında da tekil),
 *   * onay bağlantısı token'ının yalnız SHA-256'sı saklanır, 1 saat geçerli,
 *   * hesap ancak bağlantı tıklanınca açılır — başkasının adresine talep
 *     gönderen biri hesap açamaz, yalnız o kişiye bir e-posta düşer.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly db: DbService,
    private readonly lifecycle: DemoLifecycleService,
    @InjectQueue(QUEUE_DEMO) private readonly queue: Queue<DemoJobData>,
  ) {}

  /* ------------------------------------------------------------ talep */

  async create(
    dto: DemoRequestCreate,
    meta: { ip: string | null; userAgent: string | null },
  ): Promise<DemoRequestCreateResult> {
    const settings = demoSettings();
    if (!settings.enabled) throw demoError("demo_disabled", HttpStatus.FORBIDDEN);

    // Bal küpü: yanıt aynı, iş yok.
    if (dto.website && dto.website.trim() !== "") {
      this.logger.warn({ event: "demo.honeypot", ip: meta.ip });
      return { status: "sent" };
    }

    const phone = normalizePhone(dto.phone);
    if (!phone) throw demoError("invalid_phone");
    const email = dto.email.trim().toLowerCase();
    if (isDisposableEmail(email)) throw demoError("disposable_email");
    if (email.endsWith(`@${settings.emailDomain}`)) throw demoError("invalid_email");

    const now = new Date();
    const token = newToken();
    const tokenHash = hashToken(token);
    const tokenExpiresAt = new Date(now.getTime() + DEMO_TOKEN_TTL_MINUTES * 60_000);

    const outcome = await this.db.bypass("demo:request-create", async (tx) => {
      if (meta.ip) {
        const [ipCount] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(demoRequests)
          .where(and(eq(demoRequests.ip, meta.ip), gt(demoRequests.createdAt, new Date(now.getTime() - 86_400_000))));
        if ((ipCount?.n ?? 0) >= settings.perIpPerDay) return { kind: "ip_limit" as const };
      }

      const [live] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(demoRequests)
        .where(inArray(demoRequests.status, ["provisioning", "ready"]));
      if ((live?.n ?? 0) >= settings.maxLive) return { kind: "capacity" as const };

      const [existing] = await tx
        .select()
        .from(demoRequests)
        .where(and(eq(demoRequests.email, email), inArray(demoRequests.status, ["pending", "provisioning", "ready"])))
        .limit(1)
        .for("update");

      if (existing) {
        // Aynı kişi formu yeniden gönderdi. Bekleyen talep: yeni bağlantı
        // üretip yeniden gönder (eski bağlantı geçersizleşir). Canlı demo:
        // giriş bilgilerini yeniden gönder. İkisinde de 2 dakikada bir.
        if (now.getTime() - existing.updatedAt.getTime() < 120_000) return { kind: "throttled" as const };
        if (existing.status === "pending") {
          await tx
            .update(demoRequests)
            .set({ tokenHash, tokenExpiresAt, fullName: dto.fullName, phone, kind: dto.kind, updatedAt: now })
            .where(eq(demoRequests.id, existing.id));
          return { kind: "resend_confirm" as const, row: { ...existing, fullName: dto.fullName } };
        }
        await tx.update(demoRequests).set({ updatedAt: now }).where(eq(demoRequests.id, existing.id));
        return { kind: "resend_ready" as const, row: existing };
      }

      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newDemoCode();
        const inserted = await tx
          .insert(demoRequests)
          .values({
            code,
            fullName: dto.fullName,
            phone,
            email,
            kind: dto.kind,
            status: "pending",
            tokenHash,
            tokenExpiresAt,
            ip: meta.ip,
            userAgent: meta.userAgent?.slice(0, 500) ?? null,
            consentAt: now,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted[0]) return { kind: "created" as const, row: inserted[0] };
        // Çakışma kod üzerindeyse yeniden dene; e-posta üzerindeyse (eşzamanlı
        // ikinci gönderim) aynı talep zaten var demektir.
        const [sameEmail] = await tx
          .select({ id: demoRequests.id })
          .from(demoRequests)
          .where(and(eq(demoRequests.email, email), inArray(demoRequests.status, ["pending", "provisioning", "ready"])))
          .limit(1);
        if (sameEmail) return { kind: "throttled" as const };
      }
      throw errors.internal("demo_code_exhausted");
    });

    switch (outcome.kind) {
      case "ip_limit":
        this.logger.warn({ event: "demo.ip_limit", ip: meta.ip });
        throw demoError("demo_ip_limit", HttpStatus.TOO_MANY_REQUESTS);
      case "capacity":
        this.logger.warn({ event: "demo.capacity" });
        throw demoError("demo_capacity", HttpStatus.TOO_MANY_REQUESTS);
      case "throttled":
        return { status: "sent" };
      case "resend_ready":
        await this.lifecycle.sendReadyMail(outcome.row.id).catch((error: unknown) =>
          this.logger.error({ event: "demo.resend_ready_failed", error: String(error) }),
        );
        return { status: "sent" };
      case "created":
      case "resend_confirm":
        try {
          await this.sendConfirmMail(outcome.row, token);
        } catch (error) {
          // Yeni açılan talep e-postası gitmeden kalmasın: kişi yeniden
          // denediğinde "zaten talep var" sessizliğine düşerdi.
          if (outcome.kind === "created") {
            await this.db
              .bypass("demo:request-rollback", (tx) =>
                tx.delete(demoRequests).where(and(eq(demoRequests.id, outcome.row.id), eq(demoRequests.status, "pending"))),
              )
              .catch(() => undefined);
          }
          throw error;
        }
        this.logger.log({ event: `demo.${outcome.kind}`, requestId: outcome.row.id, kind: dto.kind });
        return { status: "sent" };
    }
  }

  private async sendConfirmMail(row: Pick<DemoRow, "id" | "fullName" | "email">, token: string): Promise<void> {
    const mail = demoConfirmEmail(translatorFor("notification", "tr"), {
      name: splitName(row.fullName).firstName,
      // Token parça (#) içinde: tarayıcı onu sunucuya hiç göndermiyor, yani
      // erişim kayıtlarında ve Referer başlığında görünmüyor.
      url: appUrl(`/demo/onay#t=${token}`),
      expiresMinutes: DEMO_TOKEN_TTL_MINUTES,
    });
    const sent = await sendEmail({ to: row.email, subject: mail.subject, html: mail.html });
    if (!sent.ok) {
      this.logger.error({ event: "demo.confirm_mail_failed", requestId: row.id, error: sent.error.message });
      throw demoError("mail_failed", HttpStatus.BAD_GATEWAY);
    }
  }

  /* ------------------------------------------------------------ onay */

  async confirm(token: string): Promise<DemoStatusResult> {
    const tokenHash = hashToken(token);
    const now = new Date();
    const settings = demoSettings();

    const decision = await this.db.bypass("demo:request-confirm", async (tx) => {
      const [row] = await tx.select().from(demoRequests).where(eq(demoRequests.tokenHash, tokenHash)).limit(1).for("update");
      if (!row) return { kind: "invalid" as const };

      const startable =
        (row.status === "pending" && row.tokenExpiresAt.getTime() >= now.getTime()) ||
        (row.status === "failed" && row.attempts < DEMO_MAX_ATTEMPTS && row.tenantIds.length === 0);

      if (row.status === "pending" && row.tokenExpiresAt.getTime() < now.getTime()) {
        await tx.update(demoRequests).set({ status: "cancelled", error: "link_expired", updatedAt: now }).where(eq(demoRequests.id, row.id));
        return { kind: "expired" as const };
      }
      if (!startable) return { kind: "current" as const, id: row.id };

      const [live] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(demoRequests)
        .where(inArray(demoRequests.status, ["provisioning", "ready"]));
      if ((live?.n ?? 0) >= settings.maxLive) return { kind: "capacity" as const };

      const password = newDemoPassword();
      const slot = await tx.execute<{ slot: number }>(sql`SELECT nextval('demo_phone_slot_seq')::int AS slot`);
      const phoneSlot = (slot as unknown as Array<{ slot: number }>)[0]?.slot ?? 0;
      await tx
        .update(demoRequests)
        .set({
          status: "provisioning",
          confirmedAt: row.confirmedAt ?? now,
          attempts: row.attempts + 1,
          loginEmail: loginEmailFor(row.code),
          passwordSealed: sealDemoPassword(password, row.id),
          phoneSlot,
          error: null,
          updatedAt: now,
        })
        .where(eq(demoRequests.id, row.id));
      return { kind: "start" as const, id: row.id };
    });

    switch (decision.kind) {
      case "invalid":
        throw demoError("demo_link_invalid", HttpStatus.NOT_FOUND);
      case "expired":
        throw demoError("demo_link_expired", HttpStatus.GONE);
      case "capacity":
        throw demoError("demo_capacity", HttpStatus.TOO_MANY_REQUESTS);
      case "start":
        await this.queue
          .add("demo.provision", { requestId: decision.id }, {
            jobId: `demo-provision-${decision.id}-${Date.now()}`,
            attempts: 1,
            removeOnComplete: { count: 200 },
            removeOnFail: { count: 200 },
          })
          .catch(async (error: unknown) => {
            // Kuyruk yoksa talep "provisioning"de takılı kalmasın.
            this.logger.error({ event: "demo.enqueue_failed", requestId: decision.id, error: String(error) });
            await this.lifecycle.markFailed(decision.id, "queue_unavailable");
          });
        this.logger.log({ event: "demo.confirmed", requestId: decision.id });
        break;
      case "current":
        break;
    }
    return this.status(token);
  }

  /* ------------------------------------------------------------ durum */

  async status(token: string): Promise<DemoStatusResult> {
    const tokenHash = hashToken(token);
    const result = await this.db.bypass("demo:request-status", async (tx) => {
      const [row] = await tx.select().from(demoRequests).where(eq(demoRequests.tokenHash, tokenHash)).limit(1);
      if (!row) return null;
      const sites =
        row.status === "ready" && row.tenantIds.length > 0
          ? await tx.select({ name: tenants.name }).from(tenants).where(inArray(tenants.id, row.tenantIds))
          : [];
      return { row, sites: sites.map((s) => s.name) };
    });
    if (!result) throw demoError("demo_link_invalid", HttpStatus.NOT_FOUND);
    const { row, sites } = result;
    const ready = row.status === "ready";
    return {
      status: row.status as DemoStatusResult["status"],
      kind: row.kind as DemoStatusResult["kind"],
      fullName: row.fullName,
      loginEmail: ready ? row.loginEmail : null,
      password: ready ? openDemoPassword(row.passwordSealed, row.id) : null,
      expiresAt: ready ? row.expiresAt : null,
      sites,
      error: row.status === "failed" ? (row.attempts >= DEMO_MAX_ATTEMPTS ? "attempts_exhausted" : "provision_failed") : null,
    };
  }

  /* ------------------------------------------------------------ platform */

  async list(): Promise<PlatformDemoList> {
    const settings = demoSettings();
    return this.db.bypass("demo:platform-list", async (tx) => {
      const rows = await tx.select().from(demoRequests).orderBy(desc(demoRequests.createdAt)).limit(300);
      const [totals] = await tx.execute<{ live: number; pending: number; last7: number; converted: number }>(sql`
        SELECT
          count(*) FILTER (WHERE status IN ('provisioning','ready'))::int AS live,
          count(*) FILTER (WHERE status = 'pending')::int AS pending,
          count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last7,
          count(DISTINCT d.email) FILTER (WHERE EXISTS (
            SELECT 1 FROM ${users} u WHERE lower(u.email) = d.email AND u.is_demo = false
          ))::int AS converted
        FROM ${demoRequests} d
      `) as unknown as Array<{ live: number; pending: number; last7: number; converted: number }>;
      return {
        rows: rows.map((r) => ({
          id: r.id,
          code: r.code,
          fullName: r.fullName,
          email: r.email,
          phone: r.phone,
          kind: r.kind as PlatformDemoList["rows"][number]["kind"],
          status: r.status as PlatformDemoList["rows"][number]["status"],
          ip: r.ip,
          loginEmail: r.loginEmail,
          siteCount: r.tenantIds.length,
          createdAt: r.createdAt,
          confirmedAt: r.confirmedAt,
          readyAt: r.readyAt,
          expiresAt: r.expiresAt,
          reminderSentAt: r.reminderSentAt,
          purgedAt: r.purgedAt,
          error: r.error,
        })),
        totals: {
          live: totals?.live ?? 0,
          pending: totals?.pending ?? 0,
          last7Days: totals?.last7 ?? 0,
          converted: totals?.converted ?? 0,
        },
        limits: { maxLive: settings.maxLive, perIpPerDay: settings.perIpPerDay, ttlHours: settings.ttlHours },
      };
    });
  }

  /**
   * Superadmin "şimdi sil". Demo kodu yazılarak onaylanır: liste ekranında
   * yanlış satıra tıklamak tek başına veri sildirmesin.
   */
  async purgeNow(id: string, confirmCode: string, actorId: string): Promise<PlatformDemoPurgeResult> {
    const row = await this.db.bypass("demo:platform-get", async (tx) => {
      const [found] = await tx.select().from(demoRequests).where(eq(demoRequests.id, id)).limit(1);
      return found ?? null;
    });
    if (!row) throw errors.notFound("demo_not_found");
    if (row.code !== confirmCode.trim().toLowerCase()) throw demoError("confirm_code_mismatch");
    if (row.status === "provisioning") throw demoError("demo_provisioning", HttpStatus.CONFLICT);
    const purged = await this.lifecycle.purgeRequest(row.id, `manual:${actorId}`);
    return { id: row.id, status: purged.status as PlatformDemoPurgeResult["status"], purgedTenants: purged.tenants };
  }
}
