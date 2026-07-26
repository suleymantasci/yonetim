import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index";

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * İKİ AYRI BAĞLANTI HAVUZU — SPEC Bölüm 5.1 / 13.3.
 *
 * - `DATABASE_URL` → RLS'e tabi uygulama rolü (`yonetim_app`).
 *   Tüm tenant verisi bu havuzdan okunur/yazılır; izolasyon Postgres tarafından
 *   garanti edilir, uygulama hatası tenant sızmasına yol açamaz.
 *
 * - `DATABASE_ADMIN_URL` → BYPASSRLS yetkili platform rolü (`yonetim_admin`).
 *   Yalnızca tenant üstü işler: oturum çözümleme, süper-admin, cron, migration.
 *
 * Oturum değişkenine dayalı bir "bypass" bilinçli olarak yoktur; uygulama rolü
 * kendi baypasını açamaz.
 */
let _client: postgres.Sql | undefined;
let _db: Database | undefined;
let _adminClient: postgres.Sql | undefined;
let _adminDb: Database | undefined;
let _warnedAdminFallback = false;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("[db] DATABASE_URL tanımlı değil.");
  return url;
}

function adminConnectionString(): string {
  const url = process.env.DATABASE_ADMIN_URL;
  if (url) return url;
  if (!_warnedAdminFallback) {
    _warnedAdminFallback = true;
    console.warn(
      "[db] DATABASE_ADMIN_URL tanımlı değil; platform sorguları DATABASE_URL ile " +
        "çalışacak. Bu bağlantı RLS'e tabi olduğu için tenant üstü işlemler boş " +
        "sonuç dönebilir. Üretimde yonetim_admin rolünü tanımlayın.",
    );
  }
  return connectionString();
}

function createPool(url: string): postgres.Sql {
  return postgres(url, {
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idle_timeout: 20,
    prepare: false, // pgbouncer/Neon pooler uyumu
  });
}

export function getClient(): postgres.Sql {
  _client ??= createPool(connectionString());
  return _client;
}

export function getDb(): Database {
  _db ??= drizzle(getClient(), { schema, casing: "snake_case" });
  return _db;
}

export function getAdminClient(): postgres.Sql {
  _adminClient ??= createPool(adminConnectionString());
  return _adminClient;
}

export function getAdminDb(): Database {
  _adminDb ??= drizzle(getAdminClient(), { schema, casing: "snake_case" });
  return _adminDb;
}

/**
 * Tenant kapsamlı işlem — SPEC Bölüm 5.4 / 13.3.
 *
 * `app.tenant_id` oturum değişkenini transaction boyunca set eder; tüm RLS
 * policy'leri bu değişkene bakar. Callback dışına sızmaz (SET LOCAL).
 *
 * KURAL: Tenant verisine dokunan HER sorgu bu fonksiyonun içinden geçmelidir.
 */
export async function withTenant<T>(
  tenantIdValue: string,
  fn: (tx: Database) => Promise<T>,
  opts: { userId?: string; role?: string } = {},
): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantIdValue}, true)`);
    if (opts.userId) {
      await tx.execute(sql`SELECT set_config('app.user_id', ${opts.userId}, true)`);
    }
    if (opts.role) {
      await tx.execute(sql`SELECT set_config('app.user_role', ${opts.role}, true)`);
    }
    return fn(tx as unknown as Database);
  });
}

/**
 * Platform (tenant'sız) işlem — süper admin, plan/kampanya tabloları, cron.
 * RLS'i baypas etmez; sadece tenant değişkeni set edilmez. Bu yüzden
 * tenant tablolarına erişim boş döner (fail-closed).
 */
export async function withPlatform<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
    return fn(tx as unknown as Database);
  });
}

/**
 * Platform (tenant üstü) işlem — BYPASSRLS yetkili `yonetim_admin` havuzunu kullanır.
 *
 * Meşru kullanımlar: oturum/kullanıcı çözümleme, süper-admin ekranları, cron
 * işleri, denetim kütüğü yazımı, yeni site kaydı.
 *
 * `reason` telemetriye ve gerektiğinde denetim kütüğüne yazılır; tenant verisine
 * bu yolla erişen her ekran ayrıca `audit()` çağırmalıdır.
 */
export async function withBypassRls<T>(
  reason: string,
  fn: (tx: Database) => Promise<T>,
  opts: {
    /**
     * Denetim kütüğü satırlarının silinmesine izin verir. Yalnızca KVKK saklama
     * süresi imhası ve site kaydının tamamen kaldırılması için kullanılmalıdır
     * (Bölüm 14.1). Varsayılan kapalı: kütük append-only davranır.
     */
    allowLogPurge?: boolean;
  } = {},
): Promise<T> {
  const db = getAdminDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.bypass_reason', ${reason}, true)`);
    if (opts.allowLogPurge) {
      await tx.execute(sql`SELECT set_config('app.allow_log_purge', 'on', true)`);
    }
    return fn(tx as unknown as Database);
  });
}

export async function closeDb(): Promise<void> {
  await Promise.all([_client?.end({ timeout: 5 }), _adminClient?.end({ timeout: 5 })]);
  _client = undefined;
  _db = undefined;
  _adminClient = undefined;
  _adminDb = undefined;
}

export { schema, sql };
