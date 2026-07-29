"use client";

import { useTranslations } from "next-intl";

import { ActionForm } from "@/components/form/action-form";
import { castVote } from "./actions";

/**
 * Oy pusulası.
 *
 * TEK SEÇİMDE RADIO, ÇOKLUDA CHECKBOX — kozmetik değil: radio grubu tarayıcı
 * düzeyinde ikinci seçimi engelliyor, checkbox engellemiyor. Yanlış olanı
 * kullanmak, sunucunun reddedeceği bir pusulayı doldurtup kullanıcıyı hata
 * mesajıyla karşılamak olurdu. Sunucu yine de sayıyı doğruluyor; bu bir
 * kolaylık, kural değil.
 *
 * Oy **geri alınamıyor**: onay metni bunu açıkça söylüyor. Sessizce
 * değiştirilebilir bir oy, kapanmış bir oylamanın sonucunu tartışmaya açardı.
 */
export function VoteForm({
  pollId,
  options,
  allowMultiple,
  submitLabel,
  hint,
}: {
  pollId: string;
  options: { id: string; label: string }[];
  allowMultiple: boolean;
  submitLabel: string;
  hint: string;
}) {
  const t = useTranslations("app.myPolls");

  return (
    <ActionForm action={castVote} submitLabel={submitLabel}>
      <input type="hidden" name="pollId" value={pollId} />

      <fieldset className="sm:col-span-2 space-y-2">
        <legend className="sr-only">{t("chooseOption")}</legend>
        {options.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border p-3 text-sm hover:bg-hover"
          >
            <input
              type={allowMultiple ? "checkbox" : "radio"}
              name="optionIds"
              value={option.id}
              required={!allowMultiple}
            />
            <span className="text-fg">{option.label}</span>
          </label>
        ))}
      </fieldset>

      <p className="sm:col-span-2 text-xs text-fg-subtle">{hint}</p>
    </ActionForm>
  );
}
