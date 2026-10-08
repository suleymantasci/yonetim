"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  bulkResult as bulkResultSchema,
  unitBulkCreateResult,
  unitBulkPreview,
  type UnitBulkCreate,
} from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  ActionError,
  asArray,
  checkboxField,
  decimalField,
  errorState,
  intField,
  okState,
  optionalText,
  optionalUuidField,
  reasonMessage,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Bağımsız bölüm (birim) ve blok aksiyonları — GAP 4.1.1.
 *
 * MIMARI-PLAN §8.5 sonrası: Server Action **korunuyor** (form deseni,
 * `useActionState`, revalidation aynı) — değişen tek şey içinin SQL değil HTTP
 * olması. Doğrulama hâlâ burada bir kez yapılıyor (form alanları FormData'dan
 * geliyor ve kullanıcıya alan bazlı hata gösterilmesi gerekiyor), ama
 * **bağlayıcı** doğrulama API'de: sunucu şemayı yeniden çalıştırıyor.
 *
 * Denetim kütüğünü artık API yazıyor (MIMARI-PLAN §8.4), çünkü hangi kaydın
 * gerçekten ne şekilde değiştiğini yalnız servis biliyor (§8.4).
 *
 * Silme her zaman **soft-delete**: kayıt 30 gün çöp kutusunda kalır. Kalıcı
 * silme arayüzden hiç sunulmaz (GAP-DURUM kararı 12).
 */

const UNIT_TYPES = [
  "flat",
  "shop",
  "office",
  "depot",
  "garage",
  "villa",
  "common_area",
] as const;
const OWNERSHIP_TYPES = ["owner", "tenant", "vacant"] as const;

/**
 * Gerekçe alanı olmayan ekranlar için sistem gerekçesi.
 *
 * GAP-DURUM kararı 9 "gerekçesiz düzeltme yok" diyor; API bunu 10 karakter
 * eşiğiyle zorluyor. Form ekranında kullanıcıdan gerekçe istemek bu sürümde
 * yok — o yüzden **kaynağı belirten** bir gerekçe yazılıyor: kütükte "panel
 * formundan güncellendi" satırı, hiç satır olmamasından iyidir ve alan
 * eklendiğinde yerini kullanıcının metnine bırakır.
 */
const PANEL_FORM_REASON = "Panel birim formundan güncellendi.";

/* ------------------------------------------------------------------ *
 * Tek birim oluşturma / güncelleme
 * ------------------------------------------------------------------ */

const unitSchema = z.object({
  blockId: optionalUuidField,
  number: requiredText(1, 20),
  floor: intField({ min: -10, max: 200 }),
  type: z.enum(UNIT_TYPES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  areaM2: decimalField({ min: 1, max: 100_000 }),
  landShare: decimalField({ min: 0, max: 1000 }),
  landShareNumerator: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? undefined
        : Number(value),
    z.number().int(V.invalidAmount).min(1, V.minValue(1)).optional(),
  ),
  landShareDenominator: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? undefined
        : Number(value),
    z.number().int(V.invalidAmount).min(1, V.minValue(1)).optional(),
  ),
  roomCount: optionalText(10),
  residentCount: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined ? 0 : Number(value),
    z
      .number()
      .int(V.invalidAmount)
      .min(0, V.minValue(0))
      .max(50, V.maxValue(50)),
  ),
  ownershipType: z.enum(OWNERSHIP_TYPES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  duesExempt: checkboxField,
  lateFeeExempt: checkboxField,
  duesMultiplier: decimalField({ min: 0, max: 10 }),
  notes: optionalText(2000),
});

type UnitInput = z.output<typeof unitSchema>;

/** Form çıktısını sözleşme gövdesine çevirir; `undefined` alanlar `null` olur. */
function toUnitBody(input: UnitInput) {
  return {
    blockId: input.blockId ?? null,
    number: input.number,
    floor: input.floor,
    type: input.type,
    areaM2: input.areaM2 ?? null,
    landShare: input.landShare ?? null,
    landShareNumerator: input.landShareNumerator ?? null,
    landShareDenominator: input.landShareDenominator ?? null,
    roomCount: input.roomCount ?? null,
    residentCount: input.residentCount,
    ownershipType: input.ownershipType,
    duesExempt: input.duesExempt,
    lateFeeExempt: input.lateFeeExempt,
    duesMultiplier: input.duesMultiplier ?? 1,
    notes: input.notes ?? null,
  };
}

const createdSchema = z.object({ id: z.string().uuid() });

export async function createUnit(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "unit:write",
      schema: unitSchema,
      meta: { action: "unit_created", resource: "unit" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.units");
      const created = await apiPost(
        "/v1/panel/units",
        toUnitBody(input),
        createdSchema,
      );

      if (!created?.id) throw new ActionError(t("createFailed"));

      return okState(t("created", { number: input.number }), {
        redirectTo: `/panel/birimler/${created.id}`,
        data: { id: created.id },
      });
    },
  );
}

export async function updateUnit(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  const schema = unitSchema.extend({ id: uuidField });

  return runAction(
    {
      permission: "unit:write",
      schema,
      meta: { action: "unit_updated", resource: "unit" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.units");

      await apiPatch(`/v1/panel/units/${input.id}`, toUnitBody(input), null, {
        reason: PANEL_FORM_REASON,
      });

      return okState(t("updated", { number: input.number }), {
        redirectTo: `/panel/birimler/${input.id}`,
        data: { id: input.id },
      });
    },
  );
}

/* ------------------------------------------------------------------ *
 * Toplu üretim (blok sihirbazı)
 * ------------------------------------------------------------------ */

const bulkCreateSchema = z.object({
  blockId: optionalUuidField,
  /** Yeni blok adı (blockId boşsa oluşturulur). */
  newBlockName: optionalText(60),
  floorFrom: intField({ min: -5, max: 200 }),
  floorTo: intField({ min: -5, max: 200 }),
  perFloor: intField({ min: 1, max: 40 }),
  /** "{blok}-{no}" gibi kalıp; {kat} ve {no} desteklenir. */
  pattern: requiredText(1, 40),
  /** Numaralandırma katta 1'den mi başlar, kat*100+n mi (301, 302…). */
  numbering: z.enum(["sequential", "floorPrefixed"], {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  type: z.enum(UNIT_TYPES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  areaM2: decimalField({ min: 1, max: 100_000 }),
  landShareDenominator: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? undefined
        : Number(value),
    z.number().int(V.invalidAmount).min(1, V.minValue(1)).optional(),
  ),
  /** Önizlemeyi gören kullanıcının onayı — GAP-DURUM kararı 8. */
  confirmed: checkboxField,
});

export type BulkCreateResult = z.infer<typeof unitBulkCreateResult>;
export type BulkPreview = z.infer<typeof unitBulkPreview>;

/**
 * Sihirbaz iki adımlı: önce sunucunun ürettiği numara listesi, sonra yazma.
 * Adımı **veri** ayırt ediyor, ayrı bir aksiyon değil — form tek `action`
 * kullanmaya devam ediyor, `useActionState` akışı bozulmuyor.
 */
export type BulkStep =
  | { kind: "preview"; preview: BulkPreview }
  | { kind: "created"; result: BulkCreateResult };

function toBulkBody(
  input: z.output<typeof bulkCreateSchema>,
  confirmed: boolean,
): UnitBulkCreate {
  return {
    blockId: input.blockId ?? null,
    newBlockName: input.newBlockName ?? null,
    floorFrom: input.floorFrom,
    floorTo: input.floorTo,
    perFloor: input.perFloor,
    pattern: input.pattern,
    numbering: input.numbering,
    type: input.type,
    areaM2: input.areaM2 ?? null,
    landShareDenominator: input.landShareDenominator ?? null,
    confirmed,
  };
}

/**
 * Toplu birim üretimi — GAP 4.1.1 ("tüm A blok otomatik") + GAP-DURUM kararı 8.
 *
 * **İki adım, tek aksiyon.** Onaysız gönderim yazmaz; sunucunun ürettiği
 * numara listesini döndürür. Onaylı gönderim yazar. Kural yalnız arayüzde
 * değil protokolde de var: `confirmed: false` ile yazma ucu çağrılırsa API
 * `preview_required` döndürüyor.
 *
 * Önizleme ve yazma sunucuda **aynı** numaralandırma fonksiyonunu kullanıyor;
 * gösterilen liste ile yazılan liste ayrışamaz. Önceki sürümde önizleme
 * istemcide ayrıca hesaplanıyordu — iki kopya, iki kural.
 *
 * Zaten var olan numaralar **atlanır, hata verilmez**: yönetici sihirbazı
 * ikinci kez çalıştırıp eksik kalanları tamamlamak isteyebilir. Hangi
 * numaraların atlandığı hem önizlemede hem sonuçta görünür, sessizce yutulmaz.
 */
export async function createUnitsBulk(
  _previous: ActionState<BulkStep>,
  formData: FormData,
): Promise<ActionState<BulkStep>> {
  return runAction(
    {
      permission: "unit:write",
      schema: bulkCreateSchema,
      meta: { action: "unit_bulk_created", resource: "unit" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.units");
      const guard = validateBulkRange<BulkStep>(input, t);
      if (guard) return guard;

      if (!input.confirmed) {
        const preview = await apiPost(
          "/v1/panel/units/bulk/preview",
          toBulkBody(input, false),
          unitBulkPreview,
        );
        return okState(t("bulkPreviewReady", { count: preview.total }), {
          data: { kind: "preview", preview },
        });
      }

      const result = await apiPost(
        "/v1/panel/units/bulk",
        toBulkBody(input, true),
        unitBulkCreateResult,
      );

      return okState(
        result.skipped.length > 0
          ? t("bulkCreatedWithSkips", {
              created: result.created,
              skipped: result.skipped.length,
            })
          : t("bulkCreated", { created: result.created }),
        { data: { kind: "created", result }, redirectTo: "/panel/birimler" },
      );
    },
  );
}

/**
 * Aralık kontrolleri istemci tarafında da yapılıyor ki kullanıcı alan bazlı
 * hata görsün; API aynı kontrolleri tekrar çalıştırıyor (bağlayıcı olan o).
 */
function validateBulkRange<T>(
  input: z.output<typeof bulkCreateSchema>,
  t: (key: string, values?: Record<string, string | number>) => string,
): ActionState<T> | null {
  if (input.floorTo < input.floorFrom) {
    return errorState(t("floorRangeInvalid"), {
      floorTo: [t("floorRangeInvalid")],
    });
  }
  if (!input.blockId && !input.newBlockName) {
    return errorState(t("blockRequired"), {
      newBlockName: [t("blockRequired")],
    });
  }
  const planned = (input.floorTo - input.floorFrom + 1) * input.perFloor;
  if (planned > 500) return errorState(t("bulkTooMany", { max: 500 }));
  return null;
}

/* ------------------------------------------------------------------ *
 * Toplu düzenleme / silme
 * ------------------------------------------------------------------ */

export interface BulkResult {
  ok: boolean;
  message: string;
}

/** Toplu soft-delete. */
export async function softDeleteUnits(ids: string[]): Promise<BulkResult> {
  await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  const result = await apiPost(
    "/v1/panel/units/trash",
    { ids: targets },
    bulkResultSchema,
  );
  return { ok: true, message: t("bulkDeleted", { count: result.affected }) };
}

/** Çöp kutusundan geri alma — GAP 4.1.1 (30 gün içinde). */
export async function restoreUnits(ids: string[]): Promise<BulkResult> {
  await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  try {
    const result = await apiPost(
      "/v1/panel/units/restore",
      { ids: targets },
      bulkResultSchema,
    );
    return { ok: true, message: t("bulkRestored", { count: result.affected }) };
  } catch (error) {
    // Paket daire sınırı: geri yükleme de daire sayısını artırıyor.
    const message = await reasonMessage(error);
    if (message) return { ok: false, message };
    throw error;
  }
}

const bulkPatchSchema = z.object({
  ids: z.array(uuidField).min(1, V.required),
  /** Aidat çarpanına oran uygula (örn. 1.10 = %10 zam). */
  multiplierFactor: z.number().min(0.1).max(10).optional(),
  duesExempt: z.boolean().optional(),
  lateFeeExempt: z.boolean().optional(),
  blockId: z.string().uuid().nullable().optional(),
});

/**
 * Toplu alan güncellemesi — GAP 4.1.1 ("tüm birimlere %10 zam").
 *
 * Zam, `duesMultiplier` üzerinden **oransal** uygulanır; tutar doğrudan
 * yazılmaz. Böylece aidat planı değiştiğinde çarpan korunur ve "kime ne kadar
 * zam yapıldı" bilgisi tek yerde kalır.
 */
export async function bulkPatchUnits(
  input: z.input<typeof bulkPatchSchema>,
): Promise<BulkResult> {
  await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const parsed = bulkPatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("selectionEmpty") };

  const result = await apiPatch(
    "/v1/panel/units/bulk",
    parsed.data,
    bulkResultSchema,
    {
      reason: describeBulkPatch(parsed.data),
    },
  );

  return { ok: true, message: t("bulkPatched", { count: result.affected }) };
}

/**
 * Toplu değişikliğin gerekçesi otomatik üretiliyor ve **ne yapıldığını**
 * anlatıyor: kütüğe "12 birime %10 zam" yazmak, "toplu güncelleme" yazmaktan
 * denetçi için ölçülemeyecek kadar daha kullanışlı.
 */
function describeBulkPatch(data: z.output<typeof bulkPatchSchema>): string {
  const parts: string[] = [`${data.ids.length} birim`];
  if (data.multiplierFactor !== undefined) {
    const pct = Math.round((data.multiplierFactor - 1) * 100);
    parts.push(
      pct >= 0
        ? `aidat çarpanı %${pct} artırıldı`
        : `aidat çarpanı %${-pct} azaltıldı`,
    );
  }
  if (data.duesExempt !== undefined) {
    parts.push(
      data.duesExempt ? "aidat muafiyeti açıldı" : "aidat muafiyeti kapatıldı",
    );
  }
  if (data.lateFeeExempt !== undefined) {
    parts.push(
      data.lateFeeExempt
        ? "gecikme muafiyeti açıldı"
        : "gecikme muafiyeti kapatıldı",
    );
  }
  if (data.blockId !== undefined) parts.push("blok değiştirildi");
  return parts.join(", ");
}

/* ------------------------------------------------------------------ *
 * Blok CRUD
 * ------------------------------------------------------------------ */

const blockSchema = z.object({
  id: optionalUuidField,
  name: requiredText(1, 60),
  floorCount: intField({ min: 1, max: 200 }),
  hasElevator: checkboxField,
  sortOrder: intField({ min: 0, max: 999 }),
});

export async function saveBlock(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "unit:write",
      schema: blockSchema,
      meta: { action: "block_saved", resource: "block" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.units");
      const body = {
        name: input.name,
        floorCount: input.floorCount,
        hasElevator: input.hasElevator,
        sortOrder: input.sortOrder,
      };

      if (input.id) {
        await apiPatch(`/v1/panel/units/blocks/${input.id}`, body, null);
      } else {
        await apiPost("/v1/panel/units/blocks", body, createdSchema);
      }

      return okState(t("blockSaved", { name: input.name }));
    },
  );
}

/**
 * Blok silme. İçinde aktif birim varsa API `conflict` döner: birimleri sahipsiz
 * bırakmak (blockId = null) yöneticinin fark etmediği veri kaybı olurdu.
 */
export async function softDeleteBlock(id: string): Promise<BulkResult> {
  await requirePermission("unit:write");
  const t = await getTranslations("app.units");

  try {
    await apiDelete(`/v1/panel/units/blocks/${id}`);
  } catch (error) {
    const count = blockedUnitCount(error);
    if (count !== null)
      return { ok: false, message: t("blockNotEmpty", { count }) };
    throw error;
  }

  return { ok: true, message: t("blockDeleted") };
}

/** `conflict:block_not_empty:<n>` kodundan birim sayısını okur. */
function blockedUnitCount(error: unknown): number | null {
  const message = error instanceof Error ? error.message : "";
  const match = /block_not_empty:(\d+)/.exec(message);
  return match ? Number(match[1]) : null;
}
