"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Alert,
  DateInput,
  FormSection,
  Input,
  Select,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveMeeting } from "./actions";

const KINDS = ["ordinary", "extraordinary"] as const;
const STATUSES = ["planned", "held", "cancelled", "postponed"] as const;

export interface MeetingFormDefaults {
  id: string;
  title: string;
  kind: string;
  scheduledAt: string;
  secondCallAt: string | null;
  location: string | null;
  onlineUrl: string | null;
  agenda: string[];
  status: string;
  minutesUrl: string | null;
}

/**
 * Toplantı formu.
 *
 * İKİNCİ ÇAĞRI TARİHİ **OTOMATİK DOLDURULMUYOR**. KMK md.30 ilk toplantıda
 * yeter sayı sağlanamazsa ikinci toplantıyı en erken yedi gün sonra
 * öngörüyor; kanuni asgariyi bir varsayılan olarak doldurmak, yöneticinin
 * bilinçli bir tarih seçmesi gereken yerde sayıyı sorgusuz kabul etmesine yol
 * açardı. Ekran kuralı yazıyor, tarihi kullanıcı giriyor.
 *
 * GÜNDEM SIRASI KORUNUYOR: maddeler tutanakta bu sırayla numaralanacak.
 */
export function MeetingForm({
  defaults,
  cancelHref,
  submitLabel,
  stayOnSuccess,
  onSaved,
  onCreated,
  layout,
  onCancel,
}: {
  defaults?: MeetingFormDefaults;
  cancelHref?: string;
  submitLabel: string;
  stayOnSuccess?: boolean;
  onSaved?: () => void;
  onCreated?: (id: string) => void;
  layout?: "page" | "modal";
  onCancel?: () => void;
}) {
  const t = useTranslations("app.meetings");
  const tEnum = useTranslations("enum");

  const [agenda, setAgenda] = useState<string[]>(
    defaults?.agenda.length ? defaults.agenda : [""],
  );

  return (
    <ActionForm
      action={saveMeeting}
      submitLabel={submitLabel}
      cancelHref={cancelHref}
      stayOnSuccess={stayOnSuccess}
      layout={layout}
      onCancel={onCancel}
      onSuccess={(state) => {
        if (state.data?.id) onCreated?.(state.data.id);
        onSaved?.();
      }}
    >
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <FormSection title={t("basicsSection")} description={t("basicsSectionHint")}>
        <div className="sm:col-span-2">
          <FormField name="title" label={t("titleField")} required>
            <Input
              name="title"
              defaultValue={defaults?.title}
              required
              minLength={3}
              maxLength={200}
              placeholder={t("titlePlaceholder")}
            />
          </FormField>
        </div>

        <FormField name="kind" label={t("kind")} required>
          <Select
            name="kind"
            defaultValue={defaults?.kind ?? "ordinary"}
            required
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {tEnum(`meetingKind.${kind}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField name="status" label={t("status")} required>
          <Select
            name="status"
            defaultValue={defaults?.status ?? "planned"}
            required
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {tEnum(`meetingStatus.${status}`)}
              </option>
            ))}
          </Select>
        </FormField>
      </FormSection>

      <FormSection title={t("whenSection")} description={t("whenSectionHint")}>
        <FormField name="scheduledAt" label={t("scheduledAt")} required>
          <DateInput
            name="scheduledAt"
            defaultValue={defaults?.scheduledAt ?? today()}
            required
          />
        </FormField>

        <FormField
          name="secondCallAt"
          label={t("secondCallAt")}
          hint={t("secondCallAtHint")}
        >
          <DateInput
            name="secondCallAt"
            defaultValue={defaults?.secondCallAt ?? ""}
          />
        </FormField>

        <div className="sm:col-span-2">
          <Alert tone="info">{t("secondCallNotice")}</Alert>
        </div>

        <FormField name="location" label={t("location")}>
          <Input
            name="location"
            defaultValue={defaults?.location ?? ""}
            maxLength={200}
            placeholder={t("locationPlaceholder")}
          />
        </FormField>

        <FormField
          name="onlineUrl"
          label={t("onlineUrl")}
          hint={t("onlineUrlHint")}
        >
          <Input
            name="onlineUrl"
            type="url"
            defaultValue={defaults?.onlineUrl ?? ""}
            maxLength={500}
            placeholder="https://…"
          />
        </FormField>
      </FormSection>

      <FormSection
        title={t("agendaSection")}
        description={t("agendaSectionHint")}
        columns={1}
      >
        <div className="space-y-2">
          {agenda.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-sm tabular-nums text-fg-subtle">
                {index + 1}.
              </span>
              <Input
                name="agendaItem"
                value={value}
                onChange={(event) => {
                  const next = [...agenda];
                  next[index] = event.target.value;
                  setAgenda(next);
                }}
                maxLength={500}
                aria-label={t("agendaItemLabel", { index: index + 1 })}
              />
              {agenda.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setAgenda(agenda.filter((_, i) => i !== index))}
                  aria-label={t("removeAgendaItem", { index: index + 1 })}
                  className="rounded p-2 text-fg-subtle hover:bg-hover hover:text-fg"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setAgenda([...agenda, ""])}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg hover:bg-hover"
          >
            <Plus aria-hidden className="h-4 w-4" />
            {t("addAgendaItem")}
          </button>
        </div>
      </FormSection>

      <FormSection
        title={t("minutesSection")}
        description={t("minutesSectionHint")}
        columns={1}
      >
        <FormField name="minutesUrl" label={t("minutesUrl")}>
          <Input
            name="minutesUrl"
            type="url"
            defaultValue={defaults?.minutesUrl ?? ""}
            maxLength={500}
            placeholder="https://…"
          />
        </FormField>
      </FormSection>
    </ActionForm>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
