import nodemailer, { type Transporter } from "nodemailer";

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

/**
 * Demo kişilerinin adresleri (`*@demo.tasci.cloud`) hiçbir yoldan e-posta
 * almaz. Kural burada, en alt katmanda: demo yöneticisinin tetiklediği
 * bildirim, parola sıfırlama, giriş kodu — hangi yoldan gelirse gelsin bu
 * adreslere gönderim yapılmıyor. Var olmayan bir alana gönderim, sunucunun
 * gönderici itibarını geri dönen e-postalarla yıpratırdı.
 */
export function isBlockedRecipient(address: string): boolean {
  const domain = serverEnv.demo().emailDomain.toLowerCase();
  const at = address.lastIndexOf("@");
  if (at < 0) return false;
  const host = address.slice(at + 1).trim().toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

let _smtp: Transporter | undefined;
let _smtpKey = "";

function smtpTransport(): Transporter | null {
  const cfg = serverEnv.smtp();
  if (!cfg.host) return null;
  const key = `${cfg.host}:${cfg.port}:${cfg.user ?? ""}`;
  if (_smtp && _smtpKey === key) return _smtp;
  _smtp = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password ?? "" } : undefined,
    tls: cfg.tlsServername ? { servername: cfg.tlsServername } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  _smtpKey = key;
  return _smtp;
}

/**
 * E-posta gönderimi — SPEC Bölüm 7.4.
 *
 * Sıra: SMTP tanımlıysa SMTP (sunucudaki posta sunucusu), değilse Resend,
 * o da yoksa konsola yazılır (geliştirme).
 */
export async function sendEmail(message: EmailMessage): Promise<Result<{ id: string }>> {
  const recipients = (Array.isArray(message.to) ? message.to : [message.to]).filter(
    (address) => !isBlockedRecipient(address),
  );
  if (recipients.length === 0) {
    return Ok({ id: "suppressed-demo-recipient" });
  }

  const smtp = smtpTransport();
  if (smtp) {
    const cfg = serverEnv.smtp();
    const from = cfg.from ?? `${siteConfig.brand.name} <${cfg.user ?? `bilgi@${siteConfig.domains.mail}`}>`;
    try {
      const info = await withRetry(
        () =>
          smtp.sendMail({
            from,
            to: recipients,
            subject: message.subject,
            html: message.html,
            text: message.text,
            replyTo: message.replyTo,
            attachments: message.attachments,
          }),
        { attempts: 3 },
      );
      return Ok({ id: String(info.messageId ?? `smtp-${Date.now()}`) });
    } catch (error) {
      return Err(errors.integrationUnavailable(`SMTP (${(error as Error).message})`));
    }
  }

  const cfg = serverEnv.resend();
  if (!cfg.apiKey) {
    console.info(`[email:console] → ${recipients.join(", ")}\n${message.subject}`);
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
            to: recipients,
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
