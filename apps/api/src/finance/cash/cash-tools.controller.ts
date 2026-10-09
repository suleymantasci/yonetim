import { Body, Controller, Get, Injectable, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { isoDate } from "@yonetim/contracts";
import { bankAccounts, staff, tenants, vendors } from "@yonetim/db";

import { AuditService } from "../../governance/audit/audit.service";
import { RequirePermission } from "../../identity/decorators";
import { DbService } from "../../infra/db/db.service";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { PiiService } from "../../property/resident/pii.service";

export const periodLockSave = z.object({
  /** Bu tarih ve öncesi kilitli; `null` kilidi kaldırır. */
  until: isoDate.nullable(),
  reason: z.string().trim().min(5).max(300),
});
type PeriodLockSave = z.infer<typeof periodLockSave>;

/**
 * Kasa araçları: dönem kilidi (tetikleyici `app_guard_period_lock` uygular)
 * ve banka talimatı için alıcı/hesap listesi (açık IBAN).
 */
@Injectable()
export class CashToolsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly pii: PiiService,
  ) {}

  async lock(): Promise<{ until: string | null }> {
    const [row] = await this.db.tx((tx) =>
      tx.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, this.db.ctx().tenantId)).limit(1),
    );
    const until = (row?.settings as { lockedUntil?: string | null } | undefined)?.lockedUntil ?? null;
    return { until };
  }

  async setLock(dto: PeriodLockSave): Promise<{ until: string | null }> {
    const before = await this.lock();
    await this.db.tx((tx) =>
      tx
        .update(tenants)
        .set({
          settings: sql`jsonb_set(${tenants.settings}, '{lockedUntil}', ${JSON.stringify(dto.until)}::jsonb)`,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, this.db.ctx().tenantId)),
    );
    await this.audit.record({
      action: dto.until ? "period_locked" : "period_unlocked",
      resource: "tenant",
      resourceId: this.db.ctx().tenantId,
      reason: dto.reason,
      diff: { lockedUntil: { from: before.until, to: dto.until } },
    });
    return { until: dto.until };
  }

  async payees() {
    const tenantId = this.db.ctx().tenantId;
    const rows = await this.db.tx(async (tx) => {
      const [v, s, b] = await Promise.all([
        tx.select({ id: vendors.id, name: vendors.name, iban: vendors.iban }).from(vendors).where(isNull(vendors.deletedAt)),
        tx.select({ id: staff.id, name: staff.fullName, iban: staff.ibanEncrypted }).from(staff).where(isNull(staff.deletedAt)),
        tx
          .select({ id: bankAccounts.id, bankName: bankAccounts.bankName, accountName: bankAccounts.accountName, ibanMasked: bankAccounts.ibanMasked })
          .from(bankAccounts)
          .where(isNull(bankAccounts.deletedAt)),
      ]);
      return { v, s, b };
    });
    const staffWithIban = rows.s.filter((r) => r.iban);
    if (staffWithIban.length > 0) {
      await this.audit.record({ action: "staff_iban_viewed", resource: "staff", reason: `talimat: ${staffWithIban.length}` });
    }
    return {
      payees: [
        ...rows.v.map((r) => ({ kind: "vendor" as const, id: r.id, name: r.name, iban: r.iban })),
        ...rows.s.map((r) => ({ kind: "staff" as const, id: r.id, name: r.name, iban: r.iban ? this.pii.open(r.iban, tenantId, "iban") : null })),
      ],
      accounts: rows.b.map((r) => ({ id: r.id, label: [r.bankName, r.accountName, r.ibanMasked].filter(Boolean).join(" · ") })),
    };
  }
}

@ApiTags("panel/cash")
@Controller("v1/panel/cash")
export class CashToolsController {
  constructor(private readonly service: CashToolsService) {}

  @Get("lock")
  @RequirePermission("bank:read")
  getLock() {
    return this.service.lock();
  }

  @Post("lock")
  @RequirePermission("settings:write")
  @ApiOperation({ summary: "Dönem kilidi — bu tarih ve öncesindeki finans hareketleri değiştirilemez" })
  setLock(@Body(new ZodBodyPipe(periodLockSave)) dto: PeriodLockSave) {
    return this.service.setLock(dto);
  }

  @Get("payees")
  @RequirePermission("bank:write")
  @ApiOperation({ summary: "Banka talimatı alıcıları (firma/personel, açık IBAN) ve hesaplar" })
  payees() {
    return this.service.payees();
  }
}
