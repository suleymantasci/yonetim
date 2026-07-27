import "reflect-metadata";
import "./bootstrap-env";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { cleanupOpenApiDoc } from "nestjs-zod";

import { AppModule } from "./app.module";
import { env } from "./infra/config/env";

/**
 * `apps/api` — veritabanının **tek sahibi** (MIMARI-PLAN §4).
 *
 * İKİ YÜZEY, tek servis (§9.1):
 *   `/v1/*`        dış sözleşme — donuk, sürümlü, muhasebe yazılımı tüketir
 *   `/v1/panel/*`  iç BFF       — ekran odaklı, serbestçe değişir
 *
 * İkisi de aynı servisleri çağırır; ayrım yalnız projeksiyon ve sözleşme
 * garantisindedir.
 */
async function bootstrap(): Promise<void> {
  const e = env();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Ters vekil (Caddy) arkasında gerçek istemci IP'si için.
  app.set("trust proxy", 1);

  const origins = e.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    // Panel aynı origin'den (Caddy) geldiği için CORS'a ihtiyacı yok; bu ayar
    // yalnız mobil ve dış entegrasyon içindir. Boşsa CORS tamamen kapalı kalır.
    app.enableCors({ origin: origins, credentials: true });
  }

  // `cleanupOpenApiDoc`, Zod DTO'larından üretilen `$ref`'leri düzleştirir;
  // OpenAPI çıktısı CI'da diff'lenebilir olsun diye deterministik kalması şart (§15).
  const doc = cleanupOpenApiDoc(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Yönetim API")
        .setDescription(
          "Site yönetim platformu HTTP arayüzü. `/v1/*` uçları donuk dış " +
            "sözleşmedir; kırıcı değişiklik `/v2` açar. `/v1/panel/*` uçları " +
            "panelin iç BFF'idir ve sürüm garantisi taşımaz.",
        )
        .setVersion("1.0.0")
        .addBearerAuth({ type: "http", scheme: "bearer" }, "apiKey")
        .addCookieAuth("yonetim_session")
        .build(),
    ),
  );
  SwaggerModule.setup("v1/docs", app, doc, { jsonDocumentUrl: "v1/docs.json" });

  app.enableShutdownHooks();
  await app.listen(e.PORT, "0.0.0.0");
}

void bootstrap();
