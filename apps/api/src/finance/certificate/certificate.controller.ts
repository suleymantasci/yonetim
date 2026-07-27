import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  debtCertificateIssue,
  type DebtCertificateIssue,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { CertificateService } from "./certificate.service";

/** Borcu yoktur belgesi — `/v1/panel/certificates`. */
@ApiTags("panel/certificates")
@Controller("v1/panel/certificates")
export class CertificateController {
  constructor(private readonly service: CertificateService) {}

  @Get()
  @RequirePermission("debt:read")
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermission("debt:read")
  @ApiOperation({
    summary: "Belge üret",
    description:
      "Belge verildiği anın fotoğrafıdır: `asOfDate` ve o andaki bakiye " +
      "kaydedilir. Seri numarası aynı transaction içinde sayaçtan türer, " +
      "böylece eşzamanlı iki talep aynı numarayı alamaz.",
  })
  issue(
    @Body(new ZodBodyPipe(debtCertificateIssue)) dto: DebtCertificateIssue,
  ) {
    return this.service.issue(dto);
  }
}
