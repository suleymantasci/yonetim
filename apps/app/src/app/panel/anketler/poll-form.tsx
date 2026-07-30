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
  Switch,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { savePoll } from "./actions";

const WEIGHT_MODES = ["equal", "land_share"] as const;
const VISIBILITIES = ["open", "secret"] as const;
const QUORUM_RULES = [
  "simple_majority",
  "absolute_majority",
  "two_thirds",
  "four_fifths",
  "unanimous",
] as const;

export interface PollFormDefaults {
  id: string;
  question: string;
  description: string | null;
  options: string[];
  weightMode: string;
  quorumRule: string;
  visibility: string;
  allowMultiple: boolean;
  ownersOnly: boolean;
  opensAt: string;
  closesAt: string;
}

/**
 * Anket/oylama formu.
 *
 * KMK VARSAYILANLARI KORUNUYOR: "yalnız malikler oy kullanabilir" **açık**,
 * ağırlık modu **eşit**. Kat Mülkiyeti Kanunu'nda oy hakkı kat malikinindir
 * (md.31) ve her bağımsız bölüm bir oydur; arsa payı ağırlığı ancak yönetim
 * planı öyle diyorsa geçerli. Varsayılanı tersine çevirmek kanunun
 * istisnasını kural haline getirirdi.
 *
 * SEÇENEK SIRASI ÖNEMLİ: düzenlemede aynı sıradaki seçenek aynı kimliği
 * tutuyor (sunucu böyle eşliyor). Bu yüzden araya seçenek eklemek yerine sona
 * eklemek doğru; ekran bunu söylüyor.
 */
export function PollForm({
  defaults,
  cancelHref,
  submitLabel,
  stayOnSuccess,
  onSaved,
  onCreated,
  layout,
  onCancel,
}: {
  defaults?: PollFormDefaults;
  cancelHref?: string;
  submitLabel: string;
  stayOnSuccess?: boolean;
  onSaved?: () => void;
  onCreated?: (id: string) => void;
  layout?: "page" | "modal";
  onCancel?: () => void;
}) {
  const t = useTranslations("app.polls");
  const tEnum = useTranslations("enum");

  const [options, setOptions] = useState<string[]>(
    defaults?.options.length ? defaults.options : ["", ""],
  );
  const [weightMode, setWeightMode] = useState(
    defaults?.weightMode ?? "equal",
  );
  const [quorum, setQuorum] = useState(
    defaults?.quorumRule ?? "simple_majority",
  );

  return (
    <ActionForm
      action={savePoll}
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

      <FormSection
        title={t("questionSection")}
        description={t("questionSectionHint")}
      >
        <div className="sm:col-span-2">
          <FormField name="question" label={t("question")} required>
            <Input
              name="question"
              defaultValue={defaults?.question}
              required
              minLength={5}
              maxLength={500}
              placeholder={t("questionPlaceholder")}
            />
          </FormField>
        </div>

        <div className="sm:col-span-2">
          <FormField
            name="description"
            label={t("descriptionField")}
            hint={t("descriptionFieldHint")}
          >
            <Textarea
              name="description"
              defaultValue={defaults?.description ?? ""}
              rows={3}
              maxLength={4000}
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection
        title={t("optionsSection")}
        description={
          defaults ? t("optionsSectionEditHint") : t("optionsSectionHint")
        }
        columns={1}
      >
        <div className="space-y-2">
          {options.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                name="option"
                value={value}
                onChange={(event) => {
                  const next = [...options];
                  next[index] = event.target.value;
                  setOptions(next);
                }}
                maxLength={200}
                aria-label={t("optionLabel", { index: index + 1 })}
                placeholder={t("optionPlaceholder", { index: index + 1 })}
              />
              {options.length > 2 ? (
                <button
                  type="button"
                  onClick={() =>
                    setOptions(options.filter((_, i) => i !== index))
                  }
                  aria-label={t("removeOption", { index: index + 1 })}
                  className="rounded p-2 text-fg-subtle hover:bg-hover hover:text-fg"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setOptions([...options, ""])}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg hover:bg-hover"
          >
            <Plus aria-hidden className="h-4 w-4" />
            {t("addOption")}
          </button>
        </div>
      </FormSection>

      <FormSection title={t("rulesSection")} description={t("rulesSectionHint")}>
        <FormField
          name="weightMode"
          label={t("weightMode")}
          hint={t("weightModeHint")}
          required
        >
          <Select
            name="weightMode"
            value={weightMode}
            onChange={(event) => setWeightMode(event.target.value)}
            required
          >
            {WEIGHT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {tEnum(`pollWeight.${mode}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          name="quorumRule"
          label={t("quorumRule")}
          hint={t("quorumRuleHint")}
          required
        >
          <Select
            name="quorumRule"
            value={quorum}
            onChange={(event) => setQuorum(event.target.value)}
            required
          >
            {QUORUM_RULES.map((rule) => (
              <option key={rule} value={rule}>
                {tEnum(`quorumRule.${rule}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="sm:col-span-2">
          <Alert tone="info">
            {quorum === "simple_majority"
              ? t("quorumNoticeAttendees")
              : t("quorumNoticeAll")}
          </Alert>
        </div>

        <FormField name="visibility" label={t("visibility")} required>
          <Select
            name="visibility"
            defaultValue={defaults?.visibility ?? "open"}
            required
          >
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {tEnum(`pollVisibility.${v}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="sm:col-span-2 space-y-2">
          <Switch
            name="ownersOnly"
            label={t("ownersOnly")}
            description={t("ownersOnlyHint")}
            defaultChecked={defaults?.ownersOnly ?? true}
          />
          <Switch
            name="allowMultiple"
            label={t("allowMultiple")}
            description={t("allowMultipleHint")}
            defaultChecked={defaults?.allowMultiple ?? false}
          />
        </div>
      </FormSection>

      <FormSection
        title={t("scheduleSection")}
        description={t("scheduleSectionHint")}
      >
        <FormField name="opensAt" label={t("opensAt")} required>
          <DateInput
            name="opensAt"
            defaultValue={defaults?.opensAt ?? today()}
            required
          />
        </FormField>

        <FormField name="closesAt" label={t("closesAtLabel")} required>
          <DateInput
            name="closesAt"
            defaultValue={defaults?.closesAt ?? inDays(14)}
            required
          />
        </FormField>
      </FormSection>
    </ActionForm>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
