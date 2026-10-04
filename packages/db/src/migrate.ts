import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { closeDb, getClient, getDb } from "./client";
import { loadRootEnv } from "../../../env-loader.mjs";

loadRootEnv();

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Migration + RLS uygulama.
 * Drizzle migration'ları çalıştıktan sonra sql/rls.sql idempotent olarak uygulanır.
 */
async function main() {
  // Şema değişikliği ve rol oluşturma sahibi/süper kullanıcı yetkisi ister.
  if (process.env.DATABASE_OWNER_URL) process.env.DATABASE_URL = process.env.DATABASE_OWNER_URL;

  const db = getDb();
  console.log("→ Drizzle migration'ları uygulanıyor...");
  await migrate(db, { migrationsFolder: join(here, "..", "drizzle") });

  console.log("→ RLS politikaları ve trigger'lar uygulanıyor...");
  // C-5: rls.sql artık hardcoded parolalar içermiyor. `app.app_role_password`
  // ve `app.admin_role_password` GUC değişkenleriyle sağlanmalı. Geliştirme
  // kurulumunda `.env`'den `PG_APP_PASSWORD` ve `PG_ADMIN_PASSWORD`
  // değişkenleri beklenir; prod'da compose bu değişkenleri zorunlu kılar.
  const appPw = process.env.PG_APP_PASSWORD ?? "yonetim_app";
  const adminPw = process.env.PG_ADMIN_PASSWORD ?? "yonetim_admin";
  const rls = await readFile(join(here, "..", "sql", "rls.sql"), "utf8");
  const client = getClient();
  // Parolalar rls.sql ile **aynı çağrıda** veriliyor: havuzdaki ayrı
  // `unsafe()` çağrıları farklı bağlantılara düşebiliyor, `SET LOCAL` ise
  // transaction dışında hiçbir etki bırakmıyordu — rls.sql "parola zorunlu"
  // hatasıyla duruyordu. Çok ifadeli tek sorgu tek bağlantıda koşar.
  await client.unsafe(rolePasswordPrelude(appPw, adminPw) + rls);

  console.log("✓ Veritabanı hazır.");
  await closeDb();
}

function rolePasswordPrelude(appPw: string, adminPw: string): string {
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
  return (
    `SELECT set_config('app.app_role_password', ${q(appPw)}, false);\n` +
    `SELECT set_config('app.admin_role_password', ${q(adminPw)}, false);\n`
  );
}

main().catch(async (error) => {
  console.error("✗ Migration hatası:", error);
  await closeDb();
  process.exit(1);
});
