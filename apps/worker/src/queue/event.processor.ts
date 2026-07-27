import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { QUEUE_EVENTS } from "@yonetim/jobs";
import {
  dispatch,
  route,
  ruleFor,
  type Audience,
  type DomainEventPayload,
  type RecipientProfile,
} from "@yonetim/notifications";
import { memberships, notifications, unitOccupancies, users } from "@yonetim/db";
import { hasPermission } from "@yonetim/auth/guard";
import type { Role } from "@yonetim/core";

import { DbService } from "@api/infra/db/db.service";

import { JobContext } from "./job-context";

/**
 * Olay → bildirim tüketicisi — GAP 4.6.5 (MIMARI-PLAN §10).
 *
 * ÜÇ ADIM, ÜÇ AYRI SORUMLULUK:
 *
 *   1. `ruleFor()`  — bu olay bildirim doğurur mu, kime? (`policy.ts`)
 *   2. `route()`    — bu kişiye hangi kanaldan, ne zaman? (`router.ts`)
 *   3. `dispatch()` — gönder ve sonucu raporla.
 *
 * UYGULAMA İÇİ KAYIT HER ZAMAN ÖNCE YAZILIYOR. Gönderim başarısız olsa bile
 * panelde bildirim görünür: bir borcun doğduğunu kimseye söylememek, iletişim
 * tercihiyle değil şeffaflıkla (SPEC 1.2) ilgili bir sorun olurdu. Dış kanal
 * gönderimi ayrı bir satır ve ayrı bir sonuç.
 *
 * EŞZAMANLILIK 5: olay işleme kısa ve birbirinden bağımsız. Zamanlanmış
 * işlerle aynı kuyruğa konsaydı, aylık borç üretimi koşarken bir ödeme
 * makbuzu 15 dakika beklerdi.
 */
@Processor(QUEUE_EVENTS, { concurrency: 5 })
export class EventProcessor extends WorkerHost {
  private readonly logger = new Logger("DomainEvent");

  constructor(
    private readonly db: DbService,
    private readonly context: JobContext,
  ) {
    super();
  }

  override async process(job: Job<DomainEventPayload>): Promise<unknown> {
    const payload = job.data;
    const rule = ruleFor(payload.event);

    if (!rule) {
      // Sessizce düşmüyor: "neden bildirim gitmedi" sorusunun cevabı ya
      // `policy.ts`'te ya burada; üçüncü bir ihtimal yok.
      this.logger.warn({ event: "notification.unmapped", name: payload.event });
      return { skipped: "unmapped" };
    }

    return this.context.run(
      {
        tenantId: payload.tenantId,
        jobId: `event:${payload.event}`,
        requestId: payload.requestId,
      },
      async () => {
        const recipients = await this.resolveRecipients(rule.audience, payload);
        if (recipients.length === 0) {
          return { event: payload.event, recipients: 0, skipped: "no_recipient" };
        }

        let inApp = 0;
        let sent = 0;
        let failed = 0;

        for (const recipient of recipients) {
          const decision = route({
            kind: rule.kind,
            recipient,
            // Sessiz saat ve maliyet kararı sunucu saatiyle: kullanıcının
            // cihaz saati burada hiç devrede değil.
            now: new Date(),
          });

          if (rule.alwaysInApp) {
            await this.writeInApp(payload, rule.resourceType, recipient.userId, decision.templateName);
            inApp += 1;
          }

          // Uygulama içi kanal `dispatch`'e gitmiyor: onun sağlayıcısı yok,
          // kaydın kendisi zaten bildirimdir.
          const external = decision.channels.filter((c) => c !== "in_app");
          if (external.length === 0) continue;

          const outcomes = await dispatch(
            { ...decision, channels: external },
            { phone: recipient.phone, email: recipient.email },
            {
              templateName: decision.templateName,
              templateParams: Object.values(payload.params ?? {}).map(String),
            },
          );

          for (const outcome of outcomes) {
            if (outcome.ok) sent += 1;
            else failed += 1;
            await this.writeOutcome(payload, rule.resourceType, recipient, outcome, decision.templateName);
          }
        }

        this.logger.log({
          event: "notification.processed",
          name: payload.event,
          recipients: recipients.length,
          inApp,
          sent,
          failed,
        });

        return { event: payload.event, recipients: recipients.length, inApp, sent, failed };
      },
    );
  }

  /**
   * Hedef kitleyi olayın taşıdığı kaynaktan çözer.
   *
   * Olayı yayan servis alıcı listesi göndermiyor ve göndermemeli: "bu dairede
   * kim oturuyor" sorusunu her servisin cevaplaması, her servisi sakin
   * tablosuna bağımlı hale getirirdi.
   */
  private async resolveRecipients(
    audience: Audience,
    payload: DomainEventPayload,
  ): Promise<RecipientProfile[]> {
    const userIds = await this.db.tx(async (tx) => {
      switch (audience) {
        case "subject_user":
          return payload.subjectUserId ? [payload.subjectUserId] : [];

        case "unit_residents": {
          if (!payload.unitId) return [];
          const rows = await tx
            .select({ userId: unitOccupancies.userId })
            .from(unitOccupancies)
            .where(
              and(
                eq(unitOccupancies.unitId, payload.unitId),
                isNull(unitOccupancies.endDate),
              ),
            );
          return rows.map((r) => r.userId);
        }

        case "managers": {
          const rows = await tx
            .select({ userId: memberships.userId, role: memberships.role })
            .from(memberships)
            .where(isNull(memberships.deletedAt));
          // Rol adı listesi yerine izin kontrolü: yeni bir yönetici rolü
          // eklendiğinde bu liste güncellenmeyi unutulmasın.
          return rows
            .filter((r) => hasPermission([r.role as Role], "request:write"))
            .map((r) => r.userId);
        }

        case "all_residents": {
          const rows = await tx
            .select({ userId: unitOccupancies.userId })
            .from(unitOccupancies)
            .where(isNull(unitOccupancies.endDate));
          return rows.map((r) => r.userId);
        }
      }
    });

    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) return [];

    // `users` global tablo; erişim yukarıdaki tenant kapsamlı sorgudan çıkan
    // kimlik listesiyle sınırlı.
    const people = await this.db.bypass("notify:recipients", async (tx) =>
      tx
        .select({
          id: users.id,
          phone: users.phone,
          email: users.email,
          whatsappOptIn: users.whatsappOptIn,
          locale: users.locale,
        })
        .from(users)
        .where(and(inArray(users.id, unique), isNull(users.deletedAt))),
    );

    return people.map((person) => ({
      userId: person.id,
      phone: person.phone,
      email: person.email,
      whatsappOptIn: person.whatsappOptIn,
      // Pazarlama izni için ayrı bir sütun yok; KVKK açısından doğru
      // varsayılan **hayır**. `policy.ts`'teki olayların hiçbiri pazarlama
      // sınıfında değil, dolayısıyla bu bir bildirimi engellemiyor — izin
      // sütunu eklendiğinde tek değişecek yer burası.
      marketingOptIn: false,
      // Uygulama içi kayıt her durumda yazıldığı için oturum varlığı
      // yönlendirmeyi etkilemiyor; alan sözleşme gereği dolduruluyor.
      hasAppSession: true,
      locale: person.locale ?? "tr",
    }));
  }

  private writeInApp(
    payload: DomainEventPayload,
    resourceType: string,
    userId: string,
    template: string,
  ): Promise<unknown> {
    return this.db.tx(async (tx) =>
      tx.insert(notifications).values({
        tenantId: payload.tenantId,
        userId,
        channel: "in_app",
        template,
        params: payload.params ?? {},
        // Uygulama içi kanalın adresi kullanıcının kendisi.
        recipient: userId,
        status: "sent",
        sentAt: new Date(),
        resourceType,
        resourceId: payload.resourceId ?? null,
      }),
    );
  }

  private writeOutcome(
    payload: DomainEventPayload,
    resourceType: string,
    recipient: RecipientProfile,
    outcome: { channel: string; ok: boolean; provider?: string; providerRef?: string; error?: string },
    template: string,
  ): Promise<unknown> {
    const now = new Date();
    return this.db.tx(async (tx) =>
      tx.insert(notifications).values({
        tenantId: payload.tenantId,
        userId: recipient.userId,
        channel: outcome.channel as "whatsapp" | "sms" | "email" | "push" | "voice",
        template,
        params: payload.params ?? {},
        recipient:
          outcome.channel === "email"
            ? (recipient.email ?? "")
            : (recipient.phone ?? ""),
        status: outcome.ok ? "sent" : "failed",
        sentAt: outcome.ok ? now : null,
        failedAt: outcome.ok ? null : now,
        error: outcome.error ?? null,
        provider: outcome.provider ?? null,
        providerRef: outcome.providerRef ?? null,
        resourceType,
        resourceId: payload.resourceId ?? null,
      }),
    );
  }
}
