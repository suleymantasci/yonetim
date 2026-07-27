import { randomUUID } from "node:crypto";

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
export function pinoParams(): PinoParams {
  const e = env();
  const isDev = e.NODE_ENV === "development";

  return {
    pinoHttp: {
      level: e.LOG_LEVEL,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
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
        ? { target: "pino-pretty", options: { singleLine: true, translateTime: "HH:MM:ss" } }
        : undefined,
    },
  };
}
