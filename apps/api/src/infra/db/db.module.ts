import { Global, Module } from "@nestjs/common";

import { DbService } from "./db.service";

/**
 * DB erişimi global: her modül `DbService`'i import etmeden enjekte edebilsin.
 * Tek kapı olmasının anlamı bu — alternatif yol yok, ekstra kurulum da yok.
 */
@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
