#!/usr/bin/env node
// scripts/migrate-as-admin.mjs
//
// Tek komutla süper kullanıcı yetkisiyle migration uygulama.
//
// Kök neden: `packages/db/sql/rls.sql` bir PostgreSQL event trigger
// (`trg_attach_tenant_isolation`) kuruyor; CREATE EVENT TRIGGER yalnız
// superuser ile mümkün. `DATABASE_URL`'deki `yonetim` rolü yetkili değilse
// `pnpm db:migrate` "permission denied" ile çıkar.
//
// Bu script mevcut DATABASE_URL'den gelen veritabanına /tmp socket'i
// üzerinden peer auth ile OS kullanıcısı (süper user) olarak bağlanır,
// Drizzle migration'larını ve rls.sql'i sırasıyla uygular, sonra bağlantıyı
// kapatır. Tek komutla çalışır:
//
//   pnpm db:migrate:as-admin
//
// Peer auth Postgres 15+ üzerinde "local connection from same OS user"
// koşulunu sağlar. OS kullanıcısı zaten süper user değilse script
// açıkça hata verir.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadRootEnv } from "../env-loader.mjs";

loadRootEnv();

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const targetUrl = process.env.DATABASE_URL;
if (!targetUrl) {
  console.error("✗ DATABASE_URL tanımlı değil (.env gerekli).");
  process.exit(1);
}
const dbName = new URL(targetUrl).pathname.replace(/^\//, "");
if (!dbName) {
  console.error("✗ DATABASE_URL içinde veritabanı adı yok.");
  process.exit(1);
}

// Postgres Unix socket üzerinden peer auth: aynı OS kullanıcısı olarak bağlanıyor.
// `local all all peer` host-based auth kuralını kullanır.
const socketPath = "/tmp";
const osUser = process.env.USER ?? "suleymantasci";

const postgresOptions = {
  username: osUser,
  host: socketPath,
  port: 5432,
  database: dbName,
  max: 1,
  prepare: false,
};

console.log(
  `→ Migration ${osUser}@${socketPath}:5432/${dbName} (peer auth) üzerinden uygulanacak.`,
);

// 1) Önce superuser olup olmadığımızı doğrula; yetki yoksa fail-fast.
const probe = postgres(postgresOptions);
let isSuperuser = false;
try {
  const result = await probe`SELECT current_setting('is_superuser') AS s`;
  isSuperuser = result[0]?.s === "on";
} catch (error) {
  console.error(
    `✗ Peer auth başarısız (${error.message}). OS kullanıcısı Postgres süper user'ı değilse DATABASE_ADMIN_URL tanımlayıp aynı scripti o URL ile çalıştırabilirsin.`,
  );
  await probe.end();
  process.exit(1);
}
await probe.end();

if (!isSuperuser) {
  console.error(
    `✗ ${osUser} OS kullanıcısı Postgres'te süper user değil. Migration çalıştırmak için DATABASE_ADMIN_URL ortam değişkenini süper user bağlantısıyla doldur ve aynı komutu çalıştır.`,
  );
  process.exit(1);
}

// 2) Drizzle migration'ları.
const admin = postgres(postgresOptions);
const db = drizzle(admin, { casing: "snake_case" });
console.log("→ Drizzle migration'ları uygulanıyor...");
await migrate(db, { migrationsFolder: join(repoRoot, "packages", "db", "drizzle") });

// 3) rls.sql — event trigger, uzantılar, RLS politikaları.
console.log("→ RLS politikaları ve trigger'lar uygulanıyor...");
const appPw = process.env.PG_APP_PASSWORD ?? "yonetim_app";
const adminPw = process.env.PG_ADMIN_PASSWORD ?? "yonetim_admin";
const rls = await readFile(
  join(repoRoot, "packages", "db", "sql", "rls.sql"),
  "utf8",
);
// rls.sql dosyası tek bir SQL ifadesi olarak bekliyor; içerideki $$…$$
// blokları 'app_role_password' GUC değişkenlerine bağlı. Drizzle migration
// runner'ı tek bir komut çalıştırır; SET LOCAL burada aynı transaction
// içinde kabul edilmediği için önce transaction başlatıp SET LOCAL
// yapıyoruz, sonra rls.sql'i çalıştırıyoruz.
//
// Event trigger `trg_attach_tenant_isolation` her `ALTER TABLE`
// komutunda `app_attach_tenant_isolation` fonksiyonunu çağırır;
// fonksiyonun içindeki `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
// tekrar `ALTER TABLE` tetikler ve sonsuz döngü oluşur. Bu yüzden rls.sql
// çalıştırılmadan önce trigger'ı geçici olarak devre dışı bırakıp,
// uygulamadan sonra yeniden etkinleştiriyoruz.
// rls.sql içindeki `app_attach_tenant_isolation` trigger'ı her
// `ALTER TABLE` çalıştırdığında `ddl_command_end` ile yeniden tetiklenir
// ve aynı fonksiyonu tekrar çağırarak stack depth limitini aşıyor. Bu
// sorunu tetikleyen en sağlam yol: `session_replication_role = replica`
// set edip DDL event trigger'larını geçici olarak devre dışı bırakmak
// (Postgres docs: "replication client'larda DDL trigger'ları atlanır").
// rls.sql bitince orijinal role geri yüklenir, sonraki migration
// çalıştırmaları için trigger yeniden etkin olur.
await admin.begin(async (sql) => {
  await sql`SELECT set_config('app.app_role_password', ${appPw}, true)`;
  await sql`SELECT set_config('app.admin_role_password', ${adminPw}, true)`;
  await sql`SET LOCAL session_replication_role = replica`;
  await sql.unsafe(rls);
});

await admin.end();

console.log("✓ Veritabanı hazır.");
