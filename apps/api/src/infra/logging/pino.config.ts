import { randomUUID } from "node:crypto";

import { ClsServiceManager } from "nestjs-cls";
import type { Params as PinoParams } from "nestjs-pino";

import { env } from "../config/env";

/** Log'a asla düşmemesi gerekenler — KVKK md.4 ölçülülük. */
const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  "req.headers['x-internal-token']",
  "res.headers['set-cookie']",
  "*.tckn",
  "*.iban",
  "*.password",
  "*.token",
];

/**
 * Yapılandırılmış log — her satırda `requestId` var.
 *
 * `x-request-id` başlığı `apps/app` tarafından üretilip iletiliyor (§9.2c),
 * worker da job payload'una koyuyor. Böylece tek bir kullanıcı eylemi
 * app → api → worker boyunca aynı kimlikle izlenebiliyor (§14 Track D).
 */
export function pinoParams(options: { http?: boolean } = {}): PinoParams {
  const e = env();
  const isDev = e.NODE_ENV === "development";

  if (options.http === false) {
    /**
     * Worker'ın HTTP isteği yok — `pinoHttp`'nin `genReqId`'si hiç çalışmaz ve
     * her satır `requestId`'siz kalırdı. Bunun bedeli somut: bir kullanıcının
     * "borç oluştur" tıklamasıyla o borcun bildirimi arasındaki zinciri
     * log'dan takip edemezdik. Kimlik `JobContext`'ten (ALS) okunuyor.
     */
    return {
      pinoHttp: {
        level: e.LOG_LEVEL,
        redact: { paths: REDACT_PATHS, censor: "[gizli]" },
        autoLogging: false,
        // Her satıra ALS'teki bağlamı ekliyor. `mixin` log anında çalıştığı
        // için `JobContext.run()` içindeki her log doğru kimliği taşıyor;
        // dışındakiler (açılış, kapanış) alansız kalıyor ki bu da doğru —
        // onların bir isteğe bağlanacak izi yok.
        mixin: () => {
          const cls = ClsServiceManager.getClsService<{
            ctx?: { requestId?: string; tenantId?: string };
          }>();
          const ctx = cls.isActive() ? cls.get("ctx") : undefined;
          return ctx
            ? { requestId: ctx.requestId, tenantId: ctx.tenantId }
            : {};
        },
        transport: isDev
          ? {
              target: "pino-pretty",
              options: { singleLine: true, translateTime: "HH:MM:ss" },
            }
          : undefined,
      },
    };
  }

  return {
    pinoHttp: {
      level: e.LOG_LEVEL,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id =
          (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      redact: { paths: REDACT_PATHS, censor: "[gizli]" },
      customProps: (req) => ({
        tenantId: (req as { tenantId?: string }).tenantId,
        userId: (req as { userId?: string }).userId,
      }),
      // Sağlık probu her 5 saniyede bir log satırı üretmesin.
      autoLogging: {
        ignore: (req) => req.url === "/health" || req.url === "/health/ready",
      },
      transport: isDev
        ? {
            target: "pino-pretty",
            options: { singleLine: true, translateTime: "HH:MM:ss" },
          }
        : undefined,
    },
  };
}
