import { z } from "zod";

import { dateTime, moneyMinor, uuid } from "../_shared/fields";

/**
 * `tenancy` bağlamı — site ayarları ve personel (MIMARI-PLAN §6.3).
 *
 * PERSONEL VE KİŞİSEL VERİ: `staff` satırlarında şifreli TCKN ve IBAN var.
 * Sözleşme bunları **taşımıyor** — ne açık ne şifreli. Panelin personel
 * ekranında bordro tutarları görünüyor, kimlik numarası değil; ihtiyaç
 * doğduğunda (bordro dosyası üretimi) çözme yine yalnız `apps/api` içinde
 * kalacak. §9.1'in kuralı okuma uçlarına da uygulanıyor.
 */

/* ------------------------------------------------------------------ *
 * Site ayarları
 * ------------------------------------------------------------------ */

export const tenantSettingsResponse = z.object({
  id: uuid,
  name: z.string(),
  slug: z.string(),
  type: z.string(),
  status: z.string(),
  unitCount: z.number().int(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  neighborhood: z.string().nullable(),
  addressLine: z.string().nullable(),
  postalCode: z.string().nullable(),
  /** Serbest biçimli ayar sözlüğü (aidat günü, gecikme oranı, kanallar…). */
  settings: z.record(z.unknown()),
  landingPublished: z.boolean(),
  currentPeriodEnd: dateTime.nullable(),
  trialEndsAt: dateTime.nullable(),
  createdAt: dateTime,
});

export type TenantSettingsResponse = z.infer<typeof tenantSettingsResponse>;

/* ------------------------------------------------------------------ *
 * Personel
 * ------------------------------------------------------------------ */

export const staffRow = z.object({
  id: uuid,
  fullName: z.string(),
  role: z.string(),
  /** Maskeli — ham numara panele gitmiyor (§9.1). */
  phoneMasked: z.string().nullable(),
  grossSalaryMinor: moneyMinor,
  netSalaryMinor: moneyMinor,
  sgkPremiumMinor: moneyMinor,
  startedAt: dateTime,
  endedAt: dateTime.nullable(),
  annualLeaveDays: z.number().int(),
  usedLeaveDays: z.number().int(),
  advanceBalanceMinor: moneyMinor,
  isActive: z.boolean(),
  /** Kimlik/IBAN kayıtlı mı — değerin kendisi değil, varlığı. */
  hasTckn: z.boolean(),
  hasIban: z.boolean(),
});

export const staffAttendanceRow = z.object({
  id: uuid,
  staffId: uuid,
  staffName: z.string().nullable(),
  checkInAt: dateTime,
  checkOutAt: dateTime.nullable(),
  method: z.string(),
  note: z.string().nullable(),
  /** Çalışılan saat; çıkış yapılmamışsa null. */
  workedHours: z.number().nullable(),
});

export const staffListResponse = z.object({
  rows: z.array(staffRow),
  attendance: z.array(staffAttendanceRow),
  totals: z.object({
    active: z.number().int(),
    monthlyGrossMinor: moneyMinor,
    monthlySgkMinor: moneyMinor,
    openShifts: z.number().int(),
  }),
});

export type StaffListResponse = z.infer<typeof staffListResponse>;
