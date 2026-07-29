import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";

import type {
  DuesPlanListResponse,
  DuesPlanRow,
  DuesPlanRunRequest,
  DuesPlanRunResult,
  DuesPlanSave,
} from "@yonetim/contracts";
import { currentPeriod, parsePeriodKey, periodKey } from "@yonetim/core";
import { duesPlans, duesRuns } from "@yonetim/db";
import { generateDuesForTenant } from "@yonetim/jobs";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";

/**
 * Aidat planı — MIMARI-PLAN §6.4 `dues-plan`.
 *
 * Küçük bir modül olduğu için repository/service tek dosyada; §8.5'in kuralı
 * SQL'in **tek yerde** kalması, üç dosya olması değil.
 */
@Injectable()
export class DuesPlanService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<DuesPlanListResponse> {
    return this.db.tx(async (tx) => {
      const [plans, runs] = await Promise.all([
        tx
          .select()
          .from(duesPlans)
          .where(isNull(duesPlans.deletedAt))
          .orderBy(desc(duesPlans.createdAt)),
        tx.select().from(duesRuns).orderBy(desc(duesRuns.createdAt)).limit(50),
      ]);

      return {
        plans: plans.map(toPlanRow),
        runs: runs.map((r) => ({
          id: r.id,
          duesPlanId: r.duesPlanId,
          period: r.period,
          status: r.status,
          generatedCount: r.generatedCount,
          totalMinor: r.totalKurus,
          error: r.error,
          createdAt: r.createdAt,
        })),
      } as DuesPlanListResponse;
    });
  }

  /**
   * Planı elle çalıştırır — PROJE-DURUMU §5.4.
   *
   * NEDEN GEREKLİ: plan bugüne kadar yalnız worker'ın cron'uyla çalışıyordu.
   * Ayın ortasında kurulan bir sitede yönetici bir sonraki ayı beklemek
   * zorunda kalıyor, bu yüzden aynı borçları toplu borçlandırmadan elle
   * giriyordu — yani plan hiç kullanılmıyordu.
   *
   * ÜRETİM MANTIĞI **KOPYALANMIYOR**: `packages/jobs` içindeki aynı fonksiyon
   * çağrılıyor. İkinci bir uygulama yazmak, elle çalıştırmayla cron'un
   * zamanla ayrışması demekti — ve fark ancak yanlış tutarlar yazıldıktan
   * sonra görülürdü.
   *
   * İdempotanslık `dues_runs` üzerindeki (plan, dönem) tekil indeksinden
   * geliyor; burada ayrıca bir kilit gerekmiyor.
   */
  async run(
    id: string,
    dto: DuesPlanRunRequest,
  ): Promise<DuesPlanRunResult> {
    const ctx = this.db.ctx();
    /*
     * `parsePeriodKey` biçim bozuksa `null` döndürüyor. Sözleşme deseni
     * zaten doğruluyor ama tip düzeyinde garanti yok; sessizce içinde
     * bulunulan döneme düşmek yerine hata veriliyor — yanlış döneme borç
     * üretmek, üretilmiş borçları geri almayı gerektirir.
     */
    const period = dto.period ? parsePeriodKey(dto.period) : currentPeriod();
    if (!period) throw new BadRequestException("invalid:period");

    // Plan gerçekten bu siteye ait mi — `generateDuesForTenant` tüm aktif
    // planları koşturuyor, biz sonucundan yalnız bu planı süzeceğiz.
    const plan = await this.db.tx(async (tx) => {
      const rows = await tx
        .select({ id: duesPlans.id, isActive: duesPlans.isActive })
        .from(duesPlans)
        .where(and(eq(duesPlans.id, id), isNull(duesPlans.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
    if (!plan) throw new NotFoundException("not_found");
    if (!plan.isActive) {
      throw new BadRequestException("invalid:plan_inactive");
    }

    const results = await generateDuesForTenant({
      tenantId: ctx.tenantId,
      period,
      userId: ctx.userId ?? undefined,
      dryRun: dto.dryRun,
    });

    const mine = results.find((r) => r.planId === id);
    const outcome: DuesPlanRunResult = {
      period: periodKey(period),
      dryRun: dto.dryRun,
      generated: mine?.generated ?? 0,
      totalMinor: mine?.totalKurus ?? 0,
      skipped: mine?.skipped ?? true,
      reason: mine?.reason ?? null,
      fellBackToEqual: mine?.fellBackToEqual ?? false,
    };

    // Önizleme hiçbir şey yazmıyor; kütüğe yalnız gerçek üretim geçiyor.
    if (!dto.dryRun) {
      await this.audit.record({
        action: "dues_plan_run",
        resource: "dues_plan",
        resourceId: id,
        diff: {
          period: { from: null, to: outcome.period },
          generated: { from: null, to: outcome.generated },
        },
      });
    }

    return outcome;
  }

  /** Tekil plan — liste ile **aynı** normalize şekilde döner (`*Minor`). */
  async byId(id: string): Promise<DuesPlanRow> {
    const plan = await this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(duesPlans)
        .where(eq(duesPlans.id, id))
        .limit(1);
      return rows[0] ?? null;
    });
    if (!plan) throw new NotFoundException("not_found");
    return toPlanRow(plan);
  }

  async save(dto: DuesPlanSave): Promise<{ id: string }> {
    const id = await this.db.tx(async (tx) => {
      const ctx = this.db.ctx();

      const values = {
        tenantId: ctx.tenantId,
        name: dto.name,
        period: dto.period,
        formula: dto.formula,
        baseAmountKurus: dto.formula === "equal" ? dto.baseAmountMinor : 0,
        totalAmountKurus: dto.formula === "equal" ? 0 : dto.totalAmountMinor,
        mixWeights:
          dto.formula === "mixed"
            ? { equal: dto.mixEqualPct, land_share: 100 - dto.mixEqualPct }
            : {},
        dueDayOfMonth: dto.dueDayOfMonth,
        appliesTo: {
          blockIds: dto.blockIds,
          unitTypes: dto.unitTypes,
          notes: dto.notes ?? null,
        },
        lateFeeMonthlyPct: (dto.lateFeeMonthlyPct ?? 5).toFixed(2),
        lateFeeDailyMode: dto.lateFeeDailyMode,
        startPeriod: dto.startPeriod,
        endPeriod: dto.endPeriod ?? null,
        isActive: dto.isActive,
        createdBy: ctx.userId,
      };

      if (dto.id) {
        await tx.update(duesPlans).set(values).where(eq(duesPlans.id, dto.id));
        return dto.id;
      }

      const [row] = await tx
        .insert(duesPlans)
        .values(values)
        .returning({ id: duesPlans.id });
      if (!row) throw new BadRequestException("internal");
      return row.id;
    });

    await this.audit.record({
      action: "dues_plan_saved",
      resource: "dues_plan",
      resourceId: id,
      reason: dto.name,
    });
    return { id };
  }

  /** Aktif/pasif. Silmek yerine pasifleştirmek geçmişi korur. */
  async toggle(id: string, isActive: boolean) {
    await this.db.tx(async (tx) => {
      await tx.update(duesPlans).set({ isActive }).where(eq(duesPlans.id, id));
    });
    await this.audit.record({
      action: isActive ? "dues_plan_activated" : "dues_plan_deactivated",
      resource: "dues_plan",
      resourceId: id,
    });
    return { id, isActive };
  }

  /**
   * Planı arşivler (soft-delete).
   *
   * Üretilmiş borçlar silinmez: plan arşivlense de o borçların dayanağı kalır.
   * `dues_plan_id` boşalmaz — borç detayında "hangi plandan doğdu" görünmeye
   * devam eder.
   */
  async archive(id: string) {
    await this.db.tx(async (tx) => {
      await tx
        .update(duesPlans)
        .set({ deletedAt: new Date(), isActive: false })
        .where(eq(duesPlans.id, id));
    });
    await this.audit.record({
      action: "dues_plan_archived",
      resource: "dues_plan",
      resourceId: id,
    });
    return { id };
  }
}

type PlanRecord = typeof duesPlans.$inferSelect;

/** Tek dönüşüm: liste ve tekil uç aynı şekli döndürsün. */
function toPlanRow(p: PlanRecord): DuesPlanRow {
  return {
    id: p.id,
    name: p.name,
    period: p.period,
    formula: p.formula,
    // Şemada nullable; sözleşmede 0 — "tutar yok" ile "tutar sıfır" ayrımı
    // ekranda anlam taşımıyor, formül hangi alanın geçerli olduğunu belirliyor.
    baseAmountMinor: p.baseAmountKurus ?? 0,
    totalAmountMinor: p.totalAmountKurus ?? 0,
    mixWeights: (p.mixWeights ?? {}) as Record<string, unknown>,
    dueDayOfMonth: p.dueDayOfMonth,
    appliesTo: (p.appliesTo ?? {}) as Record<string, unknown>,
    lateFeeMonthlyPct: p.lateFeeMonthlyPct,
    lateFeeDailyMode: p.lateFeeDailyMode,
    startPeriod: p.startPeriod,
    endPeriod: p.endPeriod,
    isActive: p.isActive,
    createdAt: p.createdAt,
  };
}
