import { serverEnv } from "@yonetim/config";
import {
  CircuitBreaker, Err, Ok, errors, failover, normalizePhone, withRetry, type Result,
} from "@yonetim/core";

/**
 * SMS sağlayıcı adaptörleri — SPEC Bölüm 7.3.
 * Primary: Netgsm, Backup: İleti Merkezi. Adapter pattern + otomatik failover.
 */

export type SmsProviderName = "netgsm" | "iletimerkezi" | "console";

export interface SmsMessage {
  to: string;
  body: string;
  /** OTP mesajları ayrı raporlanır (Bölüm 8.2). */
  isOtp?: boolean;
}

export interface SmsSendResult {
  provider: SmsProviderName;
  providerRef: string;
  /** Türkçe karakter kullanıldığında SMS 70 karakterde bölünür. */
  parts: number;
  unicode: boolean;
}

export interface SmsProvider {
  name: SmsProviderName;
  isConfigured(): boolean;
  send(message: SmsMessage): Promise<Result<SmsSendResult>>;
}

/** Türkçe karakter → SMS uzunluk hesabı (GSM-7 vs UCS-2). */
export function smsSegments(body: string): { parts: number; unicode: boolean; chars: number } {
  const unicode = /[ğĞıİşŞçÇöÖüÜ]/.test(body) === false ? /[^\x00-\x7F]/.test(body) : true;
  const limit = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const chars = body.length;
  const parts = chars <= limit ? 1 : Math.ceil(chars / multi);
  return { parts, unicode, chars };
}

/** Türkçe karakterleri ASCII'ye indirger (maliyet düşürme opsiyonu). */
export function deasciify(body: string): string {
  const map: Record<string, string> = {
    ğ: "g", Ğ: "G", ı: "i", İ: "I", ş: "s", Ş: "S",
    ç: "c", Ç: "C", ö: "o", Ö: "O", ü: "u", Ü: "U",
  };
  return body.replace(/[ğĞıİşŞçÇöÖüÜ]/g, (c) => map[c] ?? c);
}

class NetgsmProvider implements SmsProvider {
  readonly name = "netgsm" as const;

  isConfigured(): boolean {
    const c = serverEnv.netgsm();
    return !!(c.userCode && c.password && c.msgHeader);
  }

  async send(message: SmsMessage): Promise<Result<SmsSendResult>> {
    const c = serverEnv.netgsm();
    if (!this.isConfigured()) return Err(errors.integrationUnavailable("Netgsm"));
    const phone = normalizePhone(message.to);
    if (!phone) return Err(errors.validation("Geçersiz telefon numarası."));

    const seg = smsSegments(message.body);
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<mainbody><header><company dil="TR">Netgsm</company>` +
      `<usercode>${c.userCode}</usercode><password>${c.password}</password>` +
      `<type>${seg.unicode ? "1:n" : "1:n"}</type><msgheader>${c.msgHeader}</msgheader></header>` +
      `<body><msg><![CDATA[${message.body}]]></msg><no>${phone.replace("+90", "0")}</no></body></mainbody>`;

    try {
      const text = await withRetry(async () => {
        const r = await fetch("https://api.netgsm.com.tr/sms/send/xml", {
          method: "POST",
          headers: { "Content-Type": "text/xml; charset=utf-8" },
          body: xml,
        });
        if (!r.ok) throw new Error(`Netgsm HTTP ${r.status}`);
        return r.text();
      });

      const [code, ref] = text.trim().split(" ");
      if (code !== "00" && code !== "01" && code !== "02") {
        return Err(errors.integrationUnavailable(`Netgsm hata kodu ${code}`));
      }
      return Ok({ provider: this.name, providerRef: ref ?? "", parts: seg.parts, unicode: seg.unicode });
    } catch (error) {
      return Err(errors.integrationUnavailable(`Netgsm (${(error as Error).message})`));
    }
  }
}

class IletimerkeziProvider implements SmsProvider {
  readonly name = "iletimerkezi" as const;

  isConfigured(): boolean {
    const c = serverEnv.iletimerkezi();
    return !!(c.key && c.hash && c.sender);
  }

  async send(message: SmsMessage): Promise<Result<SmsSendResult>> {
    const c = serverEnv.iletimerkezi();
    if (!this.isConfigured()) return Err(errors.integrationUnavailable("İleti Merkezi"));
    const phone = normalizePhone(message.to);
    if (!phone) return Err(errors.validation("Geçersiz telefon numarası."));
    const seg = smsSegments(message.body);

    try {
      const json = await withRetry(async () => {
        const r = await fetch("https://api.iletimerkezi.com/v1/send-sms/json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request: {
              authentication: { key: c.key, hash: c.hash },
              order: {
                sender: c.sender,
                sendDateTime: [],
                message: { text: message.body, receipents: { number: [phone.replace("+", "")] } },
              },
            },
          }),
        });
        if (!r.ok) throw new Error(`İletiMerkezi HTTP ${r.status}`);
        return (await r.json()) as { response?: { status?: { code?: string }; order?: { id?: string } } };
      });

      const code = json.response?.status?.code;
      if (code !== "200") return Err(errors.integrationUnavailable(`İleti Merkezi kodu ${code}`));
      return Ok({
        provider: this.name,
        providerRef: json.response?.order?.id ?? "",
        parts: seg.parts,
        unicode: seg.unicode,
      });
    } catch (error) {
      return Err(errors.integrationUnavailable(`İleti Merkezi (${(error as Error).message})`));
    }
  }
}

/** Geliştirme ortamı: konsola yazar, gerçek SMS göndermez. */
class ConsoleProvider implements SmsProvider {
  readonly name = "console" as const;
  isConfigured(): boolean {
    return true;
  }
  async send(message: SmsMessage): Promise<Result<SmsSendResult>> {
    const seg = smsSegments(message.body);
    console.info(`[sms:console] → ${message.to}\n${message.body}`);
    return Ok({
      provider: this.name,
      providerRef: `console-${Date.now()}`,
      parts: seg.parts,
      unicode: seg.unicode,
    });
  }
}

const netgsm = new NetgsmProvider();
const iletimerkezi = new IletimerkeziProvider();
const consoleProvider = new ConsoleProvider();

const breakers = new Map<SmsProvider, CircuitBreaker>([
  [netgsm, new CircuitBreaker("netgsm")],
  [iletimerkezi, new CircuitBreaker("iletimerkezi")],
]);

/** Yapılandırılmış sağlayıcılar, öncelik sırasıyla (Bölüm 7.3 stratejisi). */
export function activeProviders(): SmsProvider[] {
  const list = [netgsm, iletimerkezi].filter((p) => p.isConfigured());
  return list.length > 0 ? list : [consoleProvider];
}

/** Failover ile SMS gönderir. */
export async function sendSms(message: SmsMessage): Promise<Result<SmsSendResult>> {
  try {
    const { result } = await failover(
      activeProviders(),
      async (provider) => {
        const res = await provider.send(message);
        if (!res.ok) throw res.error;
        return res.value;
      },
      { breakers },
    );
    return Ok(result);
  } catch (error) {
    return Err(
      error instanceof Error && "code" in error
        ? (error as never)
        : errors.integrationUnavailable("SMS"),
    );
  }
}

export { netgsm, iletimerkezi, consoleProvider };
