import { z } from "zod";

import { uuid } from "../_shared/fields";
import { debtKind } from "./debt.contract";

/**
 * Borç türü tanımları — kullanıcı tanımlı borçlandırma seçenekleri.
 *
 * `baseKind` davranış sınıfı (rapor, muhasebe varsayılanı); `debtor` borcun
 * kime yazılacağı: `occupant` = oturan (kiracı varsa kiracı, yoksa malik),
 * `owner` = malik (hisseli mülkte hisseye göre). Gecikme oranı aylık yüzde;
 * KMK md.20 üst sınırı %5. Boş oran = site ayarı.
 */
export const DEBT_TYPE_DEBTORS = ["occupant", "owner"] as const;
export const DEBT_TYPE_LATE_FEE_MODES = ["none", "monthly", "daily"] as const;

export const debtTypeRow = z.object({
  id: uuid,
  name: z.string(),
  baseKind: debtKind,
  debtor: z.enum(DEBT_TYPE_DEBTORS),
  lateFeeMode: z.enum(DEBT_TYPE_LATE_FEE_MODES),
  /** Aylık yüzde; `null` = site ayarı. */
  lateFeeMonthlyPct: z.number().nullable(),
  accountCode: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  /** Bu türe bağlı (silinmemiş) borç sayısı — silme yerine pasifleştirme önerilir. */
  debtCount: z.number().int(),
});

export type DebtTypeRow = z.infer<typeof debtTypeRow>;

export const debtTypeList = z.object({
  rows: z.array(debtTypeRow),
  /** Site ayarındaki varsayılan aylık gecikme yüzdesi (boş oranlar bunu kullanır). */
  siteLateFeeMonthlyPct: z.number(),
});

export type DebtTypeList = z.infer<typeof debtTypeList>;

export const debtTypeSave = z.object({
  name: z.string().trim().min(2).max(60),
  baseKind: debtKind.exclude(["late_fee"]),
  debtor: z.enum(DEBT_TYPE_DEBTORS),
  lateFeeMode: z.enum(DEBT_TYPE_LATE_FEE_MODES),
  lateFeeMonthlyPct: z.coerce.number().min(0).max(5).nullish(),
  /** Tekdüzen hesap planı kodu, ör. "600" ya da "602.10". */
  accountCode: z
    .string()
    .trim()
    .regex(/^6\d{2}(\.\d{1,3})?$/)
    .nullish(),
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type DebtTypeSave = z.infer<typeof debtTypeSave>;
