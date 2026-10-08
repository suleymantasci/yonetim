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
  bankAccountSave,
  bankStatementImport,
  bankStatementPreviewRequest,
  bankTxConfirmBulk,
  bankTxExpense,
  type BankStatementPreviewRequest,
  type BankTxConfirmBulk,
  type BankTxExpense,
  bankTxConfirm,
  bankTxIgnore,
  migrationCommit,
  type BankAccountSave,
  type BankStatementImport,
  type BankTxConfirm,
  type BankTxIgnore,
  type MigrationCommit,
} from "@yonetim/contracts";

import { RequirePermission } from "../identity/decorators";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { BankAccountWriteService } from "./bank-account-write.service";
import { BankReconcileService } from "./bank-reconcile.service";
import { IntegrationService } from "./integration.service";

/** Panel iç BFF yüzeyi — banka mutabakatı ve veri göçü. */
@ApiTags("panel/integration")
@Controller("v1/panel")
export class IntegrationController {
  constructor(
    private readonly service: IntegrationService,
    private readonly accounts: BankAccountWriteService,
    private readonly reconcile: BankReconcileService,
  ) {}

  @Get("bank")
  @RequirePermission("bank:read")
  @ApiOperation({
    summary: "Banka hesapları, hareketler ve mutabakat sorunları",
    description:
      "IBAN yalnız maskeli döner; eşleştirme blind index ile sunucuda yapılır.",
  })
  bank() {
    return this.service.bankOverview();
  }

  /**
   * Banka hesabı tanımı — modülün **girişi**.
   *
   * Bu uç olmadan hesap tanımlanamıyor, dolayısıyla hareket de mutabakat da
   * boş kalıyordu: ekran çalışıyor gibi görünüp hiçbir şey yapamıyordu.
   */
  @Post("bank/accounts")
  @RequirePermission("bank:write")
  @ApiOperation({
    summary: "Banka hesabı tanımla",
    description:
      "IBAN mod-97 kontrol basamağıyla doğrulanır, şifrelenir ve yalnız " +
      "maskeli kopyası geri döner. Aynı IBAN ikinci kez tanımlanamaz " +
      "(blind index üzerinden kontrol): iki kayıt olsaydı gelen havale " +
      "ikisiyle de eşleşir ve mutabakat hangisine yazacağını bilemezdi.",
  })
  createBankAccount(
    @Body(new ZodBodyPipe(bankAccountSave)) dto: BankAccountSave,
  ) {
    return this.accounts.save(dto);
  }

  @Get("bank/accounts/:id")
  @RequirePermission("bank:write")
  @ApiOperation({ summary: "Banka hesabı detayı (düzenleme formu için)" })
  bankAccountDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.accounts.detail(id);
  }

  @Patch("bank/accounts/:id")
  @RequirePermission("bank:write")
  @ApiOperation({ summary: "Banka hesabını güncelle" })
  updateBankAccount(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(bankAccountSave)) dto: BankAccountSave,
  ) {
    return this.accounts.save(dto, id);
  }

  @Delete("bank/accounts/:id")
  @RequirePermission("bank:write")
  @ApiOperation({
    summary: "Banka hesabını kaldır",
    description:
      "Yumuşak silme: geçmiş ödemelerin hangi hesaba yattığı bilgisi " +
      "kaybolmamalı. Kapanan hesap için doğru işlem `isActive: false`.",
  })
  deleteBankAccount(@Param("id", ParseUUIDPipe) id: string) {
    return this.accounts.remove(id);
  }

  @Post("bank/statement/preview")
  @RequirePermission("bank:reconcile")
  @ApiOperation({
    summary: "Banka dökümünü önizle (yazmaz)",
    description:
      "xlsx / eski xls / HTML kılıklı xlsx / CSV okunur; başlık satırı ve sütun " +
      "anlamları tahmin edilir ya da hesabın kayıtlı eşleştirmesi uygulanır. " +
      "`mapping` verilirse o kullanılır (kullanıcı düzeltmesi).",
  })
  previewStatement(@Body(new ZodBodyPipe(bankStatementPreviewRequest)) dto: BankStatementPreviewRequest) {
    return this.reconcile.previewStatement(dto);
  }

  @Get("bank/queue")
  @RequirePermission("bank:reconcile")
  @ApiOperation({ summary: "Eşleştirme kuyruğu — tahsilat ve gider bekleyen hareketler" })
  queue() {
    return this.reconcile.queue();
  }

  @Post("bank/transactions/confirm-bulk")
  @RequirePermission("bank:reconcile")
  @ApiOperation({ summary: "Seçilen gelen hareketleri seçilen dairelere tahsil et" })
  confirmBulk(@Body(new ZodBodyPipe(bankTxConfirmBulk)) dto: BankTxConfirmBulk) {
    return this.reconcile.confirmBulk(dto);
  }

  @Post("bank/transactions/:id/expense")
  @RequirePermission("bank:reconcile")
  @ApiOperation({
    summary: "Çıkan hareketi ödenmiş gider olarak kaydet",
    description: "Tutar/tarih/hesap hareketten; `expense:write` de gerekir.",
  })
  recordExpense(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(bankTxExpense)) dto: BankTxExpense,
  ) {
    return this.reconcile.recordExpense(id, dto);
  }

  @Post("bank/statement")
  @RequirePermission("bank:reconcile")
  @ApiOperation({
    summary: "Banka dökümünü onaylanan eşleştirmeyle içe aktar",
    description:
      "Hareketler yazılır, gelenler için daire önerisi üretilir (`suggested`); " +
      "çıkanlar gider kuyruğuna düşer. Öneri tahsilat açmaz. Eşleştirme hesaba " +
      "kaydedilir. Aynı dökümün tekrar yüklenmesi hareketleri çoğaltmaz.",
  })
  importStatement(@Body(new ZodBodyPipe(bankStatementImport)) dto: BankStatementImport) {
    return this.reconcile.importStatement(dto);
  }

  @Post("bank/transactions/:id/confirm")
  @RequirePermission("bank:reconcile")
  @ApiOperation({
    summary: "Hareketi onayla — tahsilat kaydı açar",
    description:
      "`unitId` boşsa önerilen daire; doluysa elle seçim. `payment:create` de " +
      "gerekir. Zaten çözülmüş hareket 400 (`already_resolved`).",
  })
  confirmTransaction(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(bankTxConfirm)) dto: BankTxConfirm,
  ) {
    return this.reconcile.confirm(id, dto.unitId);
  }

  @Post("bank/transactions/:id/ignore")
  @RequirePermission("bank:reconcile")
  @ApiOperation({ summary: "Hareketi yok say (gerekçeli)" })
  ignoreTransaction(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(bankTxIgnore)) dto: BankTxIgnore,
  ) {
    return this.reconcile.ignore(id, dto.reason);
  }

  @Get("migrations")
  @RequirePermission("unit:write")
  migrations() {
    return this.service.migrations();
  }

  @Post("migrations")
  @RequirePermission("unit:write")
  @ApiOperation({
    summary: "Göçü uygula",
    description:
      "Dosya sunucuda **yeniden** ayrıştırılır; istemcinin hazır satırlarına " +
      "güvenmek önizlemeyle yazılanın ayrışmasına kapı açardı. Tamamı tek " +
      "transaction: yarım kalmış göç kabul edilemez.",
  })
  commitMigration(
    @Body(new ZodBodyPipe(migrationCommit)) dto: MigrationCommit,
  ) {
    return this.service.commitMigration(dto);
  }
}
