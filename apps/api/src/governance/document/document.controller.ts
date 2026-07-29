import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  documentCreate,
  documentUploadUrlRequest,
  legalAmountEntry,
  legalCaseClose,
  legalCaseCreate,
  legalCaseUpdate,
  legalEventCreate,
  type DocumentCreate,
  type DocumentUploadUrlRequest,
  type LegalAmountEntry,
  type LegalCaseClose,
  type LegalCaseCreate,
  type LegalCaseUpdate,
  type LegalEventCreate,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { DocumentWriteService } from "./document-write.service";
import { DocumentService } from "./document.service";
import { LegalWriteService } from "./legal-write.service";

/** Panel iç BFF yüzeyi — belge, hukuk, KVKK. */
@ApiTags("panel/governance")
@Controller("v1/panel")
export class DocumentController {
  constructor(
    private readonly service: DocumentService,
    private readonly documentWrite: DocumentWriteService,
    private readonly legalWrite: LegalWriteService,
  ) {}

  @Get("documents")
  @RequirePermission("document:read")
  documents() {
    return this.service.documents();
  }

  @Post("documents/upload-url")
  @RequirePermission("document:write")
  @ApiOperation({
    summary: "Yükleme adresi üret — dosya API'den geçmiyor",
    description:
      "Tarayıcı imzalı adrese doğrudan yazıyor. Beyan edilen tür ve boyut " +
      "burada **ön** kontrolden geçiyor; bağlayıcı kontrol kayıt açılırken " +
      "nesnenin kendisine bakılarak yapılıyor (imza gövdeyi kapsamıyor).",
  })
  uploadUrl(
    @Body(new ZodBodyPipe(documentUploadUrlRequest)) dto: DocumentUploadUrlRequest,
  ) {
    return this.documentWrite.uploadUrl(dto);
  }

  @Post("documents")
  @RequirePermission("document:write")
  @ApiOperation({
    summary: "Yüklenen dosya için kayıt aç",
    description:
      "Nesnenin gerçek boyutu ve türü doğrulanır; kuralı çiğneyen dosya " +
      "depodan silinir. Anahtar bu sitenin önekiyle başlamak zorunda.",
  })
  createDocument(@Body(new ZodBodyPipe(documentCreate)) dto: DocumentCreate) {
    return this.documentWrite.create(dto);
  }

  @Get("documents/:id/download")
  @RequirePermission("document:read")
  @ApiOperation({
    summary: "Kısa ömürlü imzalı indirme adresi",
    description: "Erişim denetim kütüğüne yazılır (KVKK).",
  })
  download(@Param("id", ParseUUIDPipe) id: string) {
    return this.documentWrite.downloadUrl(id);
  }

  @Delete("documents/:id")
  @RequirePermission("document:write")
  @ApiOperation({ summary: "Belgeyi kaldır — kayıt yumuşak silinir, nesne silinir" })
  removeDocument(@Param("id", ParseUUIDPipe) id: string) {
    return this.documentWrite.remove(id);
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

  @Post("legal")
  @RequirePermission("legal:write")
  @ApiOperation({
    summary: "Dosya aç",
    description:
      "Ana para ve gecikme tazminatı dairenin açık borçlarından **sunucuda** " +
      "toplanır; istemciden tutar alınmaz. Aynı daireye ikinci açık dosya " +
      "açılamaz.",
  })
  createLegalCase(@Body(new ZodBodyPipe(legalCaseCreate)) dto: LegalCaseCreate) {
    return this.legalWrite.create(dto);
  }

  @Patch("legal/:id")
  @RequirePermission("legal:write")
  @ApiOperation({
    summary: "Aşama, dosya no ve sıradaki işlem",
    description: "Aşama değişikliği dosya kütüğüne otomatik yazılır.",
  })
  updateLegalCase(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(legalCaseUpdate)) dto: LegalCaseUpdate,
  ) {
    return this.legalWrite.update(id, dto);
  }

  @Post("legal/:id/events")
  @RequirePermission("legal:write")
  @ApiOperation({ summary: "Dosyaya olay/not ekle — duruşma, tebligat, görüşme" })
  addLegalEvent(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(legalEventCreate)) dto: LegalEventCreate,
  ) {
    return this.legalWrite.addEvent(id, dto);
  }

  @Post("legal/:id/amounts")
  @RequirePermission("legal:write")
  @ApiOperation({
    summary: "Masraf ya da tahsilat işle",
    description:
      "Tutar **artımlı** yazılır: mutlak yazma, aynı anda kaydedilen iki " +
      "tahsilattan birinin diğerini ezmesi demekti.",
  })
  addLegalAmount(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(legalAmountEntry)) dto: LegalAmountEntry,
  ) {
    return this.legalWrite.addAmount(id, dto);
  }

  @Post("legal/:id/close")
  @RequirePermission("legal:write")
  @ApiOperation({ summary: "Dosyayı kapat — gerekçe zorunlu" })
  closeLegalCase(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(legalCaseClose)) dto: LegalCaseClose,
  ) {
    return this.legalWrite.close(id, dto);
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
