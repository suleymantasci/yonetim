import "reflect-metadata";
import "./bootstrap-env";
// Sentry, Nest'ten **önce** kurulmalı: enstrümantasyon modül yüklemeye
// bağlanıyor ve sonradan kurulan SDK ilk hataları kaçırır.
import "./infra/observability/instrument";

import { json } from "express";
import helmet from "helmet";
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

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  // Ters vekil (Caddy) arkasında gerçek istemci IP'si için.
  app.set("trust proxy", 1);

  /**
   * Güvenlik başlıkları (H-5). API JSON döner; `contentSecurityPolicy`
   * `default-src 'none'` set eder — script, stil ve kaynak yüklemeleri
   * API yanıtları için geçerli değildir. CORS aynı başlıkları ezmez.
   *
   * `crossOriginEmbedderPolicy: false` — yalnız API, browser gömme
   * politikasına tabi değil; COEP bazı eski istemcileri kırar.
   */
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );

  /**
   * Webhook gövdesi 64 KB ile sınırlı. S3 presigned upload gibi daha
   * büyük payload'lar bu yoldan geçmiyor; 64 KB sınırı, büyük gövdeyle
   * belleği doldurma girişimlerini engeller (M-31).
   */
  app.use(
    json({
      limit: "256kb",
      verify: (req, _res, buf) => {
        const url = (req as { url?: string }).url ?? "";
        if (url.startsWith("/v1/webhooks/")) {
          (req as { rawBody?: Buffer }).rawBody = buf;
        }
      },
    }),
  );

  const origins = e.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    // Panel aynı origin'den (Caddy) geldiği için CORS'a ihtiyacı yok; bu ayar
    // yalnız mobil ve dış entegrasyon içindir. Boşsa CORS tamamen kapalı kalır.
    app.enableCors({ origin: origins, credentials: true });
  }

  /**
   * Swagger yalnız geliştirmede açık. Üretimde `/v1/docs` + `/v1/docs.json`
   * herkese açıldığında tüm uç yüzeyi, auth/permission şemaları, payload
   * validasyonları indekslenebilir olur; saldırı yüzeyi haritası bedavaya
   * gelir (C-1).
   */
  if (!e.isProduction) {
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
    SwaggerModule.setup("v1/docs", app, doc, {
      jsonDocumentUrl: "v1/docs.json",
    });
  }

  app.enableShutdownHooks();
  await app.listen(e.PORT, "0.0.0.0");
}

void bootstrap();
