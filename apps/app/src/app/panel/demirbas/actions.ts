"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  INVENTORY_CATEGORIES,
  INVENTORY_STATUSES,
  inventoryPatchResult,
} from "@yonetim/contracts";

import { apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  asArray,
  intField,
  kurusField,
  okState,
  optionalDateField,
  optionalText,
  optionalUuidField,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Demirbaş defteri — KMK md.34/9, rakip incelemesi §4.1.
 *
 * SİLME EYLEMİ **YOK** ve eklenmemeli: defter bir tarihçe. Elden çıkan kalem
 * `setInventoryStatus` ile `disposed` ya da `lost` işaretleniyor, satır
 * kalıyor. "Geçen yıl bu jeneratör vardı, ne oldu" sorusu silinmiş bir
 * satırdan cevaplanamaz — devir teslimde sorulan asıl soru da bu.
 */

const inventorySchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  code: optionalText(40),
  name: requiredText(2, 160),
  category: z.enum(INVENTORY_CATEGORIES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  location: optionalText(120),
  quantity: intField({ min: 1, max: 100_000 }),
  serialNo: optionalText(80),
  purchaseDate: optionalDateField,
  purchasePriceKurus: kurusField({ min: 0 }),
  warrantyUntil: optionalDateField,
  status: z.enum(INVENTORY_STATUSES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  responsibleStaffId: optionalUuidField,
  notes: optionalText(1000),
});

const savedIdSchema = z.object({ id: z.string().uuid() });

export async function saveInventoryItem(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "inventory:write",
      schema: inventorySchema,
      meta: { action: "inventory_saved", resource: "inventory_item" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.inventory");

      const { id } = await apiPost(
        "/v1/panel/inventory",
        {
          id: input.id,
          code: input.code ?? null,
          name: input.name,
          category: input.category,
          location: input.location ?? null,
          quantity: input.quantity,
          serialNo: input.serialNo ?? null,
          purchaseDate: input.purchaseDate ?? null,
          purchasePriceMinor: input.purchasePriceKurus,
          warrantyUntil: input.warrantyUntil ?? null,
          status: input.status,
          responsibleStaffId: input.responsibleStaffId ?? null,
          notes: input.notes ?? null,
        },
        savedIdSchema,
      );

      revalidatePath("/panel/demirbas");
      return okState(t("saved", { name: input.name }), { data: { id } });
    },
  );
}

export interface InventoryBulkResult {
  ok: boolean;
  message: string;
}

/**
 * Toplu durum değişikliği — yıl sonu sayımının çıktısı.
 *
 * Kayıt silinmez, durumu değişir. `lost` işaretlemesi denetim kütüğüne
 * düşüyor: eksik demirbaş devir teslimde hesabı sorulacak bir kalem.
 */
export async function setInventoryStatus(
  ids: string[],
  status: (typeof INVENTORY_STATUSES)[number],
): Promise<InventoryBulkResult> {
  await requirePermission("inventory:write");
  const t = await getTranslations("app.inventory");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  const result = await apiPatch(
    "/v1/panel/inventory/status",
    { ids: targets, status },
    inventoryPatchResult,
  );

  revalidatePath("/panel/demirbas");
  return { ok: true, message: t("statusChanged", { count: result.affected }) };
}
