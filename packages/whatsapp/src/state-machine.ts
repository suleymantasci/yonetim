import { siteConfig } from "@yonetim/config";
import type { Kurus } from "@yonetim/core";

import { detectIntent, normalize, type Intent, type IntentMatch } from "./intents";

/**
 * Sakin bot durum makinesi — SPEC Bölüm 3.1 / 3.2.
 * Her mesaj → niyet → durum geçişi → şablon cevap. AI kullanılmaz; eşik altı
 * niyetler `needsHuman` ile işaretlenir.
 *
 * Bot dile bağımsızdır: tüm metinler `t` çeviri fonksiyonuyla dışarıdan gelir
 * (`notification.bot.*`). Sakinin dili profilinden okunur, böylece aynı botun
 * İngilizce konuşan sakinlerle çalışması için kod değişikliği gerekmez.
 */

export type ConversationState =
  | "idle"
  | "awaiting_identification"
  | "menu"
  | "request_category"
  | "request_description"
  | "request_confirm"
  | "payment_amount"
  | "certificate_confirm"
  | "reservation_resource"
  | "reservation_time"
  | "opt_out_confirm"
  | "human_handoff";

/** next-intl `getTranslations` sonucuyla uyumlu minimal arayüz. */
export type Translator = (key: string, values?: Record<string, string | number>) => string;

/** Tutar ve tarih biçimlendirmesi dile bağlıdır; çağıran katman sağlar. */
export interface BotFormatters {
  money: (kurus: Kurus) => string;
  date: (date: Date) => string;
}

export interface ResidentContext {
  identified: boolean;
  userId?: string;
  tenantId?: string;
  tenantName?: string;
  unitLabel?: string;
  displayName?: string;
  totalDebtKurus?: Kurus;
  overdueDebtKurus?: Kurus;
  nextDueDate?: Date;
  debtBreakdown?: { label: string; amountKurus: Kurus; dueDate: Date; overdue: boolean }[];
  recentAnnouncements?: { title: string; publishedAt: Date }[];
  managerName?: string;
  managerPhone?: string;
  nextMeeting?: { title: string; scheduledAt: Date; location?: string } | null;
  openPolls?: { question: string; closesAt: Date }[];
  paymentLink?: string;
  resources?: { id: string; name: string }[];
}

export interface BotSession {
  state: ConversationState;
  slots: Record<string, string>;
  lastIntent?: Intent;
  serviceWindowEndsAt?: Date;
}

export interface BotAction {
  type:
    | "none"
    | "create_request"
    | "send_payment_link"
    | "request_certificate"
    | "opt_out"
    | "handoff_to_manager"
    | "register_resident"
    | "start_reservation";
  payload?: Record<string, unknown>;
}

export interface BotReply {
  text: string;
  /** WhatsApp interactive button'ları (en fazla 3). */
  buttons?: { id: string; title: string }[];
  /** Liste menüsü (en fazla 10 satır). */
  listItems?: { id: string; title: string; description?: string }[];
  session: BotSession;
  action: BotAction;
  intent: IntentMatch;
  needsHuman: boolean;
}

/** Arıza kategorileri — etiketleri `enum.requestCategory.<id>` altındadır. */
const CATEGORY_IDS = [
  "asansor", "su", "elektrik", "dogalgaz", "ortak_alan",
  "guvenlik", "temizlik", "hasere", "diger",
] as const;

export interface HandleMessageParams {
  text: string;
  session: BotSession;
  ctx: ResidentContext;
  t: Translator;
  /** Enum etiketlerini çeviren fonksiyon (`enum.*` namespace'i). */
  tEnum: Translator;
  format: BotFormatters;
}

export function handleMessage(params: HandleMessageParams): BotReply {
  const { text, ctx, t, tEnum, format } = params;
  const session: BotSession = { ...params.session, slots: { ...params.session.slots } };
  const intent = detectIntent(text);
  const normalized = normalize(text);

  const menuButtons = [
    { id: "borc", title: t("bot.menuButtonDebt") },
    { id: "odeme", title: t("bot.menuButtonPay") },
    { id: "talep", title: t("bot.menuButtonRequest") },
  ];

  const categoryItems = CATEGORY_IDS.map((id) => ({
    id,
    title: tEnum(`requestCategory.${id}`),
  }));

  const reply = (
    over: Partial<Omit<BotReply, "session" | "intent">> & { text: string },
  ): BotReply => ({
    buttons: undefined,
    listItems: undefined,
    action: { type: "none" },
    needsHuman: false,
    ...over,
    session,
    intent,
  });

  // 0) İptal her durumda önceliklidir (KVKK — Bölüm 3.1).
  if (intent.intent === "iptal_optout") {
    session.state = "opt_out_confirm";
    return reply({
      text: t("bot.optOutConfirm"),
      buttons: [
        { id: "optout_yes", title: t("bot.optOutYes") },
        { id: "optout_no", title: t("bot.optOutNo") },
      ],
    });
  }

  if (session.state === "opt_out_confirm") {
    if (isAffirmative(normalized) || normalized === "optout_yes") {
      session.state = "idle";
      return reply({ text: t("bot.optOutDone"), action: { type: "opt_out" } });
    }
    session.state = "menu";
    return reply({ text: t("bot.cancelled"), buttons: menuButtons });
  }

  // 1) Kimlik doğrulama gerekiyorsa.
  if (!ctx.identified) {
    if (session.state === "awaiting_identification") {
      const unitCandidate = intent.slots.unit ?? normalized.toUpperCase();
      return reply({
        text: t("bot.identifyReceived", { unit: unitCandidate }),
        action: { type: "register_resident", payload: { unitHint: unitCandidate } },
      });
    }
    session.state = "awaiting_identification";
    return reply({ text: t("bot.identifyPrompt", { brand: siteConfig.brand.name }) });
  }

  // 2) Menü kısayolları (buton id'leri).
  if (normalized === "borc") return debtReply();
  if (normalized === "odeme") return paymentReply();
  if (normalized === "talep") return startRequest();

  // 3) Devam eden akışlar.
  switch (session.state) {
    case "request_category": {
      const category = intent.slots.category ?? matchCategory(normalized);
      if (!category) {
        return reply({ text: t("bot.requestCategoryRetry"), listItems: categoryItems });
      }
      session.slots.category = category;
      session.state = "request_description";
      return reply({ text: t("bot.requestDescriptionPrompt") });
    }

    case "request_description": {
      session.slots.description = text.slice(0, 500);
      session.state = "request_confirm";
      return reply({
        text: t("bot.requestConfirm", {
          category: tEnum(`requestCategory.${session.slots.category ?? "diger"}`),
          description: session.slots.description,
          unit: ctx.unitLabel ?? "-",
        }),
        buttons: confirmButtons("req"),
      });
    }

    case "request_confirm": {
      if (isAffirmative(normalized) || normalized === "req_yes") {
        const payload = {
          category: session.slots.category ?? "diger",
          description: session.slots.description ?? "",
        };
        session.state = "menu";
        session.slots = {};
        return reply({
          text: t("bot.requestCreated"),
          action: { type: "create_request", payload },
          buttons: menuButtons,
        });
      }
      session.state = "menu";
      session.slots = {};
      return reply({ text: t("bot.requestCancelled"), buttons: menuButtons });
    }

    case "certificate_confirm": {
      if (isAffirmative(normalized) || normalized === "cert_yes") {
        session.state = "menu";
        return reply({
          text: t("bot.certificateRequested"),
          action: { type: "request_certificate" },
        });
      }
      session.state = "menu";
      return reply({ text: t("bot.certificateCancelled"), buttons: menuButtons });
    }

    default:
      break;
  }

  // 4) Niyete göre yanıt.
  switch (intent.intent) {
    case "aidat_sorgu":
      return debtReply();

    case "odeme_talebi":
      return paymentReply();

    case "odeme_bildirimi":
      session.state = "menu";
      return reply({
        text: t("bot.paymentNoticeThanks"),
        action: { type: "handoff_to_manager", payload: { reason: "odeme_bildirimi", text } },
      });

    case "talep_ariza": {
      if (intent.slots.category) {
        session.slots.category = intent.slots.category;
        session.slots.description = text.slice(0, 500);
        session.state = "request_confirm";
        return reply({
          text: t("bot.requestConfirm", {
            category: tEnum(`requestCategory.${intent.slots.category}`),
            description: text.slice(0, 200),
            unit: ctx.unitLabel ?? "-",
          }),
          buttons: confirmButtons("req"),
        });
      }
      return startRequest();
    }

    case "duyuru_sorgu": {
      session.state = "menu";
      const list = (ctx.recentAnnouncements ?? []).slice(0, 5);
      if (list.length === 0) {
        return reply({ text: t("bot.announcementsNone"), buttons: menuButtons });
      }
      const lines = list.map(
        (a, i) => `${i + 1}. ${a.title} (${format.date(a.publishedAt)})`,
      );
      return reply({
        text: `${t("bot.announcementsTitle")}\n\n${lines.join("\n")}`,
        buttons: menuButtons,
      });
    }

    case "yonetici_iletisim": {
      session.state = "menu";
      if (!ctx.managerName) {
        return reply({ text: t("bot.managerUnknown"), buttons: menuButtons });
      }
      const parts = [t("bot.managerInfo", { name: ctx.managerName })];
      if (ctx.managerPhone) parts.push(t("bot.managerPhone", { phone: ctx.managerPhone }));
      parts.push("", t("bot.managerRelay"));
      return reply({ text: parts.join("\n"), buttons: menuButtons });
    }

    case "borcu_yoktur_belgesi":
      session.state = "certificate_confirm";
      return reply({
        text: t("bot.certificatePrompt"),
        buttons: [
          { id: "cert_yes", title: t("bot.certificateYes") },
          { id: "cert_no", title: t("bot.certificateNo") },
        ],
      });

    case "toplanti_sorgu": {
      session.state = "menu";
      if (!ctx.nextMeeting) {
        return reply({ text: t("bot.meetingNone"), buttons: menuButtons });
      }
      const parts = [
        t("bot.meetingNext", {
          title: ctx.nextMeeting.title,
          date: format.date(ctx.nextMeeting.scheduledAt),
        }),
      ];
      if (ctx.nextMeeting.location) {
        parts.push(t("bot.meetingLocation", { location: ctx.nextMeeting.location }));
      }
      return reply({ text: parts.join("\n"), buttons: menuButtons });
    }

    case "anket_oy": {
      session.state = "menu";
      const polls = ctx.openPolls ?? [];
      if (polls.length === 0) {
        return reply({ text: t("bot.pollsNone"), buttons: menuButtons });
      }
      const lines = polls.map((p, i) => `${i + 1}. ${p.question} (${format.date(p.closesAt)})`);
      return reply({
        text: `${t("bot.pollsOpen")}\n\n${lines.join("\n")}\n\n${t("bot.pollsHint")}`,
        buttons: menuButtons,
      });
    }

    case "rezervasyon":
      session.state = "reservation_resource";
      return reply({
        text: t("bot.reservationPrompt"),
        listItems: (ctx.resources ?? []).slice(0, 10).map((r) => ({ id: r.id, title: r.name })),
        action: { type: "start_reservation" },
      });

    case "kvkk_talebi":
      session.state = "menu";
      return reply({
        text: t("bot.kvkkInfo", {
          days: Math.round(siteConfig.legal.kvkkResponseHours / 24),
        }),
        buttons: menuButtons,
      });

    case "selamlama":
    case "yardim":
      session.state = "menu";
      return reply({ text: menuText(), buttons: menuButtons, listItems: helpItems() });

    case "tesekkur":
      session.state = "menu";
      return reply({ text: t("bot.thanks"), buttons: menuButtons });

    default: {
      // Eşik altı: AI fallback kapalıysa insana devret (Bölüm 9.1).
      const needsHuman = intent.confidence < siteConfig.ai.intentConfidenceThreshold;
      session.state = needsHuman ? "human_handoff" : "menu";
      return reply({
        text: t("bot.fallback"),
        buttons: menuButtons,
        listItems: helpItems(),
        needsHuman,
        action: needsHuman
          ? { type: "handoff_to_manager", payload: { reason: "low_confidence", text } }
          : { type: "none" },
      });
    }
  }

  // ---- yerel yardımcılar (closure ile t/format/ctx erişimi) ----

  function confirmButtons(prefix: "req") {
    return [
      { id: `${prefix}_yes`, title: t("bot.requestConfirmYes") },
      { id: `${prefix}_no`, title: t("bot.requestConfirmNo") },
    ];
  }

  function debtReply(): BotReply {
    session.state = "menu";
    const total = ctx.totalDebtKurus ?? 0;
    const unit = ctx.unitLabel ?? "";

    if (total <= 0) {
      return reply({
        text: t("bot.debtNone", { unit }),
        buttons: [
          { id: "belge", title: t("bot.helpItem.certificateTitle") },
          { id: "duyuru", title: t("bot.helpItem.announcementsTitle") },
        ],
      });
    }

    const parts = [t("bot.debtSummary", { unit, amount: format.money(total) })];
    if (ctx.overdueDebtKurus) {
      parts.push(t("bot.debtOverdue", { amount: format.money(ctx.overdueDebtKurus) }));
    }
    if (ctx.nextDueDate) {
      parts.push(t("bot.debtDueDate", { date: format.date(ctx.nextDueDate) }));
    }
    const lines = (ctx.debtBreakdown ?? []).slice(0, 6).map(
      (d) =>
        `• ${d.label}: ${format.money(d.amountKurus)}${d.overdue ? t("bot.overdueSuffix") : ""}`,
    );
    if (lines.length) parts.push("", ...lines);
    parts.push("", t("bot.debtPayHint"));

    return reply({ text: parts.join("\n"), buttons: menuButtons });
  }

  function paymentReply(): BotReply {
    session.state = "menu";
    const total = ctx.totalDebtKurus ?? 0;
    if (total <= 0) {
      return reply({ text: t("bot.payNothing"), buttons: menuButtons });
    }
    const text = t("bot.payPrompt", { amount: format.money(total) });
    return reply({
      text: ctx.paymentLink ? `${text}\n\n${ctx.paymentLink}` : text,
      action: { type: "send_payment_link", payload: { amountKurus: total } },
    });
  }

  function startRequest(): BotReply {
    session.state = "request_category";
    return reply({ text: t("bot.requestCategoryPrompt"), listItems: categoryItems });
  }

  function menuText(): string {
    return [
      t("bot.menuGreeting", { name: ctx.displayName ? ` ${ctx.displayName}` : "" }),
      t("bot.menuProperty", {
        property: ctx.tenantName ?? "",
        unit: ctx.unitLabel ?? "",
      }),
      "",
      t("bot.menuOptions"),
    ].join("\n");
  }

  function helpItems() {
    return [
      { id: "borc", title: t("bot.helpItem.debtTitle"), description: t("bot.helpItem.debtDescription") },
      { id: "odeme", title: t("bot.helpItem.payTitle"), description: t("bot.helpItem.payDescription") },
      { id: "talep", title: t("bot.helpItem.requestTitle"), description: t("bot.helpItem.requestDescription") },
      { id: "duyuru", title: t("bot.helpItem.announcementsTitle"), description: t("bot.helpItem.announcementsDescription") },
      { id: "belge", title: t("bot.helpItem.certificateTitle"), description: t("bot.helpItem.certificateDescription") },
      { id: "yonetici", title: t("bot.helpItem.managerTitle"), description: t("bot.helpItem.managerDescription") },
    ];
  }

  function matchCategory(value: string): string | null {
    return CATEGORY_IDS.find((id) => value.includes(id)) ?? null;
  }
}

function isAffirmative(normalized: string): boolean {
  return [
    "evet", "e", "tamam", "olur", "onay", "onayliyorum", "tamamdir",
    "yes", "y", "ok", "confirm", "sure",
  ].includes(normalized);
}

/** Meta service window: sakin yazdıktan sonra 24 saat ücretsiz cevap (Bölüm 7.5). */
export function serviceWindowEnd(lastInboundAt: Date): Date {
  return new Date(lastInboundAt.getTime() + 24 * 3_600_000);
}

export function isWithinServiceWindow(session: BotSession, now = new Date()): boolean {
  return !!session.serviceWindowEndsAt && session.serviceWindowEndsAt > now;
}
