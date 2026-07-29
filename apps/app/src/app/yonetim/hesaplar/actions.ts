"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  impersonateResult,
  platformActionResult,
  tenantLifecycleResult,
} from "@yonetim/contracts";

import { apiPost } from "@/lib/api/server";
import { beginImpersonation } from "@/lib/impersonation-cookie";
import {
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
      revalidatePath("/yonetim/hesaplar", "layout");
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
      revalidatePath("/yonetim/hesaplar", "layout");
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
      revalidatePath("/yonetim/hesaplar", "layout");
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
      revalidatePath("/yonetim/hesaplar", "layout");
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
