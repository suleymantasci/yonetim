import { Module } from "@nestjs/common";

import { PublicCertificateController } from "./public-certificate.controller";
import { PublicDebtController } from "./public-debt.controller";
import { PublicExpenseController } from "./public-expense.controller";
import { PublicNpsController } from "./public-nps.controller";
import { PublicOpenApiController } from "./public-openapi.controller";
import { PublicResidentController } from "./public-resident.controller";
import { PublicUnitController } from "./public-unit.controller";
import { PublicV1Interceptor } from "./public-v1.envelope";

/**
 * `/api/v1` — DIŞ SÖZLEŞME (MIMARI-PLAN §9.1, GAP 4.8.3).
 *
 * Bağlam modüllerinden ayrı duruyor çünkü ayrımı bağlam değil **istemci**
 * yapıyor: buranın istemcileri bizim repomuzda değil. Panel uçları ekranla
 * birlikte değişebilir; bu yüzey değişemez. Aynı modüle koymak, bir ekran
 * refaktörünün dış entegrasyonu kırmasını an meselesi hâline getirirdi.
 *
 * Controller'lar servis katmanı kullanmıyor, sorguyu doğrudan yazıyor — bu
 * bilinçli tekrar. Paylaşılan şey sorgu değil, veritabanı.
 */
@Module({
  controllers: [
    PublicOpenApiController,
    PublicUnitController,
    PublicDebtController,
    PublicExpenseController,
    PublicResidentController,
    PublicNpsController,
    PublicCertificateController,
  ],
  providers: [PublicV1Interceptor],
})
export class PublicModule {}
