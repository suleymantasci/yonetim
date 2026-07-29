import { siteConfig } from "@yonetim/config";
import { nextAllowedSendTime, tlToKurus, type Channel, type Kurus } from "@yonetim/core";

/**
 * Akıllı kanal yönlendirme — SPEC Bölüm 8.1.
 *
 * Karar ağacı:
 *   WhatsApp kayıtlı mı? → evet: WhatsApp, hayır: SMS
 *   Kritik mi? → evet: tüm kanallar (+ sesli arama opsiyonu)
 *   Saat uygun mu? → 22:00-08:00 arası acil değilse sabah 09:00'a ertelenir
 */

export type NotificationKind =
  | "otp"
  | "welcome"
  | "dues_reminder"
  | "late_warning"
  | "payment_receipt"
  | "meeting_invite"
  | "maintenance_reminder"
  | "announcement"
  | "emergency"
  | "request_status"
  | "poll_invite"
  | "kvkk_ack"
  | "debt_certificate"
  | "campaign"
  | "nps_survey"
  | "reservation_confirmed"
  /**
   * Yöneticinin panelden tek kişiye yazdığı serbest mesaj.
   *
   * Kendi türü olmasının sebebi yönlendirme değil **maliyet ve izlenebilirlik**:
   * `announcement` sayılsaydı elle yazılan bir mesaj duyuru istatistiklerine
   * karışır ve "kaç duyuru yayımlandı" sorusu yanlış cevaplanırdı. Şablonu
   * yalnız servis penceresi kapalıyken devreye giriyor; pencere açıkken
   * serbest metin gidiyor.
   */
  | "manual_message";

export interface RecipientProfile {
  userId: string;
  phone?: string | null;
  email?: string | null;
  whatsappOptIn: boolean;
  marketingOptIn: boolean;
  hasAppSession: boolean;
  locale?: string;
}

export interface RoutingDecision {
  channels: Channel[];
  scheduledFor: Date;
  templateName: string;
  /** WhatsApp service window içindeyse serbest metin (ücretsiz) gönderilir. */
  useFreeform: boolean;
  estimatedCostKurus: Kurus;
  skippedReasons: string[];
}

const KIND_TEMPLATE: Record<NotificationKind, string> = {
  otp: "otp_login",
  welcome: "hosgeldin",
  dues_reminder: "aidat_hatirlatma",
  late_warning: "aidat_gecikme_uyari",
  payment_receipt: "odeme_onay_makbuz",
  meeting_invite: "toplanti_daveti",
  maintenance_reminder: "bakim_hatirlatma",
  announcement: "duyuru_genel",
  emergency: "acil_durum_override",
  request_status: "talep_durum_degisiklik",
  poll_invite: "anket_daveti",
  kvkk_ack: "kvkk_talep_onay",
  debt_certificate: "borcu_yoktur_belge",
  campaign: "kampanya_bildirim",
  nps_survey: "nps_anket",
  reservation_confirmed: "rezervasyon_onay",
  manual_message: "yonetim_mesaji",
};

/** Bölüm 8.3 tahmini birim maliyetler (kuruş). */
const COST_KURUS: Record<Channel, Kurus> = {
  whatsapp: tlToKurus(1.4), // ~$0.04 utility
  sms: tlToKurus(0.2),
  email: tlToKurus(0.01),
  push: 0,
  in_app: 0,
  voice: tlToKurus(2),
};

const URGENT_KINDS: NotificationKind[] = ["emergency", "otp"];
const MARKETING_KINDS: NotificationKind[] = ["campaign"];

export function route(params: {
  kind: NotificationKind;
  recipient: RecipientProfile;
  now?: Date;
  /** WhatsApp 24 saatlik service window bitişi (varsa). */
  serviceWindowEndsAt?: Date | null;
  /** Yönetici "acil" işaretlediyse. */
  forceUrgent?: boolean;
  /** Tenant'ın SMS kotası dolduysa SMS yerine e-posta kullanılır. */
  smsQuotaExhausted?: boolean;
}): RoutingDecision {
  const now = params.now ?? new Date();
  const urgent = params.forceUrgent || URGENT_KINDS.includes(params.kind);
  const skipped: string[] = [];
  const channels: Channel[] = [];

  const withinWindow =
    !!params.serviceWindowEndsAt && params.serviceWindowEndsAt.getTime() > now.getTime();

  // Pazarlama iletisi yalnızca açık rıza varsa (İYS/KVKK).
  if (MARKETING_KINDS.includes(params.kind) && !params.recipient.marketingOptIn) {
    return {
      channels: ["in_app"],
      scheduledFor: now,
      templateName: KIND_TEMPLATE[params.kind],
      useFreeform: false,
      estimatedCostKurus: 0,
      skippedReasons: ["Pazarlama izni yok — yalnızca uygulama içi gösterim."],
    };
  }

  const canWhatsapp =
    siteConfig.features.whatsappBot && params.recipient.whatsappOptIn && !!params.recipient.phone;
  const canSms = siteConfig.features.smsNotify && !!params.recipient.phone;
  const canEmail = !!params.recipient.email;

  if (urgent) {
    // Acil durum: tüm kanallar (Bölüm 6.4 "acil durum override").
    if (canWhatsapp) channels.push("whatsapp");
    if (canSms && !params.smsQuotaExhausted) channels.push("sms");
    if (canEmail) channels.push("email");
    if (params.recipient.hasAppSession) channels.push("push");
    channels.push("in_app");
  } else if (canWhatsapp) {
    channels.push("whatsapp");
    channels.push("in_app");
  } else if (canSms && !params.smsQuotaExhausted) {
    channels.push("sms");
    channels.push("in_app");
    skipped.push("WhatsApp izni yok — SMS kullanıldı.");
  } else if (canEmail) {
    channels.push("email");
    channels.push("in_app");
    skipped.push(
      params.smsQuotaExhausted
        ? "SMS kotası doldu — e-posta kullanıldı."
        : "Telefon bilgisi yok — e-posta kullanıldı.",
    );
  } else {
    channels.push("in_app");
    skipped.push("Ulaşılabilir kanal yok — yalnızca uygulama içi bildirim.");
  }

  const scheduledFor = nextAllowedSendTime(now, {
    urgent,
    quietStart: siteConfig.notifications.quietHours.start,
    quietEnd: siteConfig.notifications.quietHours.end,
    deferHour: siteConfig.notifications.deferredSendHour,
  });

  const useFreeform = withinWindow && channels.includes("whatsapp");
  const estimatedCostKurus = channels.reduce(
    (sum, c) => sum + (c === "whatsapp" && useFreeform ? 0 : COST_KURUS[c]),
    0,
  );

  return {
    channels,
    scheduledFor,
    templateName: KIND_TEMPLATE[params.kind],
    useFreeform,
    estimatedCostKurus,
    skippedReasons: skipped,
  };
}

/** Aylık maliyet tahmini — Bölüm 8.3 (~0,50 ₺/sakin/ay hedefi). */
export function estimateMonthlyCostKurus(params: {
  residentCount: number;
  whatsappOptInRate: number;
  messagesPerResidentPerMonth: number;
  freeWindowRatio?: number;
}): { totalKurus: Kurus; perResidentKurus: Kurus } {
  const freeRatio = params.freeWindowRatio ?? 0.8;
  const waResidents = params.residentCount * params.whatsappOptInRate;
  const smsResidents = params.residentCount - waResidents;

  const waMessages = waResidents * params.messagesPerResidentPerMonth;
  const paidWaMessages = waMessages * (1 - freeRatio);
  const smsMessages = smsResidents * params.messagesPerResidentPerMonth;

  const total = Math.round(paidWaMessages * COST_KURUS.whatsapp + smsMessages * COST_KURUS.sms);
  return {
    totalKurus: total,
    perResidentKurus: params.residentCount > 0 ? Math.round(total / params.residentCount) : 0,
  };
}
