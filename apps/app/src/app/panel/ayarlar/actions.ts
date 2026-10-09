"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { tenantLifecycleResult } from "@yonetim/contracts";

import { apiPatch, apiPost } from "@/lib/api/server";
import {
  checkboxField,
  optionalUuidField,
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
  defaultPaymentMethod: z.enum(["bank_transfer", "cash", "card"]).default("bank_transfer"),
  defaultBankAccountId: optionalUuidField,
  receiptAutoNumber: checkboxField,
  receiptPrefix: optionalText(10),
  receiptNextNo: intField({ min: 1, max: 99_999_999 }),
  receiptFooter: optionalText(300),
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
          defaultPaymentMethod: input.defaultPaymentMethod,
          defaultBankAccountId: input.defaultBankAccountId ?? null,
          receiptAutoNumber: input.receiptAutoNumber,
          receiptPrefix: input.receiptPrefix ?? null,
          receiptNextNo: input.receiptNextNo,
          receiptFooter: input.receiptFooter ?? null,
        },
        z.object({ id: z.string().uuid() }),
      );

      // Vade günü ve gecikme oranı borç üretimini besliyor; o ekranların
      // önbelleği de tazelenmeli.

      return okState(t("saved"), { data: { id: result.id } });
    },
  );
}

/* ------------------------------------------------------------------ *
 * Site yaşam döngüsü — pasife al / geri aç (2026-07-29 kararı)
 * ------------------------------------------------------------------ */

const lifecycleSchema = z.object({
  reason: requiredText(10, 500),
});

/**
 * Siteyi arşive alır.
 *
 * `confirmation` alanı **şemada yok ve olmamalı**: sitenin adını yazdırma
 * istemci tarafında bir yavaşlatıcı, sunucu tarafında bir güvenlik kontrolü
 * değil. Sunucuya taşınsaydı, adı bilen herkesin geçebileceği bir kapı
 * görünümü verirdi; gerçek kapı `tenant:archive` izni ve o RBAC'ta.
 */
export async function archiveTenant(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Değişken adı `t` DEĞİL: bu dosyada iki namespace var (`app.settings` ve
  // `app.settings.lifecycle`) ve ikisini aynı adla açmak, anahtarların hangi
  // sözlükten okunduğunu okuyan için belirsiz yapıyor —
  // `tests/i18n-keys.test.ts` de statik taramada aynı belirsizliğe düşüyor.
  const tLifecycle = await getTranslations("app.settings.lifecycle");

  return runAction(
    {
      permission: "tenant:archive",
      schema: lifecycleSchema,
      meta: { action: "tenant_archive", resource: "tenant" },
    },
    formData,
    async ({ input }) => {
      await apiPost(
        "/v1/panel/tenancy/lifecycle/archive",
        { reason: input.reason },
        tenantLifecycleResult,
        { reason: input.reason },
      );
      // Kabuk site durumunu gösteriyor ve artık salt-okunur rozeti taşıyacak.
      return okState(tLifecycle("archiveDone"));
    },
  );
}

export async function restoreTenant(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Değişken adı `t` DEĞİL: bu dosyada iki namespace var (`app.settings` ve
  // `app.settings.lifecycle`) ve ikisini aynı adla açmak, anahtarların hangi
  // sözlükten okunduğunu okuyan için belirsiz yapıyor —
  // `tests/i18n-keys.test.ts` de statik taramada aynı belirsizliğe düşüyor.
  const tLifecycle = await getTranslations("app.settings.lifecycle");

  return runAction(
    {
      permission: "tenant:archive",
      schema: lifecycleSchema,
      meta: { action: "tenant_restore", resource: "tenant" },
    },
    formData,
    async ({ input }) => {
      await apiPost(
        "/v1/panel/tenancy/lifecycle/restore",
        { reason: input.reason },
        tenantLifecycleResult,
        { reason: input.reason },
      );
      return okState(tLifecycle("restoreDone"));
    },
  );
}
