"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  debtBulkPreview,
  debtBulkResult,
  debtBulkResultSimple,
  debtCreateResult,
  paymentCollectResult,
} from "@yonetim/contracts";
import { addMonths, currentPeriod, periodKey } from "@yonetim/core";

import { apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  asArray,
  checkboxField,
  dateField,
  intField,
  kurusField,
  okState,
  optionalText,
  optionalUuidField,
  periodField,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Borçlandırma — GAP 4.1.3.
 *
 * ÜÇ AKIŞ:
 *   1. `createDebt`      — tek birime tek/çoklu kalem
 *   2. `createBulkDebts` — çok birime formülle dağıtım (toplu sihirbaz)
 *   3. `collectPayment`  — tahsilat + mahsup (en eski vade önce)
 *
 * MIMARI-PLAN §8.5 sonrası bu dosya **sunum tarafı**: form doğrulaması
 * (kullanıcıya alan bazlı hata gösterebilmek için) ve HTTP çağrısı. Borç
 * üretimi, dağıtım formülü, mahsup sırası ve gerekçe zorunluluğu artık
 * `apps/api`'de — aynı mantığı sakin portalı ve mobil de tüketecek.
 *
 * ŞEFFAFLIK (SPEC 3.2) korunuyor: tutar/vade değişikliğinde gerekçe
 * `app.change_reason` oturum değişkenine yazılıyor ve `trg_debts_change_log`
 * trigger'ı onu sakine gösterilen tarihçeye taşıyor. Fark: bunu artık
 * `DbService.txWithReason()` yapıyor, 199 ayrı çağrı yeri değil.
 */

const DEBT_KINDS = [
  "dues",
  "utility",
  "reservation",
  "penalty",
  "late_fee",
  "extra",
  "legal_cost",
] as const;

const SHARE_TARGETS = ["owner", "tenant", "split", "share"] as const;

/* ------------------------------------------------------------------ *
 * 1) Tek borç
 * ------------------------------------------------------------------ */

const debtSchema = z.object({
  unitId: uuidField,
  kind: z.enum(DEBT_KINDS, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  description: requiredText(3, 200),
  amountKurus: kurusField({ min: 1 }),
  dueDate: dateField,
  period: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined ? undefined : value,
    z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, V.invalidPeriod)
      .optional(),
  ),
  shareTarget: z.enum(SHARE_TARGETS, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  lateFeeExempt: checkboxField,
  /** Taksit sayısı; 1 = tek seferlik. */
  installmentCount: intField({ min: 1, max: 36 }),
  notes: optionalText(1000),
});

export async function createDebt(
  _previous: ActionState<{ ids: string[] }>,
  formData: FormData,
): Promise<ActionState<{ ids: string[] }>> {
  return runAction(
    {
      permission: "debt:write",
      schema: debtSchema,
      meta: { action: "debt_created", resource: "debt" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.debts");

      const created = await apiPost(
        "/v1/panel/debts",
        {
          unitId: input.unitId,
          kind: input.kind,
          description: input.description,
          amountMinor: input.amountKurus,
          dueDate: input.dueDate,
          period: input.period,
          shareTarget: input.shareTarget,
          lateFeeExempt: input.lateFeeExempt,
          installmentCount: input.installmentCount,
          notes: input.notes,
        },
        debtCreateResult,
      );

      revalidatePath("/panel/borclar");
      revalidatePath(`/panel/birimler/${input.unitId}`);

      return okState(
        created.ids.length === 1
          ? t("created", { unit: created.unitNumber })
          : t("createdMany", {
              count: created.ids.length,
              unit: created.unitNumber,
            }),
        {
          redirectTo:
            created.ids.length === 1
              ? `/panel/borclar/${created.ids[0]}`
              : "/panel/borclar",
          data: { ids: created.ids },
        },
      );
    },
  );
}

/* ------------------------------------------------------------------ *
 * 2) Toplu borçlandırma
 * ------------------------------------------------------------------ */

const bulkDebtSchema = z.object({
  description: requiredText(3, 200),
  kind: z.enum(DEBT_KINDS, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  period: periodField,
  dueDay: intField({ min: 1, max: 28 }),
  formula: z.enum(["equal", "land_share", "area", "person_count", "custom"], {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  /** equal: birim başı tutar; diğerleri: dağıtılacak havuz. */
  amountKurus: kurusField({ min: 1 }),
  shareTarget: z.enum(SHARE_TARGETS, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  /** Boş = tüm bloklar. */
  blockIds: z.preprocess(
    (value) => (Array.isArray(value) ? value : value ? [value] : []),
    z.array(z.string().uuid()).default([]),
  ),
  unitTypes: z.preprocess(
    (value) => (Array.isArray(value) ? value : value ? [value] : []),
    z.array(z.string()).default([]),
  ),
  skipExisting: checkboxField,
  lateFeeExempt: checkboxField,
});

type BulkInput = z.output<typeof bulkDebtSchema>;

export interface BulkDebtPreview {
  unitId: string;
  unitNumber: string;
  blockName: string | null;
  amountKurus: number;
  exempt: boolean;
  alreadyExists: boolean;
}

export interface BulkDebtResult {
  createdCount: number;
  skippedCount: number;
  totalKurus: number;
}

function toBulkBody(input: BulkInput) {
  return {
    description: input.description,
    kind: input.kind,
    period: input.period,
    dueDay: input.dueDay,
    formula: input.formula,
    amountMinor: input.amountKurus,
    shareTarget: input.shareTarget,
    blockIds: input.blockIds,
    unitTypes: input.unitTypes,
    skipExisting: input.skipExisting,
    lateFeeExempt: input.lateFeeExempt,
  };
}

/**
 * Toplu borçlandırma önizlemesi — kaydetmeden hangi daireye ne düşeceğini
 * gösterir (GAP-DURUM kararı 8).
 *
 * Önizleme ve yazma sunucuda **aynı** dağıtım fonksiyonunu kullanıyor; iki
 * ayrı hesap olsaydı önizlemenin gösterdiğiyle yazılan ayrışabilirdi.
 */
export async function previewBulkDebts(
  input: z.input<typeof bulkDebtSchema>,
): Promise<{ rows: BulkDebtPreview[]; totalKurus: number; error?: string }> {
  await requirePermission("debt:write");
  const t = await getTranslations("app.debts");
  const parsed = bulkDebtSchema.safeParse(input);
  if (!parsed.success)
    return { rows: [], totalKurus: 0, error: t("previewInvalid") };

  try {
    const preview = await apiPost(
      "/v1/panel/debts/toplu/onizleme",
      toBulkBody(parsed.data),
      debtBulkPreview,
    );
    return {
      rows: preview.rows.map((row) => ({
        unitId: row.unitId,
        unitNumber: row.unitNumber,
        blockName: row.blockName,
        amountKurus: row.amountMinor,
        exempt: row.exempt,
        alreadyExists: row.alreadyExists,
      })),
      totalKurus: preview.totalMinor,
    };
  } catch {
    // Önizleme kritik yol değil: hata halinde sihirbaz açık kalsın, yönetici
    // filtresini düzeltip yeniden denesin.
    return { rows: [], totalKurus: 0, error: t("noTargetUnits") };
  }
}

export async function createBulkDebts(
  _previous: ActionState<BulkDebtResult>,
  formData: FormData,
): Promise<ActionState<BulkDebtResult>> {
  return runAction(
    {
      permission: "debt:write",
      schema: bulkDebtSchema,
      meta: { action: "debt_bulk_created", resource: "debt" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.debts");

      const result = await apiPost(
        "/v1/panel/debts/toplu",
        toBulkBody(input),
        debtBulkResult,
      );

      revalidatePath("/panel/borclar");
      revalidatePath("/panel");

      const data: BulkDebtResult = {
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        totalKurus: result.totalMinor,
      };

      return okState(
        result.skippedCount > 0
          ? t("bulkCreatedWithSkips", {
              count: result.createdCount,
              skipped: result.skippedCount,
            })
          : t("bulkCreated", { count: result.createdCount }),
        { data },
      );
    },
  );
}

/* ------------------------------------------------------------------ *
 * 3) Borç düzeltme (gerekçe zorunlu)
 * ------------------------------------------------------------------ */

const adjustSchema = z.object({
  id: uuidField,
  amountKurus: kurusField({ min: 0 }),
  dueDate: dateField,
  /** Zorunlu — sakine gösterilecek gerekçe (SPEC 3.2). */
  reason: requiredText(10, 500),
  visibleToResident: checkboxField,
  lateFeeExempt: checkboxField,
});

/**
 * Borç tutarı/vadesi düzeltme.
 *
 * Gerekçe **10 karakterden kısa olamaz**: "düzeltme" gibi içi boş bir metin
 * sakinin sorusunu cevaplamıyor. Aynı eşik sözleşmede (`changeReason`) ve
 * `DbService.txWithReason()` içinde de var — üç yerde de aynı sayı.
 */
export async function adjustDebt(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "debt:write",
      schema: adjustSchema,
      meta: { action: "debt_adjusted", resource: "debt" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.debts");

      await apiPatch(
        `/v1/panel/debts/${input.id}`,
        {
          amountMinor: input.amountKurus,
          dueDate: input.dueDate,
          reason: input.reason,
          visibleToResident: input.visibleToResident,
          lateFeeExempt: input.lateFeeExempt,
        },
        null,
        { reason: input.reason },
      );

      revalidatePath("/panel/borclar");
      revalidatePath(`/panel/borclar/${input.id}`);
      return okState(t("adjusted"));
    },
  );
}

/* ------------------------------------------------------------------ *
 * 4) Tahsilat
 * ------------------------------------------------------------------ */

const collectSchema = z.object({
  unitId: uuidField,
  amountKurus: kurusField({ min: 1 }),
  method: z.enum(
    ["cash", "bank_transfer", "card", "credit_balance", "offset"],
    {
      errorMap: () => ({ message: V.invalidSelection }),
    },
  ),
  paidAt: dateField,
  payerUserId: optionalUuidField,
  receiptNo: optionalText(30),
  /** Belirli borçlara öncelik verilsin (boşsa en eski vade önce). */
  debtIds: z.preprocess(
    (value) => (Array.isArray(value) ? value : value ? [value] : []),
    z.array(z.string().uuid()).default([]),
  ),
  note: optionalText(500),
});

export interface CollectResult {
  allocatedKurus: number;
  creditBalanceKurus: number;
  closedDebtCount: number;
}

/**
 * Manuel tahsilat kaydı + mahsup.
 *
 * Mahsup sırası `packages/dues/allocation` tarafından belirlenir (en eski vade,
 * her borçta önce gecikme tazminatı). Bu mantık kasıtlı olarak paket içinde:
 * hem panel tahsilatında hem ödeme webhook'unda aynı kural işlemeli.
 *
 * Borcu aşan kısım `creditBalance` olarak döner ve kullanıcıya bildirilir;
 * sessizce yutmak yönetici için görünmez bir fark yaratırdı.
 */
export async function collectPayment(
  _previous: ActionState<CollectResult>,
  formData: FormData,
): Promise<ActionState<CollectResult>> {
  return runAction(
    {
      permission: "payment:create",
      schema: collectSchema,
      meta: { action: "payment_collected", resource: "payment" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.debts");

      const result = await apiPost(
        "/v1/panel/debts/tahsilat",
        {
          unitId: input.unitId,
          amountMinor: input.amountKurus,
          method: input.method,
          paidAt: input.paidAt,
          payerUserId: input.payerUserId,
          receiptNo: input.receiptNo,
          debtIds: input.debtIds,
          note: input.note,
        },
        paymentCollectResult,
      );

      revalidatePath("/panel/borclar");
      revalidatePath(`/panel/birimler/${input.unitId}`);
      revalidatePath("/panel");

      return okState(
        result.creditBalanceMinor > 0
          ? t("collectedWithCredit", {
              credit: (result.creditBalanceMinor / 100).toFixed(2),
            })
          : t("collected", { count: result.closedDebtCount }),
        {
          data: {
            allocatedKurus: result.allocatedMinor,
            creditBalanceKurus: result.creditBalanceMinor,
            closedDebtCount: result.closedDebtCount,
          },
        },
      );
    },
  );
}

/* ------------------------------------------------------------------ *
 * 5) Toplu işlemler
 * ------------------------------------------------------------------ */

export interface BulkResult {
  ok: boolean;
  message: string;
}

/** Borç iptali (soft-delete). Kısmen bile ödenmiş borç iptal edilemez. */
export async function cancelDebts(
  ids: string[],
  reason: string,
): Promise<BulkResult> {
  await requirePermission("debt:write");
  const t = await getTranslations("app.debts");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };
  if (reason.trim().length < 10)
    return { ok: false, message: t("reasonTooShort") };

  const result = await apiPost(
    "/v1/panel/debts/iptal",
    { ids: targets, reason },
    debtBulkResultSimple,
    { reason },
  );

  revalidatePath("/panel/borclar");

  return result.affected === result.requested
    ? { ok: true, message: t("bulkCancelled", { count: result.affected }) }
    : {
        ok: true,
        message: t("bulkCancelledPartial", {
          count: result.affected,
          skipped: result.requested - result.affected,
        }),
      };
}

/** Gecikme tazminatı muafiyetini toplu aç/kapat — GAP 4.2.5. */
export async function setLateFeeExempt(
  ids: string[],
  exempt: boolean,
): Promise<BulkResult> {
  await requirePermission("debt:write");
  const t = await getTranslations("app.debts");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  const result = await apiPatch(
    "/v1/panel/debts/gecikme-muafiyeti",
    { ids: targets, exempt },
    debtBulkResultSimple,
  );

  revalidatePath("/panel/borclar");
  return {
    ok: true,
    message: exempt
      ? t("exemptApplied", { count: result.affected })
      : t("exemptRemoved", { count: result.affected }),
  };
}

/** Sonraki dönem anahtarını verir (form varsayılanı). */
export async function nextPeriodKey(): Promise<string> {
  return periodKey(addMonths(currentPeriod(), 1));
}
