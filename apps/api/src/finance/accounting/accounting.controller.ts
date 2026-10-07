import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  baBsQuery,
  balanceSheetQuery,
  journalQuery,
  ledgerQuery,
  mizanQuery,
  openingSave,
  rangeQuery,
  unitStatementQuery,
  type OpeningSave,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { AccountingService } from "./accounting.service";
import { OpeningService } from "./opening.service";
import { StatementService } from "./statement.service";

/** Muhasebe raporları — sentetik mizan ve BA/BS. */
@ApiTags("panel/reports")
@Controller("v1/panel/reports/accounting")
export class AccountingController {
  constructor(
    private readonly service: AccountingService,
    private readonly opening: OpeningService,
    private readonly statements: StatementService,
  ) {}

  @Get("income-statement")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Dönemsel gelir-gider tablosu (aylık sütunlar)" })
  incomeStatement(@Query() query: Record<string, string>) {
    const input = rangeQuery.parse(query);
    return this.statements.incomeStatement(input.from, input.to);
  }

  @Get("balance-sheet")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Bilanço — aktif / pasif / özkaynak (dönem sonucu dahil)" })
  balanceSheet(@Query() query: Record<string, string>) {
    return this.statements.balanceSheet(balanceSheetQuery.parse(query).at);
  }

  @Get("ledger")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Kebir — tek hesabın devirli hareket dökümü" })
  ledger(@Query() query: Record<string, string>) {
    const input = ledgerQuery.parse(query);
    return this.statements.ledger(input.code, input.from, input.to);
  }

  @Get("operating-book")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "İşletme defteri (KMK 35) — kasa/banka giriş-çıkışları, kümülatif" })
  operatingBook(@Query() query: Record<string, string>) {
    const input = rangeQuery.parse(query);
    return this.statements.operatingBook(input.from, input.to);
  }

  @Get("unit-statements")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Toplu hesap özeti — bağımsız bölüm başına devir/borç/tahsilat/bakiye" })
  unitStatements(@Query() query: Record<string, string>) {
    const input = unitStatementQuery.parse(query);
    return this.statements.unitStatements({
      from: input.from,
      to: input.to,
      unitId: input.unitId,
      detail: input.detail === "1",
      onlyOpen: input.onlyOpen === "1",
    });
  }

  @Get("activity")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Faaliyet / denetim raporu gövdesi — dönemin mali ve operasyon özeti" })
  activity(@Query() query: Record<string, string>) {
    const input = rangeQuery.parse(query);
    return this.statements.activitySummary(input.from, input.to);
  }

  @Get("mizan")
  @RequirePermission("report:read")
  @ApiOperation({
    summary: "Dönem mizanı (sentetik çift kayıt)",
    description: "Borç/tahsilat/gider kayıtlarından Tek Düzen Hesap Planı kodlarına türetilir.",
  })
  mizan(@Query() query: Record<string, string>) {
    const input = mizanQuery.parse(query);
    return this.service.mizan(input.from, input.to);
  }

  @Get("ba-bs")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Aylık BA/BS listesi (KDV hariç 5.000 TL eşiği)" })
  baBs(@Query() query: Record<string, string>) {
    return this.service.baBs(baBsQuery.parse(query).period);
  }

  @Get("journal")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Yevmiye defteri — aralıktaki fişler (en çok 1500)" })
  journal(@Query() query: Record<string, string>) {
    const input = journalQuery.parse(query);
    return this.service.journal(input.from, input.to);
  }

  @Get("opening")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Açılış fişi — geçiş tarihindeki bakiyeler" })
  getOpening() {
    return this.opening.get();
  }

  @Put("opening")
  @RequirePermission("settings:write")
  @ApiOperation({
    summary: "Açılış fişini kaydet",
    description:
      "Kasa/banka/tedarikçi muhasebe açılışı, personel açılış bakiyeleri ve " +
      "sakin devir borçları (gerçek borç). Tahsilat almış devir borcu değişmez.",
  })
  saveOpening(@Body(new ZodBodyPipe(openingSave)) dto: OpeningSave) {
    return this.opening.save(dto);
  }
}
