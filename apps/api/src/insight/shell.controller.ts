import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, isNull, lt, sql } from "drizzle-orm";

import type { NavBadgesResponse } from "@yonetim/contracts";
import {
  accessRequests,
  bankTransactions,
  kvkkRequests,
  maintenanceRecords,
  requests,
} from "@yonetim/db";

import { RequirePermission } from "../identity/decorators";
import { DbService } from "../infra/db/db.service";

/**
 * Kabuk rozetleri — `/v1/panel/shell/badges`.
 *
 * Panelin **her** sayfasında çağrılıyor, bu yüzden sorgu sayısı doğrudan
 * maliyet: yedi sayaç altı sorguya sığdırıldı (talep sayaçları tek taramada
 * `FILTER` ile).
 *
 * Zaman karşılaştırmaları (`slaDueAt < now()`, `nextDueAt < now()`) sunucuda:
 * saati yanlış kurulmuş bir tarayıcı, "SLA aşıldı mı" sorusunu tam da yanlış
 * cevaplayacak taraftır.
 */
@ApiTags("panel/shell")
@Controller("v1/panel/shell")
export class ShellController {
  constructor(private readonly db: DbService) {}

  @Get("badges")
  // Kabuk her panel rolünde görünüyor; rozetler zaten RLS ile tenant'a bağlı
  // sayılardan ibaret. `report:read` panele erişen her rolde var.
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Sidebar rozet sayaçları (tek çağrı)" })
  async badges(): Promise<NavBadgesResponse> {
    const now = new Date();

    return this.db.tx(async (tx) => {
      const [requestRow] = await tx
        .select({
          open: sql<number>`COUNT(*) FILTER (WHERE ${requests.status} IN ('open','assigned','in_progress'))`,
          breached: sql<number>`COUNT(*) FILTER (WHERE ${requests.slaDueAt} < now() AND ${requests.resolvedAt} IS NULL)`,
        })
        .from(requests)
        .where(isNull(requests.deletedAt));

      const [kvkkRow] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(kvkkRequests)
        .where(sql`${kvkkRequests.status} IN ('received','in_progress')`);

      const [bankRow] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(bankTransactions)
        .where(sql`${bankTransactions.matchStatus} IN ('unmatched','suggested')`);

      const [maintRow] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(maintenanceRecords)
        .where(
          and(
            eq(maintenanceRecords.isActive, true),
            lt(maintenanceRecords.nextDueAt, now),
            isNull(maintenanceRecords.deletedAt),
          ),
        );

      /*
       * "Cevap bekleyen" = son mesajı sakinden gelmiş **konuşma** sayısı.
       *
       * Kümeleme SQL'de: gelen kutusu son 300 mesajı çekip bellekte
       * kümeliyor, aynı şeyi burada yapmak her sayfa render'ında o 300
       * satırı bir daha taşımak olurdu. `DISTINCT ON` her muhatabın son
       * satırını bırakıyor; anahtar `communication.service`'teki ile aynı
       * (eşleşmemiş numaralar tek kovada).
       *
       * SAYAÇ TÜM GEÇMİŞE BAKIYOR, gelen kutusunun 300'lük penceresine
       * değil: rozetin cevabı gereken soru "dönmem gereken var mı", ve
       * pencerenin dışında kalmış eski bir soru da hâlâ cevapsız.
       */
      const awaitingRows = await tx.execute<{ value: number }>(sql`
        SELECT COUNT(*)::int AS value
        FROM (
          SELECT DISTINCT ON (COALESCE(user_id::text, 'unmatched'))
                 direction
          FROM messages
          ORDER BY COALESCE(user_id::text, 'unmatched'), created_at DESC
        ) latest
        WHERE latest.direction = 'in'
      `);

      const [accessRow] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(accessRequests)
        .where(eq(accessRequests.status, "pending"));

      return {
        openRequests: Number(requestRow?.open ?? 0),
        slaBreached: Number(requestRow?.breached ?? 0),
        kvkkPending: Number(kvkkRow?.value ?? 0),
        unmatchedBankTx: Number(bankRow?.value ?? 0),
        overdueMaintenance: Number(maintRow?.value ?? 0),
        messagesAwaitingReply: Number(awaitingRows[0]?.value ?? 0),
        pendingAccessRequests: Number(accessRow?.value ?? 0),
      };
    });
  }
}
