"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert, FormSection, Select, Textarea } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { sendMessage } from "./actions";

const CHANNELS = ["whatsapp", "sms", "in_app"] as const;

/**
 * Tek kişiye mesaj formu.
 *
 * WHATSAPP'IN 24 SAATLİK SERVİS PENCERESİ ekranda açıkça anlatılıyor: sakin
 * son 24 saat içinde yazmadıysa serbest metin gönderilemiyor (Meta kuralı) ve
 * mesaj gönderilmiyor. Bunu gizleyip "gönderildi" demek, yöneticiye
 * ulaşmadığı bir mesajı ulaşmış sanmasına yol açardı — bu ekranın verebileceği
 * en pahalı yanlış bilgi.
 *
 * Alternatif kanal seçimi bu yüzden formda: pencere kapalıysa SMS gerçek bir
 * seçenek.
 */
export function MessageForm({
  residents,
  submitLabel,
  layout,
  onCancel,
  onSent,
}: {
  residents: { id: string; name: string }[];
  submitLabel: string;
  layout?: "page" | "modal";
  onCancel?: () => void;
  onSent?: () => void;
}) {
  const t = useTranslations("app.messages");
  const tEnum = useTranslations("enum");

  const [channel, setChannel] = useState<string>("whatsapp");

  return (
    <ActionForm
      action={sendMessage}
      submitLabel={submitLabel}
      stayOnSuccess
      layout={layout}
      onCancel={onCancel}
      onSuccess={onSent}
    >
      <FormSection title={t("composeSection")} description={t("composeSectionHint")}>
        <FormField name="userId" label={t("recipient")} required>
          <Select name="userId" defaultValue="" required>
            <option value="">{t("recipientPlaceholder")}</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField name="channel" label={t("channel")} required>
          <Select
            name="channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            required
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {tEnum(`channel.${c}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="sm:col-span-2">
          <Alert tone={channel === "whatsapp" ? "warning" : "info"}>
            {t(`channelNotice.${channel}`)}
          </Alert>
        </div>

        <div className="sm:col-span-2">
          <FormField name="body" label={t("body")} required>
            <Textarea
              name="body"
              rows={5}
              required
              maxLength={4000}
              placeholder={t("bodyPlaceholder")}
            />
          </FormField>
        </div>
      </FormSection>
    </ActionForm>
  );
}
