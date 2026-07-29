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
  migrationCommit,
  type BankAccountSave,
  type MigrationCommit,
} from "@yonetim/contracts";

import { RequirePermission } from "../identity/decorators";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { BankAccountWriteService } from "./bank-account-write.service";
import { IntegrationService } from "./integration.service";

/** Panel iç BFF yüzeyi — banka mutabakatı ve veri göçü. */
@ApiTags("panel/integration")
@Controller("v1/panel")
export class IntegrationController {
  constructor(
    private readonly service: IntegrationService,
    private readonly accounts: BankAccountWriteService,
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
  @Post("bank/hesaplar")
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

  @Get("bank/hesaplar/:id")
  @RequirePermission("bank:write")
  @ApiOperation({ summary: "Banka hesabı detayı (düzenleme formu için)" })
  bankAccountDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.accounts.detail(id);
  }

  @Patch("bank/hesaplar/:id")
  @RequirePermission("bank:write")
  @ApiOperation({ summary: "Banka hesabını güncelle" })
  updateBankAccount(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(bankAccountSave)) dto: BankAccountSave,
  ) {
    return this.accounts.save(dto, id);
  }

  @Delete("bank/hesaplar/:id")
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
