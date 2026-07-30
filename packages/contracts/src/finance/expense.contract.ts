import { z } from "zod";

import { dateTime, moneyMinor, uuid } from "../_shared/fields";
import { listQuery, pageMeta } from "../_shared/list";

/**
 * Gider sözleşmesi — MIMARI-PLAN §6.4 `expense`.
 *
 * Dağıtım (giderin dairelere borç olarak yansıtılması) yıkıcı bir işlem:
 * geri almak için üretilen borçları tek tek iptal etmek gerekir. Bu yüzden
 * GAP-DURUM kararı 8 burada da geçerli — `confirmed: false` ile yazma reddedilir.
 */

export const EXPENSE_SORT_KEYS = [
  "expenseDate",
  "amount",
  "category",
  "vendor",
  "status",
] as const;
export const expenseSort = z.enum(EXPENSE_SORT_KEYS);

export const EXPENSE_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "paid",
  "rejected",
] as const;
export const expenseStatus = z.enum(EXPENSE_STATUSES);

/* ------------------------------------------------------------------ *
 * Liste
 * ------------------------------------------------------------------ */

export const expenseListQuery = listQuery.extend({
  sort: expenseSort.default("expenseDate"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  categoryId: uuid.optional(),
  period: z.string().max(7).optional(),
  status: expenseStatus.optional(),
  /** `bekliyor` henüz dağıtılmamış · `yapildi` dağıtılmış. */
  distribution: z.enum(["all", "bekliyor", "yapildi"]).default("all"),
});

export type ExpenseListQuery = z.infer<typeof expenseListQuery>;

export const expenseRow = z.object({
  id: uuid,
  description: z.string(),
  vendorName: z.string().nullable(),
  categoryId: uuid.nullable(),
  categoryName: z.string().nullable(),
  categoryColor: z.string().nullable(),
  amountMinor: moneyMinor,
  vatMinor: moneyMinor,
  withholdingMinor: moneyMinor,
  invoiceNo: z.string().nullable(),
  expenseDate: dateTime,
  paidAt: dateTime.nullable(),
  status: z.string(),
  distributedAt: dateTime.nullable(),
  period: z.string().nullable(),
  attachmentUrl: z.string().nullable(),
});

export type ExpenseRow = z.infer<typeof expenseRow>;

export const expenseListResponse = z.object({
  rows: z.array(expenseRow),
  meta: pageMeta,
  facets: z.object({
    categories: z.array(
      z.object({
        id: uuid,
        name: z.string(),
        depth: z.number().int(),
        color: z.string().nullable(),
      }),
    ),
    periods: z.array(z.string()),
  }),
  totals: z.object({
    monthMinor: moneyMinor,
    yearMinor: moneyMinor,
    pendingMinor: moneyMinor,
    undistributedMinor: moneyMinor,
  }),
  /** Kategori kırılımı (bu yıl) — yatay sütun grafiği. */
  byCategory: z.array(z.object({ name: z.string(), amountMinor: moneyMinor })),
});

export type ExpenseListResponse = z.infer<typeof expenseListResponse>;

/* ------------------------------------------------------------------ *
 * Kategori ağacı
 * ------------------------------------------------------------------ */

export interface CategoryTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  distribution: string;
  isShared: boolean;
  icon: string | null;
  color: string | null;
  defaultVatRate: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Bu kategoriye yazılmış gider sayısı — silme kararında gösterilir. */
  expenseCount: number;
  totalMinor: number;
  children: CategoryTreeNode[];
}

const categoryTreeNode: z.ZodType<CategoryTreeNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    parentId: z.string().nullable(),
    depth: z.number().int(),
    distribution: z.string(),
    isShared: z.boolean(),
    icon: z.string().nullable(),
    color: z.string().nullable(),
    defaultVatRate: z.string().nullable(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
    expenseCount: z.number().int(),
    totalMinor: z.number().int(),
    children: z.array(categoryTreeNode),
  }),
);

export const categoryTree = z.object({ roots: z.array(categoryTreeNode) });
export type CategoryTree = z.infer<typeof categoryTree>;

export const DISTRIBUTIONS = [
  "equal",
  "land_share",
  "area",
  "person_count",
  "meter",
  "custom",
] as const;
export const distributionFormula = z.enum(DISTRIBUTIONS);

export const expenseCategorySave = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2).max(120),
  parentId: uuid.nullish(),
  distribution: distributionFormula,
  isShared: z.coerce.boolean().default(true),
  icon: z.string().trim().max(40).nullish(),
  color: z.string().trim().max(9).nullish(),
  /** 0–1 arası kesir (0.20 = %20). */
  defaultVatRate: z.coerce.number().min(0).max(1).nullish(),
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type ExpenseCategorySave = z.infer<typeof expenseCategorySave>;

/* ------------------------------------------------------------------ *
 * Detay ve yazma
 * ------------------------------------------------------------------ */

export const expenseDetail = z.object({
  expense: z.object({
    id: uuid,
    description: z.string(),
    vendorName: z.string().nullable(),
    categoryId: uuid.nullable(),
    amountMinor: moneyMinor,
    vatMinor: moneyMinor,
    vatRate: z.string().nullable(),
    withholdingMinor: moneyMinor,
    invoiceNo: z.string().nullable(),
    expenseDate: dateTime,
    paidAt: dateTime.nullable(),
    paidVia: z.string().nullable(),
    /** Paranın çıktığı banka hesabı; null = nakit kasa. */
    bankAccountId: uuid.nullable(),
    period: z.string().nullable(),
    status: z.string(),
    distributedAt: dateTime.nullable(),
    attachmentUrl: z.string().nullable(),
    createdAt: dateTime,
    deletedAt: dateTime.nullable(),
  }),
  categoryName: z.string().nullable(),
  categoryDistribution: z.string().nullable(),
  /** Bu giderden doğan borçlar (dağıtıldıysa). */
  generatedDebts: z.array(
    z.object({
      unitNumber: z.string(),
      amountMinor: moneyMinor,
      status: z.string(),
    }),
  ),
});

export type ExpenseDetail = z.infer<typeof expenseDetail>;

export const expenseSave = z.object({
  id: uuid.optional(),
  categoryId: uuid.nullish(),
  vendorName: z.string().trim().max(160).nullish(),
  description: z.string().trim().min(3).max(240),
  /** KDV **dahil** toplam tutar. */
  amountMinor: z.coerce.number().int().positive(),
  /**
   * KDV **oranı** (0–1 arası kesir); tutar sunucuda türetilir —
   * GAP-DURUM kararı 10. Yönetici 1.200 TL'lik faturayı görüp KDV'yi elle
   * yazmak zorunda kalmasın; iki alanın elle doldurulması kaçınılmaz olarak
   * tutarsız kayıt üretiyordu.
   */
  vatRate: z.coerce.number().min(0).max(1).nullish(),
  withholdingMinor: z.coerce.number().int().min(0).default(0),
  invoiceNo: z.string().trim().max(60).nullish(),
  expenseDate: dateTime,
  paidVia: z.string().trim().max(40).nullish(),
  /**
   * Paranın çıktığı banka hesabı; **null = nakit kasa**.
   *
   * `paidVia` serbest metin (örn. "havale") ve hangi hesaptan çıktığını
   * söylemiyor. Kasa dökümü "bu hesaptan ne çıktı" sorusunu ancak bu alanla
   * cevaplayabiliyor; olmadığında bütün giderler tek havuza yazılıyordu.
   */
  bankAccountId: uuid.nullish(),
  isPaid: z.coerce.boolean().default(false),
  attachmentUrl: z.string().trim().max(500).nullish(),
  status: expenseStatus,
});

export type ExpenseSave = z.infer<typeof expenseSave>;

export const expenseStatusPatch = z.object({
  ids: z.array(uuid).min(1),
  status: z.enum(["approved", "rejected", "paid"]),
});

export const expenseBulkResult = z.object({
  affected: z.number().int(),
  requested: z.number().int(),
});

export type ExpenseBulkResult = z.infer<typeof expenseBulkResult>;

/* ------------------------------------------------------------------ *
 * Dağıtım — yıkıcı, önizleme zorunlu
 * ------------------------------------------------------------------ */

export const expenseDistribute = z.object({
  expenseId: uuid,
  formula: distributionFormula,
  dueDay: z.coerce.number().int().min(1).max(28),
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullish(),
  blockIds: z.array(uuid).default([]),
  /** Yalnız KDV hariç tutarı yansıt (KDV yönetim tarafında kalır). */
  excludeVat: z.coerce.boolean().default(false),
  /**
   * Önizlemeden geçmemiş dağıtım yazılmaz → `preview_required`.
   * Dağıtım yıkıcı: geri almak için üretilen borçları tek tek iptal etmek
   * gerekir, gider de yalnız bir kez dağıtılabilir.
   */
  confirmed: z.coerce.boolean().default(false),
});

export type ExpenseDistribute = z.infer<typeof expenseDistribute>;

export const expenseDistributePreview = z.object({
  rows: z.array(
    z.object({
      unitId: uuid,
      unitNumber: z.string(),
      amountMinor: moneyMinor,
      exempt: z.boolean(),
    }),
  ),
  totalMinor: moneyMinor,
  unitCount: z.number().int(),
  /**
   * Seçilen formül uygulanamadıysa (örn. arsa payı hiç girilmemişse) motor
   * eşit dağıtıma düşüyor. Bunu **söylemek** zorundayız: sessiz geri düşüş,
   * yöneticinin seçtiğini sandığı formülle yazılanın ayrışması demek.
   */
  fellBackToEqual: z.boolean(),
});

export type ExpenseDistributePreview = z.infer<typeof expenseDistributePreview>;

export const expenseDistributeResult = z.object({
  debtCount: z.number().int(),
  totalMinor: moneyMinor,
});

export type ExpenseDistributeResult = z.infer<typeof expenseDistributeResult>;

export const expenseIds = z.object({ ids: z.array(uuid).min(1) });
