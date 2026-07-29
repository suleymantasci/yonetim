"use client";

import { useTranslations } from "next-intl";

import { Alert, Input, Select, Switch, Textarea } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { addMeetingDecision } from "./actions";

const QUORUM_RULES = [
  "simple_majority",
  "absolute_majority",
  "two_thirds",
  "four_fifths",
  "unanimous",
] as const;

/**
 * Toplantı tutanağına karar ekleme.
 *
 * KARAR NUMARASI SORULMUYOR: toplantı içinde sürekli ve tekil olmalı, sunucu
 * üretiyor. Kullanıcıya sorulsaydı iki kişi aynı numarayı yazabilir ve
 * tutanağın sırası bozulurdu.
 *
 * BU EKRAN **KARAR DEFTERİ DEĞİL**. Site geneli sürekli numaralı,
 * değiştirilemez defter ayrı bir modül; oradaki kayıt silinemez ve
 * düzeltilemez, buradaki tutanak maddesi düzeltilebilir. Ayrım ekranda da
 * yazıyor ki iki kavram karışmasın.
 */
export function MeetingDecisionForm({
  meetingId,
  submitLabel,
  onDone,
}: {
  meetingId: string;
  submitLabel: string;
  onDone?: () => void;
}) {
  const t = useTranslations("app.meetings");
  const tEnum = useTranslations("enum");

  return (
    <ActionForm
      action={addMeetingDecision}
      submitLabel={submitLabel}
      stayOnSuccess
      onSuccess={onDone}
    >
      <input type="hidden" name="meetingId" value={meetingId} />

      <div className="sm:col-span-2">
        <Alert tone="info">{t("decisionBookNotice")}</Alert>
      </div>

      <div className="sm:col-span-2">
        <FormField name="title" label={t("decisionTitle")} required>
          <Input name="title" required minLength={3} maxLength={200} />
        </FormField>
      </div>

      <div className="sm:col-span-2">
        <FormField
          name="body"
          label={t("decisionBody")}
          hint={t("decisionBodyHint")}
          required
        >
          <Textarea name="body" rows={5} required maxLength={8000} />
        </FormField>
      </div>

      <FormField name="quorumRule" label={t("quorumRule")} required>
        <Select name="quorumRule" defaultValue="simple_majority" required>
          {QUORUM_RULES.map((rule) => (
            <option key={rule} value={rule}>
              {tEnum(`quorumRule.${rule}`)}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        name="ledgerPageNo"
        label={t("ledgerPageNo")}
        hint={t("ledgerPageNoHint")}
      >
        <Input name="ledgerPageNo" type="number" min={1} max={99999} />
      </FormField>

      <FormField name="votesFor" label={t("votesFor")}>
        <Input name="votesFor" type="number" step="0.000001" min={0} defaultValue="0" />
      </FormField>

      <FormField name="votesAgainst" label={t("votesAgainst")}>
        <Input
          name="votesAgainst"
          type="number"
          step="0.000001"
          min={0}
          defaultValue="0"
        />
      </FormField>

      <FormField name="abstentions" label={t("abstentions")}>
        <Input
          name="abstentions"
          type="number"
          step="0.000001"
          min={0}
          defaultValue="0"
        />
      </FormField>

      <div className="sm:col-span-2">
        <Switch
          name="passed"
          label={t("passed")}
          description={t("passedHint")}
        />
      </div>
    </ActionForm>
  );
}
