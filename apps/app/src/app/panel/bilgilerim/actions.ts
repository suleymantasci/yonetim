"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { AppError } from "@yonetim/core";

import { apiPatch, apiPost } from "@/lib/api/server";
import {
  ActionError,
  emailField,
  okState,
  optionalText,
  phoneField,
  requiredText,
  runAction,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * "Bilgilerim" güncelleme.
 *
 * TELEFON BU FORMDA YOK ve bilinçli: numara oturum kimliğinin kendisi (giriş
 * kodu oraya gidiyor). Doğrulamasız değiştirilebilseydi hesabı başka bir
 * numaraya taşımak, yani devralmak mümkün olurdu. Değişiklik aşağıdaki
 * `startPhoneChange` / `confirmPhoneChange` akışında, kod doğrulamasıyla.
 */
const schema = z.object({
  firstName: requiredText(1, 80),
  lastName: requiredText(1, 80),
  email: emailField,
  emergencyContactName: optionalText(120),
  // Acil durumda **aranacak** numara: biçim doğrulaması burada da geçerli,
  // yanlış yazılmış bir numara tam da gerektiği anda işe yaramaz.
  emergencyContactPhone: phoneField,
});

export async function updateMyProfile(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "unit:read",
      schema,
      meta: { action: "portal_profile_updated", resource: "user" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.myProfile");

      await apiPatch(
        "/v1/panel/portal/profile",
        {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email ?? null,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
        },
        z.object({ ok: z.literal(true) }),
      );

      return okState(t("saved"));
    },
  );
}

/* ------------------------------------------------------------- parola */

/**
 * Parola belirleme / değiştirme.
 *
 * MEVCUT PAROLA İSTEĞE BAĞLI: parolası hiç olmayan kullanıcı (davetle açılmış
 * hesap, kurtarma akışıyla girmiş kullanıcı) ilk parolasını burada belirliyor.
 * Parolası olanda zorunluluğu **sunucu** uyguluyor; kural burada da olsaydı,
 * "parolası var mı" sorusunun cevabını panelin ayrıca öğrenmesi gerekirdi.
 *
 * Güç kuralı da sunucuda: kopyası burada dursaydı ikisinden biri geride kalır
 * ve kullanıcı formu geçip sunucuda reddedilirdi.
 */
const passwordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  password: z.string().min(10, V.min(10)).max(200, V.max(200)),
});

export async function changeMyPassword(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "unit:read",
      schema: passwordSchema,
      meta: { action: "portal_password_changed", resource: "user" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.myProfile");

      try {
        await apiPost(
          "/v1/panel/portal/profile/password",
          {
            // Boş alan gönderilmiyor: sunucu "mevcut parola verilmedi" ile
            // "boş string verildi" arasında ayrım yapmak zorunda kalmasın.
            ...(input.currentPassword ? { currentPassword: input.currentPassword } : {}),
            password: input.password,
          },
          z.object({ ok: z.literal(true) }),
        );
      } catch (error) {
        if (error instanceof AppError && error.code === "validation") {
          if (error.message === "current_password_invalid") {
            throw new ActionError(t("currentPasswordInvalid"));
          }
          if (error.message === "weak_password") {
            throw new ActionError(t("weakPassword"));
          }
        }
        throw error;
      }

      return okState(t("passwordSaved"));
    },
  );
}

/* --------------------------------------------------- telefon değişikliği */

/**
 * Numara değişikliği iki adım: kod iste → kodu doğrula.
 *
 * Kural sunucuda: kodun **yeni** numaraya gitmesi, tek kullanımlık olması,
 * amacının giriş OTP'sinden ayrı olması ve numaranın platform genelinde tekil
 * olması `apps/api`'de. Burada yalnız form doğrulaması, HTTP ve hata
 * kodlarının okunabilir metne çevrilmesi var.
 */
// `phoneField` isteğe bağlı; burada zorunlu: numarasız bir "kod gönder"
// isteği anlamsız.
const requiredPhone = phoneField.refine((v): v is string => Boolean(v), {
  message: V.required,
});

const phoneStartSchema = z.object({ phone: requiredPhone });

const phoneVerifySchema = z.object({
  phone: requiredPhone,
  // Kodun kendisi sunucuda doğrulanıyor; buradaki tek iş, boş ya da harf
  // içeren bir gönderim için ağ turu harcamamak.
  code: z.string().trim().regex(/^\d{4,10}$/, V.invalidSelection),
});

export async function startPhoneChange(
  _previous: ActionState<{ phone: string }>,
  formData: FormData,
): Promise<ActionState<{ phone: string }>> {
  return runAction(
    {
      permission: "unit:read",
      schema: phoneStartSchema,
      meta: { action: "portal_phone_change_requested", resource: "user" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.myProfile");

      await callPhoneEndpoint("/v1/panel/portal/profile/phone", {
        phone: input.phone,
      }, {
        phone_taken: t("phoneTaken"),
        phone_unchanged: t("phoneUnchanged"),
        invalid_code: t("phoneCodeInvalid"),
      });

      /*
       * Numara **durumda** taşınıyor, gizli alanda değil: ikinci adımda
       * doğrulanacak numaranın, kodun gittiği numara olduğundan emin olmak
       * gerekiyor. Kullanıcı arada alanı değiştirse bile sunucu yine kodun
       * kimliğine bakıyor; bu yalnız ekranın tutarlılığı için.
       */
      return okState(t("phoneCodeSent", { phone: input.phone }), {
        data: { phone: input.phone },
      });
    },
  );
}

export async function confirmPhoneChange(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "unit:read",
      schema: phoneVerifySchema,
      meta: { action: "portal_phone_change_completed", resource: "user" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.myProfile");

      await callPhoneEndpoint("/v1/panel/portal/profile/phone/verify", {
        phone: input.phone,
        code: input.code,
      }, {
        phone_taken: t("phoneTaken"),
        phone_unchanged: t("phoneUnchanged"),
        invalid_code: t("phoneCodeInvalid"),
      });

      return okState(t("phoneChanged"));
    },
  );
}

/**
 * Sunucunun hata **kodunu** kullanıcının okuyabileceği metne çevirir.
 *
 * Ham mesaj (`phone_taken`, `invalid_code:expired`) doğrudan gösterilseydi
 * ekranda bir hata kodu belirirdi. Tanınmayan kod olduğu gibi geçiyor: bilmediğimiz
 * bir hatayı "bir şeyler ters gitti" diye yutmak, kullanıcıyı da bizi de bilgisiz
 * bırakırdı.
 */
async function callPhoneEndpoint(
  path: string,
  body: Record<string, unknown>,
  messages: Record<string, string>,
): Promise<void> {
  try {
    await apiPost(path, body, z.object({}).passthrough());
  } catch (error) {
    if (error instanceof AppError) {
      // `invalid_code:expired` gibi ayrıntılı kodların önekine bakılıyor:
      // sebebi ("süresi doldu" / "kullanıldı") kullanıcıya söylemenin tek
      // faydası yeni kod istemesi, ki mesaj zaten onu söylüyor.
      const message = messages[error.message.split(":")[0] ?? ""];
      if (message) throw new ActionError(message);
    }
    throw error;
  }
}
