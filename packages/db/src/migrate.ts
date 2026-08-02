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
  await client
    .unsafe(`SET LOCAL app.app_role_password = '${appPw.replace(/'/g, "''")}'`);
  await client
    .unsafe(
      `SET LOCAL app.admin_role_password = '${adminPw.replace(/'/g, "''")}'`,
    );
  await client.unsafe(rls);

  console.log("✓ Veritabanı hazır.");
  await closeDb();
}

main().catch(async (error) => {
  console.error("✗ Migration hatası:", error);
  await closeDb();
  process.exit(1);
});
