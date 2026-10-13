import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";

import { AssistantService } from "./assistant.service";

/**
 * Dijital Asistan veri ucu — `/v1/dijital-asistan/{context,run}`.
 *
 * Panel sayfasındaki Dijital Asistan script'i aynı origin'den, yalnız oturum
 * çereziyle çağırır. Yetki araç düzeyinde: rol araç listesini belirler, her
 * `run` çağrısı kapsamı yeniden kontrol eder. Hata gövdesi sözleşmedeki
 * `{ error: { message } }` biçiminde.
 */
@ApiTags("panel/assistant")
@Controller("v1/dijital-asistan")
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post("context")
  @HttpCode(200)
  @ApiOperation({ summary: "Giriş yapan kullanıcının takma adı, imza, araçlar ve ekranlar" })
  context(@Req() request: Request, @Res() response: Response) {
    return this.reply(response, () => this.assistant.context(request));
  }

  @Post("run")
  @HttpCode(200)
  @ApiOperation({ summary: "Bir aracı kullanıcının yetkisiyle çalıştırır (borç, ödemeler, takvim)" })
  run(@Req() request: Request, @Res() response: Response, @Body() body: unknown) {
    return this.reply(response, () => this.assistant.run(request, body));
  }

  private async reply(response: Response, task: () => Promise<unknown>) {
    response.setHeader("Cache-Control", "no-store, private");
    try {
      response.status(200).json(await task());
    } catch (error) {
      const status = typeof (error as { getStatus?: () => number }).getStatus === "function" ? (error as { getStatus: () => number }).getStatus() : 500;
      const body = status === 500 ? { error: { message: "Kayıt şu an alınamadı." } } : (error as { getResponse: () => unknown }).getResponse();
      response.status(status).json(body);
    }
  }
}
