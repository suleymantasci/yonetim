import "reflect-metadata";
import "@api/bootstrap-env";

import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { env } from "@api/infra/config/env";

import { WorkerModule } from "./worker.module";

/**
 * `apps/worker` girişi — MIMARI-PLAN §10 / §11.
 *
 * HTTP DİNLEMİYOR: `createApplicationContext` ile standalone açılıyor. Bir
 * port açmak, hiçbir istek beklemeyen bir sürece saldırı yüzeyi eklemek
 * olurdu. Sağlık kontrolü process'in kendisi (Docker `healthcheck` yerine
 * `restart: unless-stopped`).
 *
 * `bootstrap-env` **api'den** import ediliyor: iki servis aynı `.env`
 * dosyasını okuyor ve aynı şema ile doğruluyor. İkinci bir env şeması,
 * `FIELD_ENCRYPTION_KEY` gibi bir değişkenin bir tarafta zorunlu diğerinde
 * isteğe bağlı olmasına yol açardı.
 */
async function bootstrap(): Promise<void> {
  const e = env();

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  // Kapanışta BullMQ işlemekte olduğu job'ı bitirsin: SIGTERM'de yarıda
  // kesilen bir borç üretimi, yarısı yazılmış bir ay demek.
  app.enableShutdownHooks();

  app.get(Logger).log({
    event: "worker.ready",
    env: e.NODE_ENV,
    pid: process.pid,
  });
}

void bootstrap();
