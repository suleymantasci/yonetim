"use server";

import { getTranslations } from "next-intl/server";

import { severanceQuoteResult } from "@yonetim/contracts";

import { apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";

/**
 * Kıdem/ihbar tazminatı hesaplayıcı köprüsü.
 *
 * Bir **sorgu**, kayıt değil: `runAction` sarmalayıcısı kullanılmıyor çünkü
 * o denetim kütüğüne olay yazıyor ve "yönetici bir senaryo denedi" bir olay
 * değil. Kaydedilen hiçbir şey yok.
 *
 * Hesabın kendisi `packages/core`'da, parametreler `apps/api`'de; burada
 * yalnız yetki kontrolü ve HTTP var.
 */
export interface SeveranceQuoteView {
  ok: boolean;
  message?: string;
  data?: {
    staffName: string;
    serviceYears: number;
    serviceMonthsRemainder: number;
    noticeWeeks: number;
    monthlyGrossKurus: number;
    cappedMonthlyGrossKurus: number;
    ceilingExcessKurus: number;
    severance: {
      grossKurus: number;
      stampDutyKurus: number;
      netKurus: number;
    };
    notice: {
      grossKurus: number;
      stampDutyKurus: number;
      incomeTaxKurus: number;
      netKurus: number;
    };
    totalNetKurus: number;
    belowMinimumService: boolean;
    parametersEffectiveFrom: string;
    ceilingKurus: number;
    incomeTaxRate: number;
  };
}

export async function quoteSeverance(params: {
  staffId: string;
  endedAt: string;
  monthlyGrossOverrideKurus?: number;
  severanceApplies: boolean;
  noticeApplies: boolean;
}): Promise<SeveranceQuoteView> {
  // Tazminat rakamı ücret bilgisinin türevi; `staff:read` yetmez.
  await requirePermission("staff:payroll");
  const t = await getTranslations("app.staff");

  try {
    const result = await apiPost(
      "/v1/panel/staff/tazminat",
      {
        staffId: params.staffId,
        endedAt: params.endedAt,
        monthlyGrossOverrideMinor: params.monthlyGrossOverrideKurus,
        severanceApplies: params.severanceApplies,
        noticeApplies: params.noticeApplies,
      },
      severanceQuoteResult,
    );

    return {
      ok: true,
      data: {
        staffName: result.staffName,
        serviceYears: result.serviceYears,
        serviceMonthsRemainder: result.serviceMonthsRemainder,
        noticeWeeks: result.noticeWeeks,
        monthlyGrossKurus: result.monthlyGrossMinor,
        cappedMonthlyGrossKurus: result.cappedMonthlyGrossMinor,
        ceilingExcessKurus: result.ceilingExcessMinor,
        severance: {
          grossKurus: result.severance.grossMinor,
          stampDutyKurus: result.severance.stampDutyMinor,
          netKurus: result.severance.netMinor,
        },
        notice: {
          grossKurus: result.notice.grossMinor,
          stampDutyKurus: result.notice.stampDutyMinor,
          incomeTaxKurus: result.notice.incomeTaxMinor,
          netKurus: result.notice.netMinor,
        },
        totalNetKurus: result.totalNetMinor,
        belowMinimumService: result.belowMinimumService,
        parametersEffectiveFrom: result.parametersEffectiveFrom,
        ceilingKurus: result.ceilingMinor,
        incomeTaxRate: result.incomeTaxRate,
      },
    };
  } catch {
    return { ok: false, message: t("severanceFailed") };
  }
}
