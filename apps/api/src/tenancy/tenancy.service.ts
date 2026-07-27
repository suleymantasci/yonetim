import { Injectable, NotFoundException } from "@nestjs/common";
import { desc, eq, isNull } from "drizzle-orm";

import type {
  StaffListResponse,
  TenantSettingsResponse,
} from "@yonetim/contracts";
import { maskPhone } from "@yonetim/core";
import { staff, staffAttendance, tenants } from "@yonetim/db";

import { DbService } from "../infra/db/db.service";

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
  constructor(private readonly db: DbService) {}

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

  async staff(): Promise<StaffListResponse> {
    const { rows, attendance } = await this.db.tx(async (tx) => {
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
      return { rows, attendance };
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
      advanceBalanceMinor: s.advanceBalanceKurus,
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
