"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { maintenanceSaveResult } from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  checkboxField,
  dateField,
  intField,
  kurusField,
  okState,
  optionalText,
  optionalUuidField,
  requiredText,
  runAction,
  uuidField,
  type ActionState,
} from "@/lib/form";

/**
 * Bakım planı yazma köprüsü — PROJE-DURUMU §5.2, sıra 3.
 *
 * `maintenance.reminders` worker job'ı zaten yazılıydı; eksik olan
 * hatırlatacak kaydı üretmenin yoluydu. Bu dosya hazır boru hattının kapalı
 * girişini açıyor.
 *
 * İKİ AYRI EYLEM: plan düzenlemesi ve "yapıldı" olayı. Sunucudaki ayrımın
 * aynısı — tek forma toplamak, planı düzelten birinin son bakım tarihini de
 * farkında olmadan değiştirmesine yol açardı.
 */

const maintenanceSchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  templateId: optionalUuidField,
  equipmentType: requiredText(2, 80),
  label: requiredText(3, 160),
  location: optionalText(120),
  intervalDays: intField({ min: 1, max: 3650 }),
  nextDueAt: dateField,
  isActive: checkboxField,
  notes: optionalText(2000),
});

export async function saveMaintenance(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "maintenance:write",
      schema: maintenanceSchema,
      meta: { action: "maintenance_saved", resource: "maintenance_record" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.maintenance");

      const body = {
        templateId: input.templateId ?? null,
        equipmentType: input.equipmentType,
        label: input.label,
        location: input.location ?? null,
        intervalDays: input.intervalDays,
        nextDueAt: input.nextDueAt,
        isActive: input.isActive,
        notes: input.notes ?? null,
      };

      const result = input.id
        ? await apiPatch(
            `/v1/panel/operations/maintenance/${input.id}`,
            body,
            maintenanceSaveResult,
          )
        : await apiPost(
            "/v1/panel/operations/maintenance",
            body,
            maintenanceSaveResult,
          );

      revalidatePath("/panel/bakim");
      return okState(t("saved", { label: result.label }), {
        data: { id: result.id },
      });
    },
  );
}

const completeSchema = z.object({
  id: uuidField,
  doneAt: dateField,
  costKurus: kurusField({ min: 0 }),
  documentUrl: optionalText(500),
  note: optionalText(2000),
});

/**
 * "Bakım yapıldı."
 *
 * Sıradaki vadeyi sunucu hesaplıyor (yapıldığı tarih + periyot) — istemcinin
 * göndereceği bir tarih olsaydı, geç yapılan bir bakımın sonraki vadesi elle
 * ileri atılabilirdi ve periyot anlamını yitirirdi.
 */
export async function completeMaintenance(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "maintenance:write",
      schema: completeSchema,
      meta: {
        action: "maintenance_completed",
        resource: "maintenance_record",
      },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.maintenance");

      const result = await apiPost(
        `/v1/panel/operations/maintenance/${input.id}/complete`,
        {
          doneAt: input.doneAt,
          costMinor: input.costKurus,
          documentUrl: input.documentUrl ?? null,
          note: input.note ?? null,
        },
        z.object({ id: z.string().uuid(), nextDueAt: z.coerce.date() }),
      );

      revalidatePath("/panel/bakim");
      return okState(
        t("completed", {
          date: result.nextDueAt.toLocaleDateString("tr-TR"),
        }),
        { data: { id: input.id } },
      );
    },
  );
}

export interface MaintenanceMutationResult {
  ok: boolean;
  message: string;
}

export async function deleteMaintenance(
  id: string,
): Promise<MaintenanceMutationResult> {
  await requirePermission("maintenance:write");
  const t = await getTranslations("app.maintenance");

  await apiDelete(`/v1/panel/operations/maintenance/${id}`);
  revalidatePath("/panel/bakim");

  return { ok: true, message: t("deleted") };
}
