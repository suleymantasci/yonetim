"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { HOUSEHOLD_RELATIONS } from "@yonetim/contracts";

import { apiDelete, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  okState,
  optionalText,
  reasonMessage,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

const idOnly = z.object({ id: z.string().uuid() });

export async function addHouseholdMember(_p: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    {
      permission: "resident:write",
      schema: z.object({
        unitId: uuidField,
        fullName: requiredText(2, 120),
        relation: z.enum(HOUSEHOLD_RELATIONS, { errorMap: () => ({ message: V.invalidSelection }) }),
        // Boş bırakılabilir: `intField` boşu "zorunlu" sayar, burada sayma.
        birthYear: z.preprocess(
          (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
          z.number({ invalid_type_error: V.invalidAmount }).int().min(1900, V.minValue(1900)).max(2100, V.maxValue(2100)).optional(),
        ),
        phone: optionalText(20),
      }),
      meta: { action: "household_member_added", resource: "unit" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.units.extras");
      await apiPost(
        `/v1/panel/units/${input.unitId}/household`,
        { fullName: input.fullName, relation: input.relation, birthYear: input.birthYear ?? null, phone: input.phone ?? null },
        idOnly,
      );
      return okState(t("memberAdded"));
    },
  );
}

export async function addVehicle(_p: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    {
      permission: "unit:write",
      schema: z.object({
        unitId: uuidField,
        plate: requiredText(4, 16),
        description: optionalText(120),
        ownerName: optionalText(120),
      }),
      meta: { action: "vehicle_added", resource: "unit" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.units.extras");
      await apiPost(
        `/v1/panel/units/${input.unitId}/vehicles`,
        { plate: input.plate, description: input.description ?? null, ownerName: input.ownerName ?? null },
        idOnly,
      );
      return okState(t("vehicleAdded"));
    },
  );
}

async function del(path: string, permission: "resident:write" | "unit:write", message: string) {
  await requirePermission(permission);
  try {
    await apiDelete(path);
    return { ok: true, message };
  } catch (error) {
    const reason = await reasonMessage(error);
    if (reason) return { ok: false, message: reason };
    throw error;
  }
}

export async function removeHouseholdMember(unitId: string, id: string) {
  const t = await getTranslations("app.units.extras");
  return del(`/v1/panel/units/${unitId}/household/${id}`, "resident:write", t("memberRemoved"));
}

export async function removeVehicle(unitId: string, id: string) {
  const t = await getTranslations("app.units.extras");
  return del(`/v1/panel/units/${unitId}/vehicles/${id}`, "unit:write", t("vehicleRemoved"));
}
