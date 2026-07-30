"use client";

import { useTranslations } from "next-intl";

import { Input } from "@yonetim/ui";

import { ActionForm, FormField, SubmitButton } from "@/components/form/action-form";
import { changeMyPassword } from "./actions";

/**
 * Parola belirleme / değiştirme.
 *
 * TELEFON DEĞİŞTİRMEDEN FARKLI OLARAK KUTU AÇIK BAŞLIYOR: giriş artık parola
 * soruyor ve parolası olmayan kullanıcılar (davetle açılmış hesaplar, kurtarma
 * akışıyla girenler) var. Katlanmış bir form, tam da bu kullanıcıların
 * göremeyeceği bir yere koyardı.
 *
 * MEVCUT PAROLA `required` DEĞİL: parolası olmayan kullanıcı ilk parolasını
 * belirlerken dolduracağı bir eski parolası yok. Parolası olanda zorunluluğu
 * sunucu uyguluyor — ekranın "parolanız var mı" sorusunu ayrıca sorması
 * gerekmiyor.
 */
export function PasswordChange() {
  const t = useTranslations("app.myProfile");

  return (
    <ActionForm
      action={changeMyPassword}
      submitLabel={t("savePassword")}
      // Başarıda alanlar temizleniyor: ekranda duran bir parola, omuz üstünden
      // bakan biri için gereksiz bir açıklık.
      resetOnSuccess
      footer={
        <div className="mt-3">
          <SubmitButton label={t("savePassword")} />
        </div>
      }
    >
      <FormField name="currentPassword" label={t("currentPassword")} hint={t("passwordHint")}>
        <Input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          maxLength={200}
        />
      </FormField>

      <FormField name="password" label={t("newPassword")} hint={t("newPasswordHint")}>
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={200}
          required
        />
      </FormField>
    </ActionForm>
  );
}
