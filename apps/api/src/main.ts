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
   * M-4: Origin/Referer tabanlı CSRF savunması (defense-in-depth).
   * Cookie-authenticated state-changing isteklerde (POST/PUT/PATCH/DELETE)
   * Origin başlığı bilinen origin listesiyle eşleşmeli. Bu, SameSite=Lax
   * cookie'ye ek koruma katmanı — özellikle subdomain'ler arası (panel
   * tenant subdomain'leri) ataklara karşı.
   *
   * Mobil Bearer token akışında Origin header'ı olmayabilir; bu durumda
   * auth source "mobile" ise skip edilir (Authorization header zaten
   * CSRF'e karşı koruma sağlar).
   */
  const safeOrigins = new Set(
    e.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  );
  // Ana domain'ler her zaman güvenli (Caddy reverse proxy üzerinden
  // gelen istekler için). apps/api reverse proxy üzerinden erişildiği
  // için kendi origin'i de güvenli.
  safeOrigins.add(`http://localhost:${e.PORT}`);
  safeOrigins.add(`https://localhost:${e.PORT}`);

  app.use((req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
    // Mobil Bearer / internal token istekleri Authorization header taşır;
    // cookie tabanlı CSRF bunlar için geçerli değil.
    if (req.headers.authorization) return next();
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const originOk = origin && safeOrigins.has(origin);
    const refererOk =
      referer && [...safeOrigins].some((o) => referer.startsWith(o));
    if (originOk || refererOk) return next();
    // Same-origin (Caddy arkasında) Origin header boş olabilir; host header
    // allowlist'teki origin'lerle eşleşiyorsa da geçerli.
    const host = req.headers.host;
    if (host && [...safeOrigins].some((o) => o.endsWith(`://${host}`))) {
      return next();
    }
    res
      .status(403)
      .json({ error: { code: "csrf_origin_check_failed", message: "Origin doğrulanamadı." } });
  });

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
