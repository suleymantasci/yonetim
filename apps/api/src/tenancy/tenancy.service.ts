import { Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";

import { siteConfig } from "@yonetim/config";
import type {
  SeveranceQuote,
  SeveranceQuoteResult,
  StaffListResponse,
  TenantSettingsResponse,
} from "@yonetim/contracts";
import { calculateSeverance, maskPhone } from "@yonetim/core";
import { staff, staffAttendance, tenants } from "@yonetim/db";

import { DbService } from "../infra/db/db.service";
import { StaffLedgerService } from "./staff-ledger.service";

/**
 * `tenancy` bağlamı — site ayarları ve personel (MIMARI-PLAN §6.3, §8.5).
 *
 * PERSONEL VE KİŞİSEL VERİ: `staff` satırlarında şifreli TCKN ve IBAN var;
 * bu uç ikisini de **taşımıyor**, yalnız "kayıtlı mı" bilgisini veriyor.
 * Panelin personel ekranında bordro tutarları gerekiyor, kimlik numarası
 * değil — §9.1 okuma uçlarına da uygulanıyor. Bordro dosyası üretimi gibi
 * gerçekten çözme gerektiren bir ihtiyaç doğduğunda, çözme yine yalnız
 * `apps/api` içinde ve ayrı bir uçta olacak.
 */
@Injectable()
export class TenancyService {
  constructor(
    private readonly db: DbService,
    private readonly staffLedger: StaffLedgerService,
  ) {}

  async settings(): Promise<TenantSettingsResponse> {
    const tenantId = this.db.ctx().tenantId;
    const row = await this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      return rows[0] ?? null;
    });
    if (!row) throw new NotFoundException("not_found");

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type,
      status: row.status,
      unitCount: row.unitCount,
      city: row.city,
      district: row.district,
      neighborhood: row.neighborhood,
      addressLine: row.addressLine,
      postalCode: row.postalCode,
      settings: (row.settings ?? {}) as Record<string, unknown>,
      landingPublished: row.landingPublished,
      currentPeriodEnd: row.currentPeriodEnd,
      trialEndsAt: row.trialEndsAt,
      createdAt: row.createdAt,
    };
  }

  /**
   * Kıdem/ihbar tazminatı hesabı — rakip incelemesi §4.1.
   *
   * Servis yalnız **veriyi toplayıp** `packages/core`'daki saf fonksiyona
   * veriyor; kanunun kendisi orada ve orada test ediliyor. Buraya bir tane
   * bile çarpma işlemi koymak, aynı kuralın ikinci bir uygulaması olurdu.
   *
   * `staff:payroll` yetkisi isteniyor, `staff:read` değil: tazminat rakamı
   * ücret bilgisinin türevi ve `company_operator` rolünden bilinçli olarak
   * esirgenmiş durumda (`packages/core/rbac`).
   */
  async severanceQuote(dto: SeveranceQuote): Promise<SeveranceQuoteResult> {
    const row = await this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(staff)
        .where(and(eq(staff.id, dto.staffId), isNull(staff.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
    if (!row) throw new NotFoundException("not_found");

    const { severanceCeilingMinor, noticeIncomeTaxRate, effectiveFrom } =
      siteConfig.payroll;
    const monthlyGrossMinor =
      dto.monthlyGrossOverrideMinor ?? row.grossSalaryKurus;

    const result = calculateSeverance({
      startedAt: row.startedAt,
      endedAt: dto.endedAt,
      monthlyGrossMinor,
      ceilingMinor: severanceCeilingMinor,
      incomeTaxRate: noticeIncomeTaxRate,
      severanceApplies: dto.severanceApplies,
      noticeApplies: dto.noticeApplies,
    });

    return {
      staffName: row.fullName,
      startedAt: row.startedAt,
      endedAt: dto.endedAt,
      serviceDays: result.serviceDays,
      // "6,42 yıl" okunmuyor; "6 yıl 5 ay" okunuyor. Bölme ekranda değil
      // burada yapılıyor ki iki istemci aynı yuvarlamayı görsün.
      serviceYears: Math.floor(result.serviceYears),
      serviceMonthsRemainder: Math.floor(
        result.serviceMonths - Math.floor(result.serviceYears) * 12,
      ),
      monthlyGrossMinor,
      cappedMonthlyGrossMinor: result.cappedMonthlyGrossMinor,
      ceilingExcessMinor: result.ceilingExcessMinor,
      noticeWeeks: result.noticeWeeks,
      severance: result.severance,
      notice: result.notice,
      totalNetMinor: result.totalNetMinor,
      belowMinimumService: result.belowMinimumService,
      parametersEffectiveFrom: effectiveFrom,
      ceilingMinor: severanceCeilingMinor,
      incomeTaxRate: noticeIncomeTaxRate,
    };
  }

  async staff(): Promise<StaffListResponse> {
    const { rows, attendance, balances } = await this.db.tx(async (tx) => {
      const [rows, attendance] = await Promise.all([
        tx.select().from(staff).where(isNull(staff.deletedAt)),
        tx
          .select({
            id: staffAttendance.id,
            staffId: staffAttendance.staffId,
            staffName: staff.fullName,
            checkInAt: staffAttendance.checkInAt,
            checkOutAt: staffAttendance.checkOutAt,
            method: staffAttendance.method,
            note: staffAttendance.note,
          })
          .from(staffAttendance)
          .leftJoin(staff, eq(staff.id, staffAttendance.staffId))
          .orderBy(desc(staffAttendance.checkInAt))
          .limit(100),
      ]);
      // Avans ve maaş borcu personel carisinden (kart alanı artık kullanılmıyor).
      const balances = await this.staffLedger.balances(tx, rows.map((r) => r.id));
      return { rows, attendance, balances };
    });

    const mapped = rows.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      role: s.role,
      phoneMasked: s.phone ? maskPhone(s.phone) : null,
      grossSalaryMinor: s.grossSalaryKurus,
      netSalaryMinor: s.netSalaryKurus,
      sgkPremiumMinor: s.sgkPremiumKurus,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      annualLeaveDays: s.annualLeaveDays,
      usedLeaveDays: s.usedLeaveDays,
      advanceBalanceMinor: balances.get(s.id)?.advance ?? 0,
      payableMinor: balances.get(s.id)?.payable ?? 0,
      isActive: s.isActive,
      hasTckn: s.tcknEncrypted !== null,
      hasIban: s.ibanEncrypted !== null,
    }));

    const active = mapped.filter((s) => s.isActive);

    return {
      rows: mapped,
      attendance: attendance.map((a) => ({
        id: a.id,
        staffId: a.staffId,
        staffName: a.staffName,
        checkInAt: a.checkInAt,
        checkOutAt: a.checkOutAt,
        method: a.method,
        note: a.note,
        workedHours: a.checkOutAt
          ? Math.round(
              ((a.checkOutAt.getTime() - a.checkInAt.getTime()) / 3_600_000) *
                10,
            ) / 10
          : null,
      })),
      totals: {
        active: active.length,
        monthlyGrossMinor: active.reduce((s, r) => s + r.grossSalaryMinor, 0),
        monthlySgkMinor: active.reduce((s, r) => s + r.sgkPremiumMinor, 0),
        openShifts: attendance.filter((a) => !a.checkOutAt).length,
      },
    };
  }
}
