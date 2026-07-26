import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Kök dizindeki `.env` dosyasını process.env'e yükler.
 *
 * Neden gerekli: Next.js `.env`'i yalnızca kendi uygulama dizininden okur
 * (`apps/app/.env`), monorepo kökünden değil. CLI betikleri (migrate/seed) ise
 * düz Node süreçleridir ve hiç okumaz. Tek `.env` dosyasını korumak için her iki
 * taraf da bu yükleyiciyi çağırır — Next uygulamalarında `next.config.mjs`
 * içinden (sunucu başlamadan önce), betiklerde dosyanın en üstünde.
 *
 * Halihazırda tanımlı değişkenler EZİLMEZ: üretimde gerçek ortam değişkenleri
 * (Vercel, systemd, Docker) her zaman önceliklidir ve `.env` yoksa sessiz geçilir.
 *
 * Bağımlılık eklememek için minimal bir okuyucudur; çok satırlı değerleri ve
 * değişken genişletmeyi (`${VAR}`) desteklemez.
 */
export function loadRootEnv() {
  const path = join(dirname(fileURLToPath(import.meta.url)), ".env");
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;

    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;

    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
