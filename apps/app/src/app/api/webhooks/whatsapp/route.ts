import { NextResponse } from "next/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { RATE_LIMITS, rateLimit } from "@yonetim/auth";
import { normalizePhone, type Kurus } from "@yonetim/core";
import {
  DEFAULT_LOCALE, formatDateFor, formatMoney, isLocale, type Locale,
} from "@yonetim/i18n";
import {
  announcements, conversationStates, debts, messages, requests, tenants, units, unitOccupancies,
  users, withBypassRls, withTenant,
} from "@yonetim/db";
import { enumTranslator, notificationTranslator } from "@/lib/notify";
import {
  handleMessage, parseWebhook, sendButtons, sendList, sendText, serviceWindowEnd,
  verifyWebhookSignature, verifyWebhookSubscription,
  type BotSession, type ResidentContext,
} from "@yonetim/whatsapp";

/**
 * WhatsApp Cloud API webhook — SPEC Bölüm 3.1 / 3.2 / 7.5.
 * Sakin mesajı → niyet tespiti (AI'sız) → durum makinesi → yanıt.
 * Service window içindeki yanıtlar ücretsizdir.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const challenge = verifyWebhookSubscription(url.searchParams);
  if (challenge) return new Response(challenge, { status: 200 });
  return new Response("verification_failed", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const payload = JSON.parse(raw) as unknown;
  const { messages: inbound, statuses } = parseWebhook(payload);

  for (const status of statuses) {
    await withBypassRls("wa:status", async (tx) => {
      await tx
        .update(messages)
        .set({ meta: { status: status.status, at: status.timestamp.toISOString() } })
        .where(eq(messages.externalId, status.messageId));
    });
  }

  for (const inboundMessage of inbound) {
    const limit = await rateLimit(RATE_LIMITS.whatsappInbound, inboundMessage.from);
    if (!limit.allowed) continue;
    await handleInbound(inboundMessage);
  }

  return NextResponse.json({ ok: true });
}

async function handleInbound(inbound: {
  from: string;
  messageId: string;
  text: string;
  replyId?: string;
  timestamp: Date;
  profileName?: string;
}) {
  const phone = normalizePhone(inbound.from) ?? inbound.from;
  const text = inbound.replyId ?? inbound.text;

  const state = await withBypassRls("wa:state", async (tx) => {
    const rows = await tx
      .select()
      .from(conversationStates)
      .where(eq(conversationStates.phone, phone))
      .limit(1);
    return rows[0] ?? null;
  });

  const identity = await resolveResident(phone);

  const session: BotSession = {
    state: (state?.state ?? "idle") as BotSession["state"],
    slots: (state?.slots ?? {}) as Record<string, string>,
    serviceWindowEndsAt: state?.serviceWindowEndsAt ?? undefined,
  };

  const ctx = identity
    ? await buildResidentContext(identity)
    : ({ identified: false } as ResidentContext);

  // Bot dili sakinin tercihidir; tanınmayan numaralarda varsayılan dile düşer.
  const locale = identity?.locale ?? DEFAULT_LOCALE;
  const reply = handleMessage({
    text,
    session,
    ctx,
    t: await notificationTranslator(locale),
    tEnum: await enumTranslator(locale),
    format: {
      money: (kurus: Kurus) => formatMoney(kurus, locale),
      date: (value: Date) => formatDateFor(value, locale),
    },
  });

  // Gelen mesajı kaydet (Bölüm 6.11 konuşma geçmişi).
  await withBypassRls("wa:log-in", async (tx) => {
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
      .onConflictDoNothing();
  });

  // Yanıtı gönder.
  if (reply.buttons?.length) {
    await sendButtons(phone, reply.text, reply.buttons);
  } else if (reply.listItems?.length) {
    await sendList(phone, reply.text, reply.listItems);
  } else {
    await sendText(phone, reply.text);
  }

  await withBypassRls("wa:log-out", async (tx) => {
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
  await withBypassRls("wa:save-state", async (tx) => {
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
          optedOutAt: reply.action.type === "opt_out" ? new Date() : state.optedOutAt,
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

  // Bot aksiyonlarını uygula.
  if (identity) {
    await applyAction(reply.action, identity, phone);
  }
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

async function resolveResident(phone: string): Promise<ResidentIdentity | null> {
  return withBypassRls("wa:identify", async (tx) => {
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
      .where(and(eq(unitOccupancies.userId, user.userId), isNull(unitOccupancies.endDate)))
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
      displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
    };
  });
}

async function buildResidentContext(identity: ResidentIdentity): Promise<ResidentContext> {
  return withTenant(identity.tenantId, async (tx) => {
    const debtRows = await tx
      .select()
      .from(debts)
      .where(
        and(
          eq(debts.unitId, identity.unitId!),
          isNull(debts.deletedAt),
          sql`${debts.status} <> 'paid'`,
        ),
      )
      .orderBy(debts.dueDate)
      .limit(12);

    const announcementRows = await tx
      .select({ title: announcements.title, publishedAt: announcements.publishedAt })
      .from(announcements)
      .where(and(isNull(announcements.deletedAt), sql`${announcements.publishedAt} IS NOT NULL`))
      .orderBy(desc(announcements.publishedAt))
      .limit(5);

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

async function applyAction(
  action: { type: string; payload?: Record<string, unknown> },
  identity: ResidentIdentity,
  phone: string,
): Promise<void> {
  switch (action.type) {
    case "create_request": {
      const code = `TLP-${Date.now().toString(36).toUpperCase()}`;
      await withTenant(
        identity.tenantId,
        async (tx) => {
          await tx.insert(requests).values({
            tenantId: identity.tenantId,
            unitId: identity.unitId,
            createdByUserId: identity.userId,
            code,
            category: String(action.payload?.category ?? "diger"),
            title: String(action.payload?.description ?? "WhatsApp talebi").slice(0, 200),
            description: String(action.payload?.description ?? ""),
            priority: "normal",
            status: "open",
            source: "whatsapp",
          });
        },
        { userId: identity.userId },
      );
      break;
    }

    case "opt_out": {
      await withBypassRls("wa:opt-out", async (tx) => {
        await tx
          .update(users)
          .set({ whatsappOptIn: false })
          .where(eq(users.id, identity.userId));
      });
      break;
    }

    case "handoff_to_manager": {
      await withBypassRls("wa:handoff", async (tx) => {
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
      break;
  }
}

/** DB'deki serbest metin dil alanını desteklenen bir dile indirger. */
function normalizeLocale(value: string | null): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}
