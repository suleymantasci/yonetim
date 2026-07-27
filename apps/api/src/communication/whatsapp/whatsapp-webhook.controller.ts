import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request } from "express";

import { RATE_LIMITS, rateLimit } from "@yonetim/auth/rate-limit";
import {
  parseWebhook,
  verifyWebhookSignature,
  verifyWebhookSubscription,
} from "@yonetim/whatsapp";

import { Public } from "../../identity/decorators";
import { WhatsappBotService } from "./whatsapp-bot.service";

/**
 * WhatsApp Cloud API webhook — SPEC Bölüm 3.1 / 3.2 / 7.5.
 *
 * NEDEN `apps/api`'DE: bot her mesajda borç bakiyesi okuyor, talep açıyor ve
 * konuşma durumunu kalıcılaştırıyor — hepsi veritabanı işi.
 *
 * İMZA HAM GÖVDE ÜZERİNDEN doğrulanıyor. Bu yüzden bu uç `express.raw`
 * gövdesini okuyor: JSON parse edilip yeniden serialize edilmiş bir gövde,
 * anahtar sırası veya boşluk farkı yüzünden farklı bir HMAC üretir ve geçerli
 * bir isteği reddettirir.
 *
 * İmza geçmeden **hiçbir** işlem yapılmıyor: uç halka açık ve doğrulanmamış
 * bir gövdeyi ayrıştırmak bile saldırı yüzeyi.
 */
@ApiExcludeController()
@Controller("v1/webhooks/whatsapp")
export class WhatsappWebhookController {
  constructor(private readonly bot: WhatsappBotService) {}

  /** Meta'nın abonelik doğrulaması — challenge'ı düz metin döndürür. */
  @Get()
  @Public()
  verify(@Query() query: Record<string, string>): string {
    const challenge = verifyWebhookSubscription(new URLSearchParams(query));
    if (!challenge) throw new UnauthorizedException("verification_failed");
    return challenge;
  }

  @Post()
  @Public()
  @HttpCode(200)
  async receive(
    @Req() req: Request,
    @Headers("x-hub-signature-256") signature?: string,
  ) {
    const raw = rawBody(req);
    if (!verifyWebhookSignature(raw, signature ?? null)) {
      throw new UnauthorizedException("invalid_signature");
    }

    const { messages: inbound, statuses } = parseWebhook(JSON.parse(raw));

    for (const status of statuses) {
      await this.bot.recordStatus(status);
    }

    for (const message of inbound) {
      // Hız sınırı gönderen numara başına: bot bir kişiyle saniyede onlarca
      // mesaj konuşmaz, ama açık bir uç bunu denemeye davet eder.
      const limit = await rateLimit(RATE_LIMITS.whatsappInbound, message.from);
      if (!limit.allowed) continue;
      await this.bot.handleInbound(message);
    }

    // Meta 200 dışında bir yanıtta mesajı **tekrar** gönderir. Tek bir sakinin
    // mesajı işlenirken hata alınsa bile 200 dönüyoruz; aksi halde aynı mesaj
    // sonsuza kadar yeniden teslim edilirdi.
    return { ok: true };
  }
}

/**
 * `main.ts` bu yol için ham gövdeyi `req.rawBody`'ye koyuyor. Yoksa gövdeyi
 * yeniden üretmek yerine boş string dönüyoruz — imza doğrulaması da düşer,
 * yani "sessizce yanlış" değil "açıkça reddedilmiş" oluyor.
 */
function rawBody(req: Request): string {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  return raw ? raw.toString("utf8") : "";
}
