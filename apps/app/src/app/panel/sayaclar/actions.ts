"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  meterBillResult,
  meterReadingBatchResult,
  meterSaveResult,
  heatCostPreview,
  heatCostRequest,
  meterVendorPreview,
  type HeatCostPreview,
  type HeatCostRequest,
  type MeterVendorPreview,
} from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  checkboxField,
  dateField,
  decimalField,
  formToObject,
  kurusField,
  okState,
  optionalText,
  optionalUuidField,
  periodField,
  reasonMessage,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Sayaç yazma köprüsü — PROJE-DURUMU §5.2, sıra 4.
 *
 * Bu modülün eksikliği tek bir ekranı değil bir **aidat formülünü** kapalı
 * tutuyordu: `dues_plan.formula = "meter"` bu veriye bağımlıydı ve besleyecek
 * okuma girilemiyordu.
 *
 * Türetilmiş değerler (önceki endeks, tüketim, tutar, anomali) burada
 * hesaplanmıyor — hepsi `apps/api`'de.
 */

const METER_TYPES = [
  "water",
  "hot_water",
  "gas",
  "electric",
  "heat_calorimeter",
] as const;

const meterSchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  unitId: optionalUuidField,
  type: z.enum(METER_TYPES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  serialNo: optionalText(60),
  isCommon: checkboxField,
  unitPriceKurus: kurusField({ min: 0 }),
  initialValue: decimalField({ min: 0, max: 9_999_999 }),
});

export async function saveMeter(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "meter:write",
      schema: meterSchema,
      meta: { action: "meter_saved", resource: "meter" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.meters");

      const body = {
        unitId: input.unitId ?? null,
        type: input.type,
        serialNo: input.serialNo ?? null,
        isCommon: input.isCommon,
        unitPriceMinor: input.unitPriceKurus,
        initialValue: input.initialValue ?? 0,
        isActive: true,
      };

      const result = input.id
        ? await apiPatch(
            `/v1/panel/operations/meters/${input.id}`,
            body,
            meterSaveResult,
          )
        : await apiPost(
            "/v1/panel/operations/meters",
            body,
            meterSaveResult,
          );

      return okState(t("saved"), { data: { id: result.id } });
    },
  );
}

export interface ReadingBatchState {
  ok: boolean;
  message?: string;
  data?: {
    created: number;
    updated: number;
    skipped: number;
    anomalies: number;
    totalKurus: number;
    flagged: {
      meterId: string;
      unitNumber: string | null;
      consumption: string;
      reason: "negative" | "spike";
    }[];
  };
}

/**
 * Dönemsel toplu okuma girişi.
 *
 * `runAction` **kullanılmıyor**: o sarmalayıcı tek bir kaynak için tek bir
 * denetim kaydı yazıyor, burada ise tek istekte onlarca okuma var ve kütüğe
 * geçmesi gereken şey "şu dönem için N okuma girildi" özeti — onu `apps/api`
 * kendi işlemi içinde yazıyor.
 *
 * Alanlar `meter_<id>` biçiminde geliyor: satır sayısı sayaç sayısına bağlı
 * ve sabit bir şema yazılamaz.
 */
export async function recordMeterReadings(
  _previous: ReadingBatchState,
  formData: FormData,
): Promise<ReadingBatchState> {
  await requirePermission("meter:write");
  const t = await getTranslations("app.meters");

  const raw = formToObject(formData);
  const header = z
    .object({
      period: periodField,
      readingDate: dateField,
      overwrite: checkboxField,
    })
    .safeParse(raw);
  if (!header.success) {
    return { ok: false, message: t("batchInvalidHeader") };
  }

  /*
   * Boş bırakılan sayaç **atlanıyor, sıfır sayılmıyor**.
   *
   * Sıfır sayılsaydı, okunamayan bir sayaç (kilitli daire, arızalı gösterge)
   * "bu ay hiç kullanmadı" olarak kaydedilir ve bir sonraki dönemde iki
   * dönemlik tüketim tek faturaya binerdi.
   */
  const entries: { meterId: string; currentValue: number }[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith("meter_")) continue;
    const text = String(value ?? "").trim();
    if (text === "") continue;
    const parsed = Number(text.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    entries.push({ meterId: key.slice("meter_".length), currentValue: parsed });
  }

  if (entries.length === 0) {
    return { ok: false, message: t("batchNoEntries") };
  }

  const result = await apiPost(
    "/v1/panel/operations/meters/readings",
    {
      period: header.data.period,
      readingDate: header.data.readingDate,
      overwrite: header.data.overwrite,
      entries,
    },
    meterReadingBatchResult,
  );

  return {
    ok: true,
    message: t("batchDone", {
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
    }),
    data: {
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      anomalies: result.anomalies,
      totalKurus: result.totalMinor,
      flagged: result.flagged,
    },
  };
}

export interface MeterMutationResult {
  ok: boolean;
  message: string;
}

export async function deleteMeter(id: string): Promise<MeterMutationResult> {
  await requirePermission("meter:write");
  const t = await getTranslations("app.meters");

  await apiDelete(`/v1/panel/operations/meters/${id}`);

  return { ok: true, message: t("deleted") };
}

/* ------------------------------------------------------------------ *
 * Okuma düzeltme / silme / borçlandırma
 * ------------------------------------------------------------------ */

const correctSchema = z.object({
  id: uuidField,
  currentValue: decimalField({ min: 0, max: 999_999_999 }),
  reason: requiredText(10, 500),
});

/** Tek okumayı gerekçeyle düzelt; borçlandırılmış okuma reddedilir (409). */
export async function correctMeterReading(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "meter:write",
      schema: correctSchema,
      meta: { action: "meter_reading_corrected", resource: "meter_reading" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.meters");
      await apiPatch(`/v1/panel/operations/meters/readings/${input.id}`, {
        currentValue: input.currentValue,
        reason: input.reason,
      });
      return okState(t("readingCorrected"));
    },
  );
}

const removeReadingSchema = z.object({
  id: uuidField,
  reason: requiredText(10, 500),
});

export async function removeMeterReading(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "meter:write",
      schema: removeReadingSchema,
      meta: { action: "meter_reading_deleted", resource: "meter_reading" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.meters");
      await apiDelete(
        `/v1/panel/operations/meters/readings/${input.id}`,
        undefined,
        { reason: input.reason },
      );
      return okState(t("readingDeleted"));
    },
  );
}

const billSchema = z.object({
  period: periodField,
  dueDate: dateField,
  /** Okuma bedeli — her okumaya eklenir; boş = 0. */
  readingFeeKurus: kurusField({ min: 0 }).optional(),
  roundLira: checkboxField,
});

/** Dönem tüketimini daire borcu olarak yaz. */
export async function billMeterPeriod(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "meter:write",
      schema: billSchema,
      meta: { action: "meter_readings_billed", resource: "meter_reading" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.meters");
      const result = await apiPost(
        "/v1/panel/operations/meters/readings/bill",
        {
          period: input.period,
          dueDate: input.dueDate,
          readingFeeMinor: input.readingFeeKurus ?? 0,
          roundLira: input.roundLira,
        },
        meterBillResult,
      );
      return okState(
        result.billed > 0
          ? t("billed", { count: result.billed })
          : t("billedNothing"),
      );
    },
  );
}

/* ------------------------------------------------------------------ *
 * Okuma firması dosyası
 * ------------------------------------------------------------------ */

export interface VendorFileInput {
  period: string;
  fileBase64: string;
  dueDate?: string;
  description?: string;
  readingFeeKurus: number;
}

function vendorBody(input: VendorFileInput) {
  return {
    period: input.period,
    fileBase64: input.fileBase64,
    dueDate: input.dueDate ? new Date(`${input.dueDate}T20:59:00.000Z`).toISOString() : undefined,
    description: input.description?.trim() || undefined,
    readingFeeMinor: input.readingFeeKurus,
  };
}

export async function previewVendorFile(
  input: VendorFileInput,
): Promise<{ ok: true; data: MeterVendorPreview } | { ok: false; message: string }> {
  await requirePermission("meter:write");
  const tVendor = await getTranslations("app.meterVendor");
  try {
    return { ok: true, data: await apiPost("/v1/panel/operations/meters/vendor-import/preview", vendorBody(input), meterVendorPreview) };
  } catch (error) {
    return { ok: false, message: (await reasonMessage(error)) ?? tVendor("fileError") };
  }
}

export async function importVendorFile(input: VendorFileInput): Promise<{ ok: boolean; message: string }> {
  await requirePermission("meter:write");
  const tVendor = await getTranslations("app.meterVendor");
  try {
    const r = await apiPost(
      "/v1/panel/operations/meters/vendor-import",
      vendorBody(input),
      meterVendorPreview.extend({ created: z.number() }),
    );
    return { ok: true, message: tVendor("created", { count: r.created }) };
  } catch (error) {
    return { ok: false, message: (await reasonMessage(error)) ?? tVendor("fileError") };
  }
}

/* ------------------------------------------------------------------ *
 * Isı pay ölçerli paylaşım
 * ------------------------------------------------------------------ */

export async function previewHeatCost(
  input: HeatCostRequest,
): Promise<{ ok: true; data: HeatCostPreview } | { ok: false; message: string }> {
  await requirePermission("meter:write");
  const tHeat = await getTranslations("app.heatCost");
  const parsed = heatCostRequest.safeParse(input);
  if (!parsed.success) return { ok: false, message: tHeat("invalid") };
  try {
    return { ok: true, data: await apiPost("/v1/panel/operations/meters/heat-cost/preview", parsed.data, heatCostPreview) };
  } catch (error) {
    return { ok: false, message: (await reasonMessage(error)) ?? tHeat("failed") };
  }
}

export async function billHeatCost(input: HeatCostRequest): Promise<{ ok: boolean; message: string }> {
  await requirePermission("meter:write");
  const tHeat = await getTranslations("app.heatCost");
  const parsed = heatCostRequest.safeParse(input);
  if (!parsed.success) return { ok: false, message: tHeat("invalid") };
  try {
    const r = await apiPost(
      "/v1/panel/operations/meters/heat-cost",
      parsed.data,
      z.object({ created: z.number(), totalMinor: z.number() }),
    );
    return { ok: true, message: tHeat("billed", { count: r.created }) };
  } catch (error) {
    return { ok: false, message: (await reasonMessage(error)) ?? tHeat("failed") };
  }
}
