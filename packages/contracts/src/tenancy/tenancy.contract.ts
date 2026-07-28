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

/* ------------------------------------------------------------------ *
 * Kıdem / ihbar tazminatı hesaplayıcı — rakip incelemesi §4.1
 * ------------------------------------------------------------------ */

/**
 * `POST /v1/panel/staff/tazminat`.
 *
 * NİYE SUNUCUDA HESAPLANIYOR: girdilerin ikisi (işe giriş tarihi ve
 * giydirilmiş brüt ücret) `staff` tablosunda ve **panele hiç gitmiyor**
 * (§9.1 — bordro tutarları listede var ama hesabın tavan/vergi parametreleri
 * yok). İstemcide hesaplamak ya bu verileri dışarı taşımayı ya da kullanıcıya
 * elle girdirmeyi gerektirirdi; ikisi de mevcut kaydı atlatır.
 *
 * Ücret **ezilebiliyor** (`monthlyGrossOverrideMinor`): "zam yapsak tazminat
 * ne olur" sorusu yöneticinin gerçekten sorduğu soru. Ezme kaydı değiştirmez,
 * yalnız hesabı besler.
 */
export const severanceQuote = z.object({
  staffId: uuid,
  /** Fesih tarihi — varsayılan bugün değil, açıkça seçilir. */
  endedAt: dateTime,
  /** Boş = personel kaydındaki brüt ücret. Kuruş. */
  monthlyGrossOverrideMinor: z.coerce.number().int().min(0).optional(),
  /**
   * Hakların doğup doğmadığı **olgu** sorusudur, koddan türetilemez: istifa,
   * haklı nedenle derhal fesih (md.25/II) ya da önel kullandırılması bu
   * hakları düşürür. Yönetici işaretler.
   */
  severanceApplies: z.coerce.boolean().default(true),
  noticeApplies: z.coerce.boolean().default(true),
});

export type SeveranceQuote = z.infer<typeof severanceQuote>;

const severanceComponent = z.object({
  grossMinor: moneyMinor,
  stampDutyMinor: moneyMinor,
  incomeTaxMinor: moneyMinor,
  netMinor: moneyMinor,
});

export const severanceQuoteResult = z.object({
  staffName: z.string(),
  startedAt: dateTime,
  endedAt: dateTime,
  serviceDays: z.number().int(),
  /** Ekranda "6 yıl 4 ay" biçiminde gösterilebilsin diye ayrık. */
  serviceYears: z.number().int(),
  serviceMonthsRemainder: z.number().int(),
  monthlyGrossMinor: moneyMinor,
  cappedMonthlyGrossMinor: moneyMinor,
  /** Tavanı aşan aylık kısım; 0 değilse ekran bunu ayrıca yazar. */
  ceilingExcessMinor: moneyMinor,
  noticeWeeks: z.number().int(),
  severance: severanceComponent,
  notice: severanceComponent,
  totalNetMinor: moneyMinor,
  belowMinimumService: z.boolean(),
  /**
   * Hesapta kullanılan tavan/vergi parametrelerinin yürürlük tarihi.
   * Ekranda **gösteriliyor**: eskimiş bir tavanla üretilmiş rakam sessiz
   * kalmasın, kullanıcı tarihi görüp sorgulayabilsin.
   */
  parametersEffectiveFrom: z.string(),
  ceilingMinor: moneyMinor,
  incomeTaxRate: z.number(),
});

export type SeveranceQuoteResult = z.infer<typeof severanceQuoteResult>;

/* ------------------------------------------------------------------ *
 * Platform paneli (süper-admin)
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/panel/platform/overview` — süper-admin özeti (SPEC Bölüm 18).
 *
 * "BİR EKRAN = BİR ÇAĞRI" (§9a): eskiden aynı sayfada yedi ayrı sorgu vardı.
 * Yedi uca bölmek, tek bir açılışı yedi gidiş-dönüşe çıkarırdı.
 *
 * Bu uç **tenant sınırının dışında** çalışıyor: platform genelinin sayıları
 * tanımı gereği tek bir siteye ait değil. Bu yüzden yetki kontrolü rol
 * bazlı ve dar — yalnız platform rolleri.
 */
export const platformOverview = z.object({
  tenants: z.object({
    total: z.number().int(),
    trial: z.number().int(),
    active: z.number().int(),
    pastDue: z.number().int(),
    suspended: z.number().int(),
  }),
  revenue: z.object({ mrrMinor: moneyMinor, arrMinor: moneyMinor }),
  notifications: z.object({
    sent: z.number().int(),
    failed: z.number().int(),
    /** Oran sunucuda: sıfıra bölme kararı tek yerde verilsin. */
    failureRate: z.number(),
    costMinor: moneyMinor,
  }),
  overdueKvkkCount: z.number().int(),
  recentTenants: z.array(
    z.object({
      id: uuid,
      name: z.string(),
      slug: z.string(),
      status: z.string(),
      unitCount: z.number().int(),
      createdAt: dateTime,
    }),
  ),
  campaigns: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      usageCount: z.number().int(),
      usageLimit: z.number().int().nullable(),
    }),
  ),
  featureFlags: z.array(
    z.object({
      id: uuid,
      key: z.string(),
      enabled: z.boolean(),
      rolloutPct: z.number().int(),
    }),
  ),
  plans: z.array(
    z.object({ id: uuid, name: z.string(), yearlyPriceMinor: moneyMinor }),
  ),
});

export type PlatformOverview = z.infer<typeof platformOverview>;
