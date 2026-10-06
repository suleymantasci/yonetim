import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { normalizePhone, type Kurus } from "@yonetim/core";
import {
  announcements,
  conversationStates,
  debts,
  messages,
  requests,
  tenants,
  unitOccupancies,
  units,
  users,
} from "@yonetim/db";
import {
  DEFAULT_LOCALE,
  formatDateFor,
  formatMoney,
  isLocale,
  type Locale,
} from "@yonetim/i18n";
import {
  handleMessage,
  sendButtons,
  sendList,
  sendText,
  serviceWindowEnd,
  type BotSession,
  type ResidentContext,
} from "@yonetim/whatsapp";

import { translatorFor } from "../../infra/i18n/translator";
import { DbService } from "../../infra/db/db.service";

interface InboundMessage {
  from: string;
  messageId: string;
  text: string;
  replyId?: string;
  timestamp: Date;
  profileName?: string;
}

interface ResidentIdentity {
  userId: string;
  /** Sakinin tercih ettiği dil — bot yanıtları bu dilde üretilir. */
  locale: Locale;
  tenantId: string;
  unitId: string | null;
  unitLabel: string | null;
  tenantName: string;
  displayName: string | null;
}

/**
 * WhatsApp botu — sakin mesajı → niyet tespiti (AI'sız) → durum makinesi.
 *
 * TELEFON ŞİFRELENMİYOR (GAP-DURUM kararı 7) ve bu servis nedeninin canlı
 * kanıtı: gelen mesajın kimden geldiğini anlamanın tek yolu numaradan ters
 * arama. Şifreli bir sütunda `WHERE phone = ?` çalışmazdı; her mesajda tüm
 * kullanıcıları çözmek gerekirdi.
 *
 * Tanınmayan numara **hata değil**: bot kimliksiz de cevap veriyor (genel
 * bilgi, opt-out). Kim olduğunu bilmediğimiz birine "sen kimsin" demek yerine
 * yapabildiğimiz kadarını yapıyoruz.
 */
@Injectable()
export class WhatsappBotService {
  private readonly logger = new Logger("WhatsappBot");

  constructor(private readonly db: DbService) {}

  /** Giden mesajın teslim durumu — Meta'nın status callback'i. */
  async recordStatus(status: {
    messageId: string;
    status: string;
    timestamp: Date;
  }): Promise<void> {
    await this.db.bypass("wa:status", async (tx) => {
      await tx
        .update(messages)
        .set({
          meta: { status: status.status, at: status.timestamp.toISOString() },
        })
        .where(eq(messages.externalId, status.messageId));
    });
  }

  async handleInbound(inbound: InboundMessage): Promise<void> {
    const phone = normalizePhone(inbound.from) ?? inbound.from;
    const text = inbound.replyId ?? inbound.text;

    const state = await this.db.bypass("wa:state", async (tx) => {
      const rows = await tx
        .select()
        .from(conversationStates)
        .where(eq(conversationStates.phone, phone))
        .limit(1);
      return rows[0] ?? null;
    });

    const identity = await this.resolveResident(phone);

    const session: BotSession = {
      state: (state?.state ?? "idle") as BotSession["state"],
      slots: (state?.slots ?? {}) as Record<string, string>,
      serviceWindowEndsAt: state?.serviceWindowEndsAt ?? undefined,
    };

    const ctx = identity
      ? await this.buildResidentContext(identity)
      : ({ identified: false } as ResidentContext);

    // Bot dili sakinin tercihidir; tanınmayan numaralarda varsayılan dile düşer.
    const locale = identity?.locale ?? DEFAULT_LOCALE;
    const reply = handleMessage({
      text,
      session,
      ctx,
      t: translatorFor("notification", locale),
      tEnum: translatorFor("enum", locale),
      format: {
        money: (kurus: Kurus) => formatMoney(kurus, locale),
        date: (value: Date) => formatDateFor(value, locale),
      },
    });

    // Gelen mesajı kaydet (Bölüm 6.11 konuşma geçmişi).
    await this.db.bypass("wa:log-in", async (tx) => {
      await tx
        .insert(messages)
        .values({
          tenantId: identity?.tenantId ?? null,
          userId: identity?.userId ?? null,
          channel: "whatsapp",
          direction: "in",
          body: inbound.text,
          externalId: inbound.messageId,
          intent: reply.intent.intent,
          intentConfidence: String(reply.intent.confidence),
          handledByBot: !reply.needsHuman,
          meta: { profileName: inbound.profileName },
        })
        // Meta aynı mesajı yeniden teslim edebilir; `externalId` tekil.
        .onConflictDoNothing();
    });

    if (reply.buttons?.length) {
      await sendButtons(phone, reply.text, reply.buttons);
    } else if (reply.listItems?.length) {
      await sendList(phone, reply.text, reply.listItems);
    } else {
      await sendText(phone, reply.text);
    }

    await this.db.bypass("wa:log-out", async (tx) => {
      await tx.insert(messages).values({
        tenantId: identity?.tenantId ?? null,
        userId: identity?.userId ?? null,
        channel: "whatsapp",
        direction: "out",
        body: reply.text,
        intent: reply.intent.intent,
        handledByBot: true,
      });
    });

    // Durumu kalıcılaştır (24 saatlik service window dahil).
    const windowEnd = serviceWindowEnd(inbound.timestamp);
    await this.db.bypass("wa:save-state", async (tx) => {
      if (state) {
        await tx
          .update(conversationStates)
          .set({
            state: reply.session.state,
            slots: reply.session.slots,
            lastIntent: reply.intent.intent,
            serviceWindowEndsAt: windowEnd,
            lastMessageAt: inbound.timestamp,
            tenantId: identity?.tenantId ?? null,
            userId: identity?.userId ?? null,
            optedOutAt:
              reply.action.type === "opt_out" ? new Date() : state.optedOutAt,
          })
          .where(eq(conversationStates.id, state.id));
      } else {
        await tx.insert(conversationStates).values({
          phone,
          tenantId: identity?.tenantId ?? null,
          userId: identity?.userId ?? null,
          state: reply.session.state,
          slots: reply.session.slots,
          lastIntent: reply.intent.intent,
          serviceWindowEndsAt: windowEnd,
          lastMessageAt: inbound.timestamp,
        });
      }
    });

    if (identity) {
      await this.applyAction(reply.action, identity, phone);
    }
  }

  /**
   * Numaradan sakini bulur.
   *
   * Baypas gerekli ve dar: tenant'ı **bulmak** için sorgu yapılıyor, henüz
   * hangi tenant olduğu bilinmiyor. Sonrasındaki her okuma tenant kapsamına
   * giriyor (`buildResidentContext`).
   */
  private resolveResident(phone: string): Promise<ResidentIdentity | null> {
    return this.db.bypass("wa:identify", async (tx) => {
      const rows = await tx
        .select({
          userId: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          locale: users.locale,
          optIn: users.whatsappOptIn,
        })
        .from(users)
        .where(and(eq(users.phone, phone), isNull(users.deletedAt)))
        .limit(1);

      const user = rows[0];
      if (!user) return null;

      const occ = await tx
        .select({
          tenantId: unitOccupancies.tenantId,
          unitId: unitOccupancies.unitId,
          unitNumber: units.number,
          tenantName: tenants.name,
        })
        .from(unitOccupancies)
        .innerJoin(units, eq(units.id, unitOccupancies.unitId))
        .innerJoin(tenants, eq(tenants.id, unitOccupancies.tenantId))
        .where(
          and(
            eq(unitOccupancies.userId, user.userId),
            isNull(unitOccupancies.endDate),
          ),
        )
        .limit(1);

      const o = occ[0];
      if (!o) return null;

      return {
        userId: user.userId,
        locale: normalizeLocale(user.locale),
        tenantId: o.tenantId,
        unitId: o.unitId,
        unitLabel: o.unitNumber,
        tenantName: o.tenantName,
        displayName:
          [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      };
    });
  }

  private buildResidentContext(
    identity: ResidentIdentity,
  ): Promise<ResidentContext> {
    return this.db.tenantScoped(identity.tenantId, identity.userId, async (tx) => {
      const debtRows = identity.unitId
        ? await tx
            .select()
            .from(debts)
            .where(
              and(
                eq(debts.unitId, identity.unitId),
                isNull(debts.deletedAt),
                sql`${debts.status} NOT IN ('paid','written_off')`,
              ),
            )
            .orderBy(debts.dueDate)
            .limit(12)
        : [];

      const announcementRows = await tx
        .select({
          title: announcements.title,
          publishedAt: announcements.publishedAt,
        })
        .from(announcements)
        .where(
          and(
            isNull(announcements.deletedAt),
            sql`${announcements.publishedAt} IS NOT NULL`,
            // Yayından kaldırılan (bitişi geçmiş) duyuru botta da görünmesin.
            sql`(${announcements.expiresAt} IS NULL OR ${announcements.expiresAt} > now())`,
          ),
        )
        .orderBy(desc(announcements.publishedAt))
        .limit(5);

      // "Geciken" kararı sunucu saatiyle veriliyor: kullanıcının telefonunun
      // saati yanlışsa bot ona borcu yokmuş gibi cevap verirdi.
      const now = new Date();
      const total: Kurus = debtRows.reduce(
        (a, d) => a + (d.amountKurus + d.lateFeeKurus - d.paidKurus),
        0,
      );
      const overdue: Kurus = debtRows
        .filter((d) => d.dueDate < now)
        .reduce((a, d) => a + (d.amountKurus + d.lateFeeKurus - d.paidKurus), 0);

      return {
        identified: true,
        userId: identity.userId,
        tenantId: identity.tenantId,
        tenantName: identity.tenantName,
        unitLabel: identity.unitLabel ?? undefined,
        displayName: identity.displayName ?? undefined,
        totalDebtKurus: total,
        overdueDebtKurus: overdue,
        nextDueDate: debtRows[0]?.dueDate,
        debtBreakdown: debtRows.map((d) => ({
          label: d.description,
          amountKurus: d.amountKurus + d.lateFeeKurus - d.paidKurus,
          dueDate: d.dueDate,
          overdue: d.dueDate < now,
        })),
        recentAnnouncements: announcementRows
          .filter((a) => a.publishedAt)
          .map((a) => ({ title: a.title, publishedAt: a.publishedAt! })),
      } satisfies ResidentContext;
    });
  }

  private async applyAction(
    action: { type: string; payload?: Record<string, unknown> },
    identity: ResidentIdentity,
    phone: string,
  ): Promise<void> {
    switch (action.type) {
      case "create_request": {
        const code = `TLP-${Date.now().toString(36).toUpperCase()}`;
        await this.db.tenantScoped(
          identity.tenantId,
          identity.userId,
          async (tx) => {
            await tx.insert(requests).values({
              tenantId: identity.tenantId,
              unitId: identity.unitId,
              createdByUserId: identity.userId,
              code,
              category: String(action.payload?.category ?? "diger"),
              title: String(
                action.payload?.description ?? "WhatsApp talebi",
              ).slice(0, 200),
              description: String(action.payload?.description ?? ""),
              priority: "normal",
              status: "open",
              source: "whatsapp",
            });
          },
        );
        break;
      }

      case "opt_out": {
        await this.db.bypass("wa:opt-out", async (tx) => {
          await tx
            .update(users)
            .set({ whatsappOptIn: false })
            .where(eq(users.id, identity.userId));
        });
        break;
      }

      case "handoff_to_manager": {
        await this.db.bypass("wa:handoff", async (tx) => {
          await tx.insert(messages).values({
            tenantId: identity.tenantId,
            userId: identity.userId,
            channel: "in_app",
            direction: "in",
            body: String(action.payload?.text ?? ""),
            handledByBot: false,
            meta: { reason: action.payload?.reason, handoff: true, phone },
          });
        });
        break;
      }

      default:
        this.logger.debug({ event: "wa.action_ignored", type: action.type });
        break;
    }
  }
}

/** DB'deki serbest metin dil alanını desteklenen bir dile indirger. */
function normalizeLocale(value: string | null): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}
