import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { RequirePermission } from "../../identity/decorators";
import { DocumentService } from "./document.service";

/** Panel iç BFF yüzeyi — belge, hukuk, KVKK. */
@ApiTags("panel/governance")
@Controller("v1/panel")
export class DocumentController {
  constructor(private readonly service: DocumentService) {}

  @Get("documents")
  @RequirePermission("document:read")
  documents() {
    return this.service.documents();
  }

  @Get("legal")
  @RequirePermission("legal:read")
  @ApiOperation({
    summary: "İcra/hukuk dosyaları",
    description:
      "Tahsil edilebilirlik puanı yanında `scoreFactors` da dönüyor: icra " +
      "kararı verirken 'neden bu puan' sorusunun cevabı ekranda olmalı.",
  })
  legalCases() {
    return this.service.legalCases();
  }

  @Get("kvkk")
  @RequirePermission("kvkk:read")
  @ApiOperation({
    summary: "KVKK başvuruları ve uyum göstergeleri",
    description:
      "`overdue` KVKK md.13'teki 30 günlük süreye göre sunucuda hesaplanır.",
  })
  kvkk() {
    return this.service.kvkkOverview();
  }
}
