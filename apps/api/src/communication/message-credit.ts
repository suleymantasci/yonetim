import { sql } from "drizzle-orm";

import type { Database } from "@yonetim/db";

/**
 * SMS / WhatsApp kredi düşümü — `tenant_addons` + plan içi kota.
 *
 * SIRA (SMS): önce pakete gömülü yıllık kota (`plans.sms_quota_yearly`), bitince
 * satın alınmış / hediye ek paket, o da yoksa **aşım** sayılır. Aşım ayrı bir
 * tabloya yazılmıyor: `subscriptions.sms_used_this_period` kotayı aşsa da
 * artmaya devam ediyor, dönem sonu faturası farkı (`used - quota`) aşım olarak
 * kesiyor. Ek paketten düşen mesaj bu sayaca **girmiyor**; aksi halde önceden
 * ödenmiş kredi bir de aşım olarak faturalanırdı.
 *
 * WHATSAPP: pakete gömülü kota yok (platform numarası). Yalnız ek paket varsa
 * ondan düşülür; hiç paketi olmayan site için gönderim `free` sayılır.
 *
 * ATOMİK: her adım tek `UPDATE ... RETURNING`. "önce oku, sonra düş" iki
 * eşzamanlı gönderimin aynı son krediyi harcamasına izin verirdi.
 */
export type CreditChannel = "sms" | "whatsapp";
export type CreditSource = "plan" | "addon" | "overage" | "free";

const LIVE = sql`('trialing','active','past_due','grace')`;

/** Bir mesaj gönderildikten sonra çağrılır; hangi kaynaktan düşüldüğünü döner. */
export async function consumeMessageCredit(
  tx: Database,
  tenantId: string,
  channel: CreditChannel,
  now: Date = new Date(),
): Promise<CreditSource> {
  if (channel === "sms") {
    const plan = await tx.execute(sql`
      UPDATE subscriptions s
         SET sms_used_this_period = s.sms_used_this_period + 1, updated_at = ${now.toISOString()}::timestamptz
       WHERE s.id = (
         SELECT s2.id FROM subscriptions s2
           JOIN plans p ON p.id = s2.plan_id
          WHERE s2.tenant_id = ${tenantId}
            AND s2.status IN ${LIVE}
            AND s2.sms_used_this_period < p.sms_quota_yearly
          ORDER BY s2.created_at DESC
          LIMIT 1
          FOR UPDATE OF s2
       )
       RETURNING s.id
    `);
    if ((plan as unknown as unknown[]).length > 0) return "plan";
  }

  const addon = await tx.execute(sql`
    UPDATE tenant_addons a
       SET remaining_quantity = a.remaining_quantity - 1,
           status = CASE WHEN a.remaining_quantity - 1 <= 0 THEN 'depleted' ELSE a.status END,
           updated_at = ${now.toISOString()}::timestamptz
     WHERE a.id = (
       SELECT a2.id FROM tenant_addons a2
        WHERE a2.tenant_id = ${tenantId}
          AND a2.kind = ${channel}
          AND a2.status = 'active'
          AND a2.remaining_quantity > 0
          AND (a2.valid_until IS NULL OR a2.valid_until > ${now.toISOString()}::timestamptz)
        ORDER BY a2.valid_until ASC NULLS LAST, a2.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
     RETURNING a.id
  `);
  if ((addon as unknown as unknown[]).length > 0) return "addon";

  if (channel === "whatsapp") return "free";

  // SMS: kota ve ek paket bitti → aşım. Sayaç kotayı aşarak artıyor.
  await tx.execute(sql`
    UPDATE subscriptions s
       SET sms_used_this_period = s.sms_used_this_period + 1, updated_at = ${now.toISOString()}::timestamptz
     WHERE s.id = (
       SELECT s2.id FROM subscriptions s2
        WHERE s2.tenant_id = ${tenantId} AND s2.status IN ${LIVE}
        ORDER BY s2.created_at DESC LIMIT 1
     )
  `);
  return "overage";
}

/**
 * Yönlendirici için: SMS gönderilirse **ek ücret doğar mı** (plan kotası ve ek
 * paket bitmiş mi). `route({ smsQuotaExhausted })` bunu e-postaya düşme
 * kararında kullanıyor; kullanıcının haberi olmadan aşım ücreti üretmemek için
 * otomatik bildirimlerde SMS bu durumda atlanıyor.
 */
export async function isSmsQuotaExhausted(
  tx: Database,
  tenantId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const rows = (await tx.execute(sql`
    SELECT
      EXISTS (
        SELECT 1 FROM subscriptions s JOIN plans p ON p.id = s.plan_id
         WHERE s.tenant_id = ${tenantId} AND s.status IN ${LIVE}
           AND s.sms_used_this_period < p.sms_quota_yearly
      ) AS plan_left,
      EXISTS (
        SELECT 1 FROM tenant_addons a
         WHERE a.tenant_id = ${tenantId} AND a.kind = 'sms' AND a.status = 'active'
           AND a.remaining_quantity > 0
           AND (a.valid_until IS NULL OR a.valid_until > ${now.toISOString()}::timestamptz)
      ) AS addon_left
  `)) as unknown as Array<{ plan_left: boolean; addon_left: boolean }>;
  const row = rows[0];
  return !(row?.plan_left || row?.addon_left);
}
