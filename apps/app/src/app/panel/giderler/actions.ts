"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  expenseBulkResult,
  expenseDistributePreview,
  expenseDistributeResult,
} from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  asArray,
  checkboxField,
  dateField,
  decimalField,
  intField,
  kurusField,
  okState,
  optionalText,
  optionalUuidField,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Gider yönetimi — GAP 4.1.4.
 *
 * ÇÖZÜLEN TEMEL SORUN: gider kaydı bir kategori kimliğine bağlıydı ama arayüzden
 * kategori **eklenemiyordu**; yeni bir gider türü çıktığında kayıt eksik kalıyordu.
 * Artık kategori CRUD'u var, hiyerarşik (iki seviye) ve her kategori kendi
 * varsayılan dağıtım formülünü taşıyor.
 *
 * İKİNCİ EKSİK: gider → daire yansıması. `distributedAt` alanı vardı, dağıtan
 * kod yoktu. Dağıtım gideri kategorinin (veya seçilen) formülüne göre dairelere
 * borç olarak yazıyor ve gideri "dağıtıldı" işaretliyor — çift dağıtım engelli.
 *
 * MIMARI-PLAN §8.5 sonrası: bu dosya doğrulama + HTTP. KDV hesabı, dağıtım
 * formülü, kategori derinlik sınırı ve "dağıtılmış gider değiştirilemez" kuralı
 * `apps/api`'de.
 */

const DISTRIBUTIONS = [
  "equal",
  "land_share",
  "area",
  "person_count",
  "meter",
  "custom",
] as const;

/* ------------------------------------------------------------------ *
 * Kategori CRUD
 * ------------------------------------------------------------------ */

const categorySchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  name: requiredText(2, 120),
  parentId: optionalUuidField,
  distribution: z.enum(DISTRIBUTIONS, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  isShared: checkboxField,
  icon: optionalText(40),
  color: optionalText(9),
  defaultVatRate: decimalField({ min: 0, max: 1 }),
  isActive: checkboxField,
  sortOrder: intField({ min: 0, max: 999 }),
});

const savedIdSchema = z.object({ id: z.string().uuid() });

export async function saveExpenseCategory(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "expense:write",
      schema: categorySchema,
      meta: {
        action: "expense_category_saved",
        resource: "expense_category",
      },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.expenses");

      const { id } = await apiPost(
        "/v1/panel/expenses/categories",
        {
          id: input.id,
          name: input.name,
          parentId: input.parentId ?? null,
          distribution: input.distribution,
          isShared: input.isShared,
          icon: input.icon ?? null,
          color: input.color ?? null,
          defaultVatRate: input.defaultVatRate ?? null,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        },
        savedIdSchema,
      );

      revalidatePath("/panel/giderler");
      revalidatePath("/panel/giderler/kategoriler");
      return okState(t("categorySaved", { name: input.name }), {
        data: { id },
      });
    },
  );
}

export interface BulkResult {
  ok: boolean;
  message: string;
}

const archiveResultSchema = z.object({
  archived: z.boolean(),
  usage: z.number().int(),
});

/**
 * Kategori arşivleme.
 *
 * Altında gider veya alt kategori varsa **silinmez, pasifleştirilir**: geçmiş
 * gider kayıtlarının kategorisini kopartmak raporları bozardı. Pasif kategori
 * yeni gider formunda görünmez ama eski kayıtlarda adı okunmaya devam eder.
 */
export async function archiveExpenseCategory(id: string): Promise<BulkResult> {
  await requirePermission("expense:write");
  const t = await getTranslations("app.expenses");

  const result = await apiDelete(`/v1/panel/expenses/categories/${id}`).then(
    (raw) => archiveResultSchema.parse(raw),
  );

  revalidatePath("/panel/giderler");
  revalidatePath("/panel/giderler/kategoriler");

  return {
    ok: true,
    message: result.archived
      ? t("categoryArchived")
      : t("categoryDeactivated", { count: result.usage }),
  };
}

/* ------------------------------------------------------------------ *
 * Gider CRUD
 * ------------------------------------------------------------------ */

const expenseSchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  categoryId: optionalUuidField,
  vendorName: optionalText(160),
  description: requiredText(3, 240),
  amountKurus: kurusField({ min: 1 }),
  vatRate: decimalField({ min: 0, max: 1 }),
  withholdingKurus: kurusField({ min: 0 }),
  invoiceNo: optionalText(60),
  expenseDate: dateField,
  paidVia: optionalText(40),
  isPaid: checkboxField,
  attachmentUrl: optionalText(500),
  status: z.enum(
    ["draft", "pending_approval", "approved", "rejected", "paid"],
    {
      errorMap: () => ({ message: V.invalidSelection }),
    },
  ),
});

/**
 * Gider kaydı.
 *
 * KDV **tutar üzerinden hesaplanır, ayrı girilmez** (GAP-DURUM kararı 10):
 * yönetici 1.200 TL'lik faturayı görüp KDV'yi elle yazmak zorunda kalmasın.
 * `amountKurus` KDV dahil toplamdır; KDV tutarı sunucuda orandan türetilir.
 * Böylece toplam ile kalem toplamı asla uyuşmazlık göstermez.
 */
export async function saveExpense(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "expense:write",
      schema: expenseSchema,
      meta: { action: "expense_saved", resource: "expense" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.expenses");

      const { id } = await apiPost(
        "/v1/panel/expenses",
        {
          id: input.id,
          categoryId: input.categoryId ?? null,
          vendorName: input.vendorName ?? null,
          description: input.description,
          amountMinor: input.amountKurus,
          vatRate: input.vatRate ?? null,
          withholdingMinor: input.withholdingKurus,
          invoiceNo: input.invoiceNo ?? null,
          expenseDate: input.expenseDate,
          paidVia: input.paidVia ?? null,
          isPaid: input.isPaid,
          attachmentUrl: input.attachmentUrl ?? null,
          status: input.status,
        },
        savedIdSchema,
      );

      revalidatePath("/panel/giderler");
      revalidatePath(`/panel/giderler/${id}`);

      return okState(t("saved"), {
        redirectTo: `/panel/giderler/${id}`,
        data: { id },
      });
    },
  );
}

/** Gider onayı / reddi — GAP 4.1.4 "onay/iptal/red akışı". */
export async function setExpenseStatus(
  ids: string[],
  status: "approved" | "rejected" | "paid",
): Promise<BulkResult> {
  await requirePermission("expense:approve");
  const t = await getTranslations("app.expenses");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  const result = await apiPatch(
    "/v1/panel/expenses/status",
    { ids: targets, status },
    expenseBulkResult,
  );

  revalidatePath("/panel/giderler");
  return {
    ok: true,
    message: t(`status_${status}_done`, { count: result.affected }),
  };
}

export async function deleteExpenses(ids: string[]): Promise<BulkResult> {
  await requirePermission("expense:write");
  const t = await getTranslations("app.expenses");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  const result = await apiPost(
    "/v1/panel/expenses/trash",
    { ids: targets },
    expenseBulkResult,
  );
  revalidatePath("/panel/giderler");

  return result.affected === result.requested
    ? { ok: true, message: t("bulkDeleted", { count: result.affected }) }
    : {
        ok: true,
        message: t("bulkDeletedPartial", {
          count: result.affected,
          skipped: result.requested - result.affected,
        }),
      };
}

/* ------------------------------------------------------------------ *
 * Gider → daire dağıtımı
 * ------------------------------------------------------------------ */

const distributeSchema = z.object({
  expenseId: uuidField,
  /** Boş = kategorinin varsayılan formülü. */
  formula: z.enum(DISTRIBUTIONS, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  period: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined ? undefined : value,
    z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, V.invalidPeriod)
      .optional(),
  ),
  dueDay: intField({ min: 1, max: 28 }),
  blockIds: z.preprocess(
    (value) => (Array.isArray(value) ? value : value ? [value] : []),
    z.array(z.string().uuid()).default([]),
  ),
  /** Yalnız KDV hariç tutarı yansıt (KDV yönetim tarafında kalır). */
  excludeVat: checkboxField,
  /** Önizlemeyi gören kullanıcının onayı — GAP-DURUM kararı 8. */
  confirmed: checkboxField,
});

export interface DistributeResult {
  debtCount: number;
  totalKurus: number;
}

function toDistributeBody(
  input: z.output<typeof distributeSchema>,
  confirmed: boolean,
) {
  return {
    expenseId: input.expenseId,
    formula: input.formula,
    dueDay: input.dueDay,
    period: input.period ?? null,
    blockIds: input.blockIds,
    excludeVat: input.excludeVat,
    confirmed,
  };
}

/**
 * Gideri dairelere borç olarak yansıtır — GAP 4.1.4 + GAP-DURUM kararı 8.
 *
 * Bir gider **yalnız bir kez** dağıtılabilir. İkinci deneme reddedilir; aksi
 * halde aynı fatura sakine iki kez yazılır ve geri almak tek tek borç iptali
 * gerektirirdi. Onaysız gönderim de yazmaz: API `preview_required` döner.
 */
export async function distributeExpense(
  _previous: ActionState<DistributeResult>,
  formData: FormData,
): Promise<ActionState<DistributeResult>> {
  return runAction(
    {
      permission: "expense:approve",
      schema: distributeSchema,
      meta: {
        action: "expense_distributed",
        resource: "expense",
      },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.expenses");

      const result = await apiPost(
        "/v1/panel/expenses/allocation",
        toDistributeBody(input, true),
        expenseDistributeResult,
        // API dile bağımsız (SPEC 4.2) ama ürettiği borç açıklaması kullanıcının
        // dilinde olmalı. Panel **etiketi** gönderiyor; giderin kendi açıklamasını
        // sunucu ekliyor (o metni yalnız sunucu biliyor).
        { debtDescription: t("distributedLabel") },
      );

      revalidatePath("/panel/giderler");
      revalidatePath(`/panel/giderler/${input.expenseId}`);
      revalidatePath("/panel/borclar");

      return okState(t("distributed", { count: result.debtCount }), {
        data: { debtCount: result.debtCount, totalKurus: result.totalMinor },
      });
    },
  );
}

/** Dağıtım önizlemesi — hangi daireye ne düşeceğini kaydetmeden gösterir. */
export async function previewDistribution(input: {
  expenseId: string;
  formula: string;
  blockIds: string[];
  excludeVat: boolean;
}): Promise<{
  rows: { unitNumber: string; amountKurus: number; exempt: boolean }[];
  totalKurus: number;
  error?: string;
}> {
  await requirePermission("expense:read");
  const t = await getTranslations("app.expenses");

  try {
    const preview = await apiPost(
      "/v1/panel/expenses/allocation/preview",
      {
        expenseId: input.expenseId,
        formula: input.formula,
        // Önizleme vade hesabı yapmıyor; şema zorunlu kıldığı için nötr değer.
        dueDay: 1,
        blockIds: input.blockIds,
        excludeVat: input.excludeVat,
      },
      expenseDistributePreview,
    );

    return {
      rows: preview.rows.map((row) => ({
        unitNumber: row.unitNumber,
        amountKurus: row.amountMinor,
        exempt: row.exempt,
      })),
      totalKurus: preview.totalMinor,
      // Sessiz geri düşüş olmasın: seçilen formül uygulanamadıysa söyleniyor.
      error: preview.fellBackToEqual ? t("formulaFellBack") : undefined,
    };
  } catch {
    return { rows: [], totalKurus: 0, error: t("noTargetUnits") };
  }
}
