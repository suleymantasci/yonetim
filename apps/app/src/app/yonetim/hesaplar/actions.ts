"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  impersonateResult,
  platformActionResult,
  subscriptionAssignResult,
  subscriptionQuote,
  tenantLifecycleResult,
  type SubscriptionQuote,
} from "@yonetim/contracts";
import { AppError } from "@yonetim/core";

import { apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { beginImpersonation } from "@/lib/impersonation-cookie";
import {
  checkboxField,
  dateField,
  intField,
  kurusField,
  okState,
  optionalDateField,
  requiredText,
  runAction,
  uuidField,
  type ActionState,
} from "@/lib/form";

/**
 * Süper-admin hesap aksiyonları — SPEC Bölüm 18.1.
 *
 * HEPSİNDE GEREKÇE ZORUNLU (en az 10 karakter, sözleşmedeki `changeReason` ile
 * aynı eşik). Bu ekrandaki her düğme başkasının hesabına dokunuyor: süre
 * uzatmak, dondurmak, kapatmak, kimliğine bürünmek. Aylar sonra "bu neden
 * yapıldı" sorusunu soracak olan kişiye (denetçi, yeni gelen destek personeli,
 * müşterinin kendisi) bırakılacak tek iz gerekçe alanı. Kolaylık için
 * gevşetilmesi, denetim kütüğünü içi boş satırlar dizisine çevirirdi.
 *
 * İZİN SEÇİMİ UÇLARLA AYNI: `runAction`'a verilen izin, API tarafındaki
 * `@RequirePermission` ile birebir. Panel tarafı yalnız görünürlük kapısı
 * (ekranı açıp boş sayfa görmeyi engelliyor); gerçek kapı uçta ve `support_agent`
 * ile `super_admin` ayrımı orada yapılıyor.
 */

const REASON_MIN = 10;
const REASON_MAX = 500;

const extendSchema = z.object({
  tenantId: uuidField,
  days: intField({ min: 1, max: 730 }),
  reason: requiredText(REASON_MIN, REASON_MAX),
});

export async function extendSubscription(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("app.platformAccounts");

  return runAction(
    {
      permission: "admin:billing",
      schema: extendSchema,
      meta: { action: "platform_extend_subscription", resource: "subscription" },
    },
    formData,
    async ({ input }) => {
      await apiPost(
        "/v1/panel/platform/subscriptions/extend",
        input,
        platformActionResult,
        { reason: input.reason },
      );
      return okState(t("extendDone", { days: input.days }));
    },
  );
}

const accountActionSchema = z.object({
  accountKey: requiredText(3, 80),
  action: z.enum(["freeze", "activate", "close"]),
  reason: requiredText(REASON_MIN, REASON_MAX),
});

export async function runAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("app.platformAccounts");

  return runAction(
    {
      permission: "admin:tenants",
      schema: accountActionSchema,
      meta: { action: "platform_account_action", resource: "tenant" },
    },
    formData,
    async ({ input }) => {
      const result = await apiPost(
        "/v1/panel/platform/accounts/action",
        input,
        platformActionResult,
        { reason: input.reason },
      );
      return okState(
        t(`accountActionDone.${input.action}`, { count: result.affected }),
      );
    },
  );
}

const tenantActionSchema = z.object({
  tenantId: uuidField,
  /**
   * Aksiyon adı formdan geliyor ama uç adı **buradan** türüyor: kullanıcı
   * girdisini yol parçası olarak kullanmak, gövdeye `../` benzeri bir değer
   * koyarak başka uçlara ulaşma denemesine kapı açardı.
   */
  action: z.enum(["archive", "restore", "purge"]),
  reason: requiredText(REASON_MIN, REASON_MAX),
});

const TENANT_ACTION_PATH = {
  archive: "/v1/panel/platform/tenants/archive",
  restore: "/v1/panel/platform/tenants/restore",
  purge: "/v1/panel/platform/tenants/purge",
} as const;

export async function runTenantAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("app.platformAccounts");

  return runAction(
    {
      // Arşivleme/geri açma `admin:tenants` ister; kalıcı silme uçta ayrıca
      // `tenant:delete` istiyor ve orada reddediliyor. Panel tarafında en
      // gevşek izni beklemek yeterli — sert kapı uçta.
      permission: "admin:tenants",
      schema: tenantActionSchema,
      meta: { action: "platform_tenant_action", resource: "tenant" },
    },
    formData,
    async ({ input }) => {
      await apiPost(
        TENANT_ACTION_PATH[input.action],
        { tenantId: input.tenantId, reason: input.reason },
        tenantLifecycleResult,
        { reason: input.reason },
      );
      return okState(t(`tenantActionDone.${input.action}`));
    },
  );
}

const addonSchema = z.object({
  tenantId: uuidField,
  kind: z.enum(["sms", "whatsapp"]),
  quantity: intField({ min: 1, max: 1_000_000 }),
  totalPriceMinor: kurusField({ min: 0 }),
  validUntil: optionalDateField,
  reason: requiredText(REASON_MIN, REASON_MAX),
});

export async function grantAddon(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("app.platformAccounts");

  return runAction(
    {
      permission: "admin:billing",
      schema: addonSchema,
      meta: { action: "platform_grant_addon", resource: "tenant_addon" },
    },
    formData,
    async ({ input }) => {
      await apiPost(
        "/v1/panel/platform/addons/grant",
        { ...input, validUntil: input.validUntil ?? null },
        platformActionResult,
        { reason: input.reason },
      );
      return okState(t("addonDone", { count: input.quantity }));
    },
  );
}

const impersonateSchema = z.object({
  userId: uuidField,
  tenantId: uuidField,
  reason: requiredText(REASON_MIN, REASON_MAX),
});

/**
 * Hesaba geçiş.
 *
 * `redirect()` `runAction` **dışında**: Next'in `redirect()`'i bir istisna
 * fırlatarak çalışıyor ve `runAction`'ın `catch` bloğu onu bir aksiyon hatası
 * sanıp "beklenmeyen hata" mesajına çevirirdi — geçiş başarılı olduğu hâlde
 * kullanıcı hata görürdü. Bu yüzden aksiyon önce jetonu alıp çerezi kuruyor,
 * yönlendirme en sonda ve sarmalayıcının dışında.
 */
export async function startImpersonation(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("app.platformAccounts");

  const state = await runAction(
    {
      permission: "admin:impersonate",
      schema: impersonateSchema,
      meta: { action: "platform_impersonate", resource: "user" },
    },
    formData,
    async ({ input }) => {
      const result = await apiPost(
        "/v1/panel/platform/impersonate",
        input,
        impersonateResult,
        { reason: input.reason },
      );
      await beginImpersonation({
        targetToken: result.token,
        targetExpiresAt: result.expiresAt,
      });
      return okState(t("impersonateDone", { name: result.targetUserName }));
    },
  );

  if (state.status === "ok") redirect("/panel");
  return state;
}

/* ------------------------------------------------------------------ *
 * Paket atama (manuel) — önizleme + kayıt
 * ------------------------------------------------------------------ */

const periodEnum = z.enum(["yearly", "semiannual", "quarterly", "monthly"]);

export interface QuoteInput {
  tenantId: string;
  planId: string;
  period: z.infer<typeof periodEnum>;
  periodCount: number;
  discount:
    | { kind: "none" }
    | { kind: "promo"; code: string }
    | { kind: "special"; type: "percent" | "amount"; value: number; note: string };
}

/**
 * Önizleme — istemciden doğrudan çağrılıyor (alan değiştikçe). Kayıt yazmıyor;
 * hata durumunda form bozulmasın diye `null` dönüyor.
 */
export async function quoteSubscription(input: QuoteInput): Promise<SubscriptionQuote | null> {
  await requirePermission("admin:billing");
  try {
    return await apiPost("/v1/panel/platform/subscriptions/quote", input, subscriptionQuote);
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
}

const assignSchema = z
  .object({
    tenantId: uuidField,
    planId: uuidField,
    period: periodEnum,
    periodCount: intField({ min: 1, max: 36 }),
    discountKind: z.enum(["none", "promo", "special"]),
    promoCode: z.string().trim().optional(),
    specialType: z.enum(["percent", "amount"]).optional(),
    specialValue: z.preprocess((v) => (v === "" || v === undefined ? undefined : String(v).replace(",", ".")), z.coerce.number().positive().optional()),
    specialNote: z.string().trim().optional(),
    startsAt: dateField,
    markPaid: checkboxField,
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.discountKind === "promo" && !(v.promoCode && v.promoCode.length >= 3))
      ctx.addIssue({ code: "custom", path: ["promoCode"], message: "required" });
    if (v.discountKind === "special") {
      if (!v.specialValue) ctx.addIssue({ code: "custom", path: ["specialValue"], message: "required" });
      if (!v.specialNote || v.specialNote.length < 10)
        ctx.addIssue({ code: "custom", path: ["specialNote"], message: "min10" });
    }
  });

export async function assignSubscription(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "admin:billing", schema: assignSchema, meta: { action: "subscription_assigned", resource: "subscription" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.platformAccounts");
      const discount =
        input.discountKind === "promo"
          ? { kind: "promo" as const, code: input.promoCode!.toUpperCase() }
          : input.discountKind === "special"
            ? { kind: "special" as const, type: input.specialType ?? "percent", value: input.specialValue!, note: input.specialNote! }
            : { kind: "none" as const };
      const result = await apiPost(
        "/v1/panel/platform/subscriptions/assign",
        {
          tenantId: input.tenantId,
          planId: input.planId,
          period: input.period,
          periodCount: input.periodCount,
          discount,
          startsAt: input.startsAt,
          markPaid: input.markPaid,
          note: input.note || undefined,
        },
        subscriptionAssignResult,
      );
      return okState(t("assignDone", { invoice: result.invoiceNo }));
    },
  );
}

