import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import "./bootstrap-env";

/**
 * Migration sahibi — MIMARI-PLAN §11 / §17 kararı 4.
 *
 * **Yalnız `api` container'ı** bunu çalıştırır, init aşamasında. Worker hiç
 * dokunmaz; `api` sağlıklı olmadan da başlamaz. Replika sayısı arttığında iki
 * migration yarışırsa şema bozulur — Postgres advisory lock bunu tek satırla
 * imkânsız kılıyor: geç kalan replikalar kilidi bekler, şemayı hazır bulur ve
 * devam eder.
 *
 * `packages/db/src/migrate.ts` ile farkı: orası geliştirici komutu (`pnpm
 * db:migrate`), burası container init'i. İkisi aynı SQL'i uyguluyor, ama
 * buradaki kilitli ve `import.meta` kullanmıyor (CommonJS derleniyor).
 */
const LOCK = 0x796f6e65; // 'yone' — tüm replikalar aynı kilidi ister.

function migrationsRoot(): string {
  // Container'da çalışma dizini repo kökü; geliştiricide de öyle olsun diye
  // birkaç aday deneniyor. Bulunamazsa sessizce yanlış klasöre migrate etmek
  // yerine hata veriyoruz.
  const candidates = [
    process.env.MIGRATIONS_FOLDER,
    resolve(process.cwd(), "packages/db"),
    resolve(__dirname, "../../../packages/db"),
    resolve(__dirname, "../../../../packages/db"),
  ].filter((c): c is string => Boolean(c));

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "drizzle"))) return candidate;
  }
  throw new Error(
    `[migrate] packages/db/drizzle bulunamadı. Denenen yollar:\n${candidates.join("\n")}`,
  );
}

async function main(): Promise<void> {
  // Şema değişikliği ve rol oluşturma sahip/süper kullanıcı yetkisi ister;
  // uygulama rolü (RLS'e tabi) bunu yapamaz — bilinçli.
  const url =
    process.env.DATABASE_OWNER_URL ??
    process.env.DATABASE_ADMIN_URL ??
    process.env.DATABASE_URL;
  if (!url) throw new Error("[migrate] DATABASE_URL tanımlı değil.");

  const root = migrationsRoot();
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  console.log(`→ Advisory lock alınıyor (${LOCK})…`);
  await client`SELECT pg_advisory_lock(${LOCK})`;

  try {
    console.log("→ Drizzle migration'ları uygulanıyor…");
    await migrate(db, { migrationsFolder: join(root, "drizzle") });

    const rlsPath = join(root, "sql", "rls.sql");
    if (existsSync(rlsPath)) {
      console.log("→ RLS politikaları ve trigger'lar uygulanıyor…");
      await client.unsafe(await readFile(rlsPath, "utf8"));
    }
    console.log("✓ Şema hazır.");
  } finally {
    await client`SELECT pg_advisory_unlock(${LOCK})`;
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error("✗ Migration hatası:", error);
  process.exit(1);
});
