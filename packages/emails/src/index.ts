import { serverEnv, siteConfig } from "@yonetim/config";
import { Err, Ok, errors, withRetry, type Result } from "@yonetim/core";

export * from "./templates";

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}

/** Resend ile e-posta gönderimi — SPEC Bölüm 7.4. */
export async function sendEmail(message: EmailMessage): Promise<Result<{ id: string }>> {
  const cfg = serverEnv.resend();
  if (!cfg.apiKey) {
    console.info(`[email:console] → ${message.to}\n${message.subject}`);
    return Ok({ id: `console-${Date.now()}` });
  }
  const from = cfg.from ?? `${siteConfig.brand.name} <bilgi@${siteConfig.domains.mail}>`;

  try {
    const json = await withRetry(
      async () => {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: Array.isArray(message.to) ? message.to : [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            reply_to: message.replyTo,
            attachments: message.attachments,
          }),
        });
        if (!r.ok) throw new Error(`Resend HTTP ${r.status}: ${await r.text()}`);
        return (await r.json()) as { id: string };
      },
      { attempts: 3 },
    );
    return Ok(json);
  } catch (error) {
    return Err(errors.integrationUnavailable(`Resend (${(error as Error).message})`));
  }
}
