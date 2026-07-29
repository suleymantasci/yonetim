"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiPatch } from "@/lib/api/server";
import {
  checkboxField,
  decimalField,
  emailField,
  intField,
  okState,
  optionalText,
  requiredText,
  runAction,
  type ActionState,
} from "@/lib/form";

/**
 * Site ayarları yazma köprüsü — PROJE-DURUMU §5.2, sıra 8.
 *
 * `settings:write` yetkisi tanımlıydı ve hiçbir uçta kullanılmıyordu: ekran
 * görüntüleniyor ama hiçbir alan değiştirilemiyordu.
 *
 * `slug`, daire sayısı ve abonelik alanları burada **yok** — gerekçeleri
 * sözleşmede yazılı; ilki basılmış bağlantıları kırar, ikincisi `units`
 * tablosundan türeyen bir sayı, üçüncüsü faturalandırmanın sonucu.
 */
const settingsSchema = z.object({
  name: requiredText(2, 200),
  city: optionalText(60),
  district: optionalText(60),
  neighborhood: optionalText(120),
  addressLine: optionalText(500),
  postalCode: optionalText(10),

  duesDueDayOfMonth: intField({ min: 1, max: 28 }),
  lateFeeEnabled: checkboxField,
  // Üst sınır 5: KMK md.20 aylık %5'i aşan gecikme tazminatına izin vermiyor.
  lateFeeMonthlyPct: decimalField({ min: 0, max: 5 }),

  kvkkContactEmail: emailField,

  invoiceTitle: optionalText(200),
  invoiceTaxNumber: optionalText(11),
  invoiceTaxOffice: optionalText(100),
  invoiceAddress: optionalText(500),

  whatsappOptInRequired: checkboxField,
  onlinePaymentEnabled: checkboxField,
  paymentFeePaidBy: z.enum(["management", "resident"]).default("management"),
});

export async function saveSettings(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "settings:write",
      schema: settingsSchema,
      meta: { action: "settings_updated", resource: "tenant" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.settings");

      const result = await apiPatch(
        "/v1/panel/settings",
        {
          name: input.name,
          city: input.city ?? null,
          district: input.district ?? null,
          neighborhood: input.neighborhood ?? null,
          addressLine: input.addressLine ?? null,
          postalCode: input.postalCode ?? null,
          duesDueDayOfMonth: input.duesDueDayOfMonth,
          lateFeeEnabled: input.lateFeeEnabled,
          lateFeeMonthlyPct: input.lateFeeMonthlyPct ?? null,
          kvkkContactEmail: input.kvkkContactEmail ?? null,
          invoiceTitle: input.invoiceTitle ?? null,
          invoiceTaxNumber: input.invoiceTaxNumber ?? null,
          invoiceTaxOffice: input.invoiceTaxOffice ?? null,
          invoiceAddress: input.invoiceAddress ?? null,
          whatsappOptInRequired: input.whatsappOptInRequired,
          onlinePaymentEnabled: input.onlinePaymentEnabled,
          paymentFeePaidBy: input.paymentFeePaidBy,
        },
        z.object({ id: z.string().uuid() }),
      );

      revalidatePath("/panel/ayarlar");
      // Vade günü ve gecikme oranı borç üretimini besliyor; o ekranların
      // önbelleği de tazelenmeli.
      revalidatePath("/panel/aidat");
      revalidatePath("/panel/borclar");

      return okState(t("saved"), { data: { id: result.id } });
    },
  );
}
