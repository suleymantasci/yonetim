import { createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@yonetim/config";
import { Err, Ok, errors, isDemoPhone, withRetry, type Result } from "@yonetim/core";

/**
 * WhatsApp Business Platform (Meta Cloud API) istemcisi — SPEC Bölüm 7.5.
 * Maliyet stratejisi: service window içinde serbest metin (ücretsiz),
 * dışında yalnızca **utility** template (Bölüm 8.3 — marketing template yasak).
 */

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface WhatsAppListItem {
  id: string;
  title: string;
  description?: string;
}

interface SendResult {
  messageId: string;
  /** Meta faturalama kategorisi. */
  category: "service" | "utility" | "authentication" | "marketing";
}

function config() {
  const wa = serverEnv.whatsapp();
  if (!wa.phoneNumberId || !wa.accessToken) return null;
  return wa;
}

export function isWhatsAppConfigured(): boolean {
  return config() !== null;
}

async function call(path: string, body: unknown): Promise<Result<Record<string, unknown>>> {
  // Demo kişilerine (+90 500 …) hiçbir yoldan mesaj gitmez — bkz. `isDemoPhone`.
  const to = (body as { to?: unknown } | null)?.to;
  if (path === "messages" && typeof to === "string" && isDemoPhone(to)) {
    return Ok({ messages: [{ id: "suppressed-demo-recipient" }] });
  }
  const wa = config();
  if (!wa) return Err(errors.integrationUnavailable("WhatsApp"));

  try {
    const res = await withRetry(
      async () => {
        const r = await fetch(
          `https://graph.facebook.com/${wa.apiVersion}/${wa.phoneNumberId}/${path}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${wa.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          },
        );
        if (!r.ok) {
          const text = await r.text();
          const err = new Error(`WhatsApp API ${r.status}: ${text}`);
          (err as Error & { status?: number }).status = r.status;
          throw err;
        }
        return (await r.json()) as Record<string, unknown>;
      },
      {
        attempts: 3,
        isRetryable: (e) => {
          const status = (e as { status?: number }).status;
          return status === undefined || status >= 500 || status === 429;
        },
      },
    );
    return Ok(res);
  } catch (error) {
    return Err(errors.integrationUnavailable(`WhatsApp (${(error as Error).message})`));
  }
}

function messageId(res: Record<string, unknown>): string {
  const messages = res.messages as { id?: string }[] | undefined;
  return messages?.[0]?.id ?? "";
}

export async function sendText(
  to: string,
  text: string,
  opts: { previewUrl?: boolean } = {},
): Promise<Result<SendResult>> {
  const res = await call("messages", {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace("+", ""),
    type: "text",
    text: { body: text, preview_url: opts.previewUrl ?? true },
  });
  if (!res.ok) return res;
  return Ok({ messageId: messageId(res.value), category: "service" });
}

export async function sendButtons(
  to: string,
  body: string,
  buttons: WhatsAppButton[],
  opts: { header?: string; footer?: string } = {},
): Promise<Result<SendResult>> {
  const res = await call("messages", {
    messaging_product: "whatsapp",
    to: to.replace("+", ""),
    type: "interactive",
    interactive: {
      type: "button",
      ...(opts.header ? { header: { type: "text", text: opts.header } } : {}),
      body: { text: body },
      ...(opts.footer ? { footer: { text: opts.footer } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
  if (!res.ok) return res;
  return Ok({ messageId: messageId(res.value), category: "service" });
}

export async function sendList(
  to: string,
  body: string,
  items: WhatsAppListItem[],
  opts: { buttonText?: string; header?: string; sectionTitle?: string } = {},
): Promise<Result<SendResult>> {
  const res = await call("messages", {
    messaging_product: "whatsapp",
    to: to.replace("+", ""),
    type: "interactive",
    interactive: {
      type: "list",
      ...(opts.header ? { header: { type: "text", text: opts.header } } : {}),
      body: { text: body },
      action: {
        button: (opts.buttonText ?? "Seçenekler").slice(0, 20),
        sections: [
          {
            title: (opts.sectionTitle ?? "Menü").slice(0, 24),
            rows: items.slice(0, 10).map((i) => ({
              id: i.id,
              title: i.title.slice(0, 24),
              ...(i.description ? { description: i.description.slice(0, 72) } : {}),
            })),
          },
        ],
      },
    },
  });
  if (!res.ok) return res;
  return Ok({ messageId: messageId(res.value), category: "service" });
}

/** Onaylı utility template gönderimi (service window dışında tek yol). */
export async function sendTemplate(
  to: string,
  templateName: string,
  params: string[],
  opts: { language?: string; category?: SendResult["category"] } = {},
): Promise<Result<SendResult>> {
  const res = await call("messages", {
    messaging_product: "whatsapp",
    to: to.replace("+", ""),
    type: "template",
    template: {
      name: templateName,
      language: { code: opts.language ?? "tr" },
      components: params.length
        ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }]
        : [],
    },
  });
  if (!res.ok) return res;
  return Ok({ messageId: messageId(res.value), category: opts.category ?? "utility" });
}

export async function markAsRead(messageIdValue: string): Promise<Result<true>> {
  const res = await call("messages", {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageIdValue,
  });
  return res.ok ? Ok(true) : res;
}

/** Meta webhook imza doğrulaması (X-Hub-Signature-256). */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const wa = config();
  if (!wa?.appSecret || !signatureHeader) return false;
  const expected =
    "sha256=" + createHmac("sha256", wa.appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** GET webhook doğrulama (hub.challenge). */
export function verifyWebhookSubscription(params: URLSearchParams): string | null {
  const wa = config();
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode === "subscribe" && wa?.verifyToken && token === wa.verifyToken) return challenge;
  return null;
}

export interface InboundMessage {
  from: string;
  messageId: string;
  timestamp: Date;
  type: string;
  text: string;
  /** interactive yanıtlarda seçilen id. */
  replyId?: string;
  mediaId?: string;
  profileName?: string;
}

/** Meta webhook gövdesinden gelen mesajları normalize eder. */
export function parseWebhook(body: unknown): {
  messages: InboundMessage[];
  statuses: { messageId: string; status: string; recipient: string; timestamp: Date }[];
} {
  const messages: InboundMessage[] = [];
  const statuses: { messageId: string; status: string; recipient: string; timestamp: Date }[] = [];

  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as { changes?: unknown[] }[]) {
    for (const change of entry.changes ?? []) {
      const value = (change as { value?: Record<string, unknown> }).value ?? {};
      const contacts = (value.contacts as { profile?: { name?: string } }[] | undefined) ?? [];
      const profileName = contacts[0]?.profile?.name;

      for (const m of (value.messages as Record<string, unknown>[] | undefined) ?? []) {
        const type = String(m.type ?? "text");
        let text = "";
        let replyId: string | undefined;
        if (type === "text") {
          text = String((m.text as { body?: string })?.body ?? "");
        } else if (type === "interactive") {
          const inter = m.interactive as Record<string, Record<string, string>>;
          const reply = inter?.button_reply ?? inter?.list_reply;
          replyId = reply?.id;
          text = reply?.title ?? reply?.id ?? "";
        } else if (type === "button") {
          text = String((m.button as { text?: string })?.text ?? "");
        }
        messages.push({
          from: `+${String(m.from ?? "")}`,
          messageId: String(m.id ?? ""),
          timestamp: new Date(Number(m.timestamp ?? Date.now() / 1000) * 1000),
          type,
          text,
          replyId,
          mediaId:
            type === "image" || type === "document" || type === "audio"
              ? String((m[type] as { id?: string })?.id ?? "")
              : undefined,
          profileName,
        });
      }

      for (const s of (value.statuses as Record<string, unknown>[] | undefined) ?? []) {
        statuses.push({
          messageId: String(s.id ?? ""),
          status: String(s.status ?? ""),
          recipient: `+${String(s.recipient_id ?? "")}`,
          timestamp: new Date(Number(s.timestamp ?? Date.now() / 1000) * 1000),
        });
      }
    }
  }
  return { messages, statuses };
}
