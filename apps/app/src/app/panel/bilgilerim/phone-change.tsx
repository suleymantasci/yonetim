"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Alert, Input } from "@yonetim/ui";

import { ActionForm, FormField, SubmitButton } from "@/components/form/action-form";
import { confirmPhoneChange, startPhoneChange } from "./actions";

/**
 * Telefon değiştirme — iki adımlı.
 *
 * KUTU KAPALI BAŞLIYOR: numara değiştirmek nadir bir iş. Her zaman açık duran
 * bir "telefonunuzu değiştirin" formu, bilgilerini gözden geçirmeye gelen
 * kullanıcıya yapması gereken bir şey varmış izlenimi verirdi.
 *
 * İKİNCİ ADIM ANCAK KOD GİDİNCE AÇILIYOR: kod alanını baştan göstermek,
 * kullanıcıyı henüz gönderilmemiş bir kodu beklemeye iterdi. Adım, sunucudan
 * dönen **başarılı** cevapla ilerliyor (`onSuccess`) — istemcinin kendi
 * kararıyla değil.
 */
export function PhoneChange({ currentPhoneMasked }: { currentPhoneMasked: string | null }) {
  const t = useTranslations("app.myProfile");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
      >
        {t("changePhone")}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <Alert tone="info">{t("changePhoneHint")}</Alert>

      {sentTo === null ? (
        <ActionForm
          action={startPhoneChange}
          submitLabel={t("sendCode")}
          onSuccess={(state) => setSentTo(state.data?.phone ?? null)}
          footer={
            <div className="mt-3 flex flex-wrap gap-2">
              <SubmitButton label={t("sendCode")} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
              >
                {tCommon("action.cancel")}
              </button>
            </div>
          }
        >
          <FormField
            name="phone"
            label={t("newPhone")}
            hint={t("newPhoneHint", { current: currentPhoneMasked ?? "—" })}
          >
            <Input name="phone" type="tel" autoComplete="tel" maxLength={20} required />
          </FormField>
        </ActionForm>
      ) : (
        <ActionForm
          action={confirmPhoneChange}
          submitLabel={t("verifyCode")}
          onSuccess={() => {
            setSentTo(null);
            setOpen(false);
          }}
          footer={
            <div className="mt-3 flex flex-wrap gap-2">
              <SubmitButton label={t("verifyCode")} />
              <button
                type="button"
                // "Numarayı düzelt": yanlış numaraya kod gönderildiyse tek
                // çıkış yolu bu. Olmasaydı kullanıcı sayfayı yenilemek
                // zorunda kalırdı.
                onClick={() => setSentTo(null)}
                className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
              >
                {t("changeNumber")}
              </button>
            </div>
          }
        >
          {/* Doğrulanan numara, kodun gittiği numara: kullanıcı ikinci adımda
              başka bir numara yazamıyor. Sunucu zaten kodu kime verdiğine
              bakıyor; bu, ekranın o kuralla aynı şeyi söylemesi. */}
          <input type="hidden" name="phone" value={sentTo} />

          <FormField name="code" label={t("code")} hint={t("codeHint", { phone: sentTo })}>
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              required
            />
          </FormField>
        </ActionForm>
      )}
    </div>
  );
}
