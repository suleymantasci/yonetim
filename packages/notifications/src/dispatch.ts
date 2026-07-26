import { sendEmail } from "@yonetim/emails";
import { sendSms } from "@yonetim/sms";
import { renderTemplate, sendTemplate, sendText } from "@yonetim/whatsapp";
import type { Channel } from "@yonetim/core";

import type { RoutingDecision } from "./router";

/**
 * Kanal bazlı gönderim — SPEC Faz 5.
 * Not: Kalıcılık (notifications tablosu) app katmanında yapılır; bu modül
 * yalnızca sağlayıcıya iletir ve sonucu döner.
 */
export interface DispatchTarget {
  phone?: string | null;
  email?: string | null;
}

export interface DispatchPayload {
  templateName: string;
  templateParams: string[];
  subject?: string;
  html?: string;
  /** Serbest metin (WhatsApp service window içinde / uygulama içi). */
  freeformText?: string;
}

export interface DispatchOutcome {
  channel: Channel;
  ok: boolean;
  providerRef?: string;
  provider?: string;
  error?: string;
}

export async function dispatch(
  decision: RoutingDecision,
  target: DispatchTarget,
  payload: DispatchPayload,
): Promise<DispatchOutcome[]> {
  const results: DispatchOutcome[] = [];

  for (const channel of decision.channels) {
    switch (channel) {
      case "whatsapp": {
        if (!target.phone) {
          results.push({ channel, ok: false, error: "Telefon yok" });
          break;
        }
        const res = decision.useFreeform
          ? await sendText(
              target.phone,
              payload.freeformText ?? renderTemplate(payload.templateName, payload.templateParams),
            )
          : await sendTemplate(target.phone, payload.templateName, payload.templateParams);
        results.push(
          res.ok
            ? { channel, ok: true, providerRef: res.value.messageId, provider: "meta_cloud" }
            : { channel, ok: false, error: res.error.message },
        );
        break;
      }

      case "sms": {
        if (!target.phone) {
          results.push({ channel, ok: false, error: "Telefon yok" });
          break;
        }
        const body =
          payload.freeformText ?? renderTemplate(payload.templateName, payload.templateParams);
        const res = await sendSms({ to: target.phone, body, isOtp: payload.templateName === "otp_login" });
        results.push(
          res.ok
            ? { channel, ok: true, providerRef: res.value.providerRef, provider: res.value.provider }
            : { channel, ok: false, error: res.error.message },
        );
        break;
      }

      case "email": {
        if (!target.email || !payload.html) {
          results.push({ channel, ok: false, error: "E-posta veya içerik yok" });
          break;
        }
        const res = await sendEmail({
          to: target.email,
          subject: payload.subject ?? "Bildirim",
          html: payload.html,
        });
        results.push(
          res.ok
            ? { channel, ok: true, providerRef: res.value.id, provider: "resend" }
            : { channel, ok: false, error: res.error.message },
        );
        break;
      }

      case "in_app":
      case "push":
      case "voice":
        // in_app: DB'ye yazılır (app katmanı). push/voice: Faz 17 / opsiyonel.
        results.push({ channel, ok: true, provider: "internal" });
        break;

      default:
        results.push({ channel, ok: false, error: "Bilinmeyen kanal" });
    }
  }

  return results;
}
