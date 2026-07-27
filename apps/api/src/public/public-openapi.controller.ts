import { Controller, Get, Header } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";

import { Public } from "../identity/decorators";
import { OPENAPI_V1_DOCUMENT } from "./public-v1.openapi";

/**
 * `GET /api/v1` — dış sözleşmenin OpenAPI açıklaması.
 *
 * Kimlik gerektirmez: entegrasyon yazan geliştirici anahtarını almadan önce
 * uçların ne döndürdüğünü görebilmeli. Doküman veri içermiyor, yalnız şekil
 * anlatıyor.
 */
@ApiTags("v1")
@Controller("api/v1")
export class PublicOpenApiController {
  @Get()
  @Public()
  // Panel Swagger'ında görünmesi anlamsız: bu uç zaten dokümanın kendisi.
  @ApiExcludeEndpoint()
  @Header("Cache-Control", "public, max-age=300")
  document() {
    return OPENAPI_V1_DOCUMENT;
  }
}
