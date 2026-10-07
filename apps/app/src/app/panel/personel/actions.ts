"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { severanceQuoteResult, staffSaveResult } from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  checkboxField,
  dateField,
  ibanField,
  intField,
  kurusField,
  okState,
  optionalText,
  optionalUuidField,
  periodField,
  optionalDateField,
  phoneField,
  requiredText,
  runAction,
  tcknField,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/* ------------------------------------------------------------------ *
 * Personel kaydı — PROJE-DURUMU §5.2'nin ilk maddesi
 * ------------------------------------------------------------------ */

const STAFF_ROLES = [
  "kapici",
  "guvenlik",
  "temizlik",
  "bahcivan",
  "teknik",
  "diger",
] as const;

const staffSchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  fullName: requiredText(3, 160),
  role: z.enum(STAFF_ROLES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  phone: phoneField,
  /*
   * TCKN ve IBAN **isteğe bağlı ve boş bırakılabilir**: kayıt açılırken bu
   * belgeler çoğu zaman elde değil. Zorunlu kılmak, yöneticiyi uydurma değer
   * girmeye ya da personeli hiç kaydetmemeye iterdi.
   */
  tckn: tcknField,
  iban: ibanField,
  clearTckn: checkboxField,
  clearIban: checkboxField,
  grossSalaryKurus: kurusField({ min: 0 }),
  netSalaryKurus: kurusField({ min: 0 }),
  sgkPremiumKurus: kurusField({ min: 0 }),
  startedAt: dateField,
  endedAt: optionalDateField,
  annualLeaveDays: intField({ min: 0, max: 365 }),
  usedLeaveDays: intField({ min: 0, max: 365 }),
});

/**
 * Personel kaydı oluşturma/güncelleme.
 *
 * TEK EYLEM, İKİ UÇ: `id` varsa `PATCH`, yoksa `POST`. Ayırmak, aynı
 * doğrulama şemasını iki eylemde tekrarlamak olurdu.
 *
 * TCKN/IBAN boş gönderilirse sunucu **mevcut kaydı koruyor**; silmek için
 * ayrı bir kutucuk var. Bu ayrım burada değil `apps/api`'de uygulanıyor —
 * karar şifreli alana dokunan tarafın kararı.
 */
export async function saveStaff(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "staff:write",
      schema: staffSchema,
      meta: { action: "staff_saved", resource: "staff" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.staff");

      const body = {
        fullName: input.fullName,
        role: input.role,
        phone: input.phone ?? null,
        tckn: input.tckn ?? null,
        iban: input.iban ?? null,
        clearTckn: input.clearTckn,
        clearIban: input.clearIban,
        grossSalaryMinor: input.grossSalaryKurus,
        netSalaryMinor: input.netSalaryKurus,
        sgkPremiumMinor: input.sgkPremiumKurus,
        startedAt: input.startedAt,
        endedAt: input.endedAt ?? null,
        annualLeaveDays: input.annualLeaveDays,
        usedLeaveDays: input.usedLeaveDays,
      };

      const result = input.id
        ? await apiPatch(`/v1/panel/staff/${input.id}`, body, staffSaveResult)
        : await apiPost("/v1/panel/staff", body, staffSaveResult);

      // Demirbaş zimmet seçenekleri personel listesinden besleniyor.

      return okState(t("saved", { name: result.fullName }), {
        data: { id: result.id },
      });
    },
  );
}

export interface StaffMutationResult {
  ok: boolean;
  message: string;
}

/**
 * Personel kaydını sil.
 *
 * Ayrılan personel için **doğru işlem bu değil**: ayrılış tarihi girmek
 * kaydı pasife düşürüyor ve puantaj/izin/zimmet geçmişini koruyor. Bu eylem
 * yalnız yanlışlıkla açılmış kayıt için var ve ekranda da öyle anlatılıyor.
 */
export async function deleteStaff(id: string): Promise<StaffMutationResult> {
  await requirePermission("staff:write");
  const t = await getTranslations("app.staff");

  await apiDelete(`/v1/panel/staff/${id}`);

  return { ok: true, message: t("deleted") };
}

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
      "/v1/panel/staff/severance",
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

/* ------------------------------------------------------------------ *
 * Personel carisi — tahakkuk, mahsup, ödeme, iptal (`staff:payroll`)
 * ------------------------------------------------------------------ */

const accrueSchema = z.object({ period: periodField, entryDate: dateField });

/** Aktif personel için dönem maaş tahakkuku (net ücret). */
export async function accruePayroll(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "staff:payroll", schema: accrueSchema, meta: { action: "staff_payroll_accrued", resource: "staff" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.staff");
      const result = (await apiPost("/v1/panel/staff/payroll/accrue", input)) as { created: number; skipped: number };
      return okState(t("accrued", { created: result.created, skipped: result.skipped }));
    },
  );
}

const ledgerSchema = z.object({
  staffId: uuidField,
  kind: z.enum(["accrual", "advance_deduction"]),
  entryDate: dateField,
  amountKurus: kurusField({ min: 1 }),
  period: z.preprocess((v) => (v === "" ? undefined : v), periodField.optional()),
  description: optionalText(500),
});

export async function addStaffLedgerEntry(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "staff:payroll", schema: ledgerSchema, meta: { action: "staff_ledger_added", resource: "staff" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.staff");
      await apiPost(`/v1/panel/staff/${input.staffId}/ledger`, {
        kind: input.kind,
        entryDate: input.entryDate,
        amountMinor: input.amountKurus,
        period: input.period ?? null,
        description: input.description ?? null,
      });
      return okState(t(input.kind === "accrual" ? "ledgerAccrued" : "ledgerDeducted"));
    },
  );
}

const paySchema = z.object({
  staffId: uuidField,
  kind: z.enum(["salary", "advance"]),
  amountKurus: kurusField({ min: 1 }),
  paidAt: dateField,
  bankAccountId: optionalUuidField,
  description: optionalText(240),
});

export async function payStaff(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "staff:payroll", schema: paySchema, meta: { action: "staff_paid", resource: "staff" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.staff");
      await apiPost(`/v1/panel/staff/${input.staffId}/payments`, {
        kind: input.kind,
        amountMinor: input.amountKurus,
        paidAt: input.paidAt,
        bankAccountId: input.bankAccountId ?? null,
        description: input.description ?? null,
      });
      return okState(t(input.kind === "advance" ? "advancePaid" : "salaryPaid"));
    },
  );
}

const voidSchema = z.object({ staffId: uuidField, entryId: uuidField, reason: requiredText(10, 500) });

export async function voidStaffLedgerEntry(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "staff:payroll", schema: voidSchema, meta: { action: "staff_ledger_voided", resource: "staff" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.staff");
      await apiPost(`/v1/panel/staff/${input.staffId}/ledger/${input.entryId}/void`, { reason: input.reason });
      return okState(t("ledgerVoided"));
    },
  );
}
