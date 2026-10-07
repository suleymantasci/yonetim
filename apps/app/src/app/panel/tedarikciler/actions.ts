"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { vendorSaveResult } from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import {
  checkboxField,
  okState,
  optionalText,
  requiredText,
  runAction,
  uuidField,
  type ActionState,
} from "@/lib/form";

/** Tedarikçi kartı yazma köprüsü. Cari ekstre giderlerden türetiliyor (API). */
const vendorSchema = z.object({
  id: z.preprocess((v) => (v === "" || v === null ? undefined : v), uuidField.optional()),
  name: requiredText(2, 160),
  category: requiredText(2, 60),
  contactName: optionalText(120),
  phone: optionalText(20),
  email: optionalText(200),
  taxNumber: optionalText(11),
  taxOffice: optionalText(80),
  iban: optionalText(40),
  address: optionalText(500),
  notes: optionalText(2000),
  isActive: checkboxField,
});

export async function saveVendor(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "vendor:write",
      schema: vendorSchema,
      meta: { action: "vendor_saved", resource: "vendor" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.vendors");
      const { id, ...body } = input;
      const payload = {
        ...body,
        contactName: body.contactName ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        taxNumber: body.taxNumber ?? null,
        taxOffice: body.taxOffice ?? null,
        iban: body.iban ?? null,
        address: body.address ?? null,
        notes: body.notes ?? null,
      };
      const result = id
        ? await apiPatch(`/v1/panel/vendors/${id}`, payload, vendorSaveResult)
        : await apiPost("/v1/panel/vendors", payload, vendorSaveResult);
      return okState(t("saved", { name: result.name }), {
        data: { id: result.id },
        redirectTo: id ? undefined : `/panel/tedarikciler/${result.id}`,
      });
    },
  );
}

const idSchema = z.object({ id: uuidField });

export async function linkVendorExpenses(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "vendor:write",
      schema: idSchema,
      meta: { action: "vendor_expenses_linked", resource: "vendor" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.vendors");
      const result = (await apiPost(`/v1/panel/vendors/${input.id}/link-expenses`, {})) as {
        linked: number;
      };
      return okState(t("linked", { count: result.linked }));
    },
  );
}

export async function removeVendor(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "vendor:write",
      schema: idSchema,
      meta: { action: "vendor_deleted", resource: "vendor" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.vendors");
      await apiDelete(`/v1/panel/vendors/${input.id}`);
      return okState(t("deleted"), { redirectTo: "/panel/tedarikciler" });
    },
  );
}
