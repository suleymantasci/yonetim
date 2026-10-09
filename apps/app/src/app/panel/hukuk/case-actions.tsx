"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Input, MoneyInput, Select, Textarea } from "@yonetim/ui";

import { ActionForm, FormField, SubmitButton } from "@/components/form/action-form";
import {
  addLegalAmount,
  addLegalEvent,
  closeLegalCase,
  openLegalCase,
  updateLegalCase,
} from "./actions";

const STAGES = [
  "warning_letter",
  "notice_served",
  "lawsuit",
  "judgment",
  "enforcement",
  "seizure",
  "collection",
] as const;

/**
 * Adaydan dosya açma.
 *
 * TUTAR ALANI YOK ve bu bilinçli: dosyanın ana parası dairenin açık
 * borçlarından sunucuda toplanıyor. Ekrana bir tutar kutusu koymak,
 * hakkında icra takibi başlatılan rakamı elle yazdırmak olurdu.
 */
export function OpenCaseButton({
  unitId,
  unitLabel,
}: {
  unitId: string;
  unitLabel: string;
}) {
  const t = useTranslations("app.legal");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-fg hover:bg-hover"
      >
        {t("openCase")}
      </button>
    );
  }

  return (
    <ActionForm
      action={openLegalCase}
      submitLabel={t("openCase")}
      onSuccess={() => setOpen(false)}
      footer={
        <div className="mt-2 flex gap-2">
          <SubmitButton label={t("openCase")} />
          <CancelButton onClick={() => setOpen(false)} />
        </div>
      }
    >
      <input type="hidden" name="unitId" value={unitId} />
      <FormField name="caseNo" label={t("caseNo")} hint={t("caseNoHint")}>
        <Input name="caseNo" maxLength={60} />
      </FormField>
      <FormField name="note" label={t("note")}>
        <Textarea name="note" rows={2} maxLength={1000} placeholder={unitLabel} />
      </FormField>
    </ActionForm>
  );
}

/**
 * Açık dosyanın işlemleri: aşama, olay, para hareketi, kapatma.
 *
 * DÖRT AYRI FORM, tek formda dört düğme değil: her birinin zorunlu alanı
 * farklı. Birleştirilseydi olay eklemek isteyen yönetici, önce aşama seçmek
 * ve tutar yazmak zorunda kalırdı.
 */
export function CaseActions({
  caseId,
  stage,
  lawyerId = null,
  lawyers = [],
}: {
  caseId: string;
  stage: string;
  lawyerId?: string | null;
  lawyers?: { id: string; name: string }[];
}) {
  const t = useTranslations("app.legal");
  const tEnum = useTranslations("enum");
  const [tab, setTab] = useState<"none" | "stage" | "event" | "amount" | "close">(
    "none",
  );

  const tabs = [
    ["stage", t("updateStage")],
    ["event", t("addEvent")],
    ["amount", t("addAmount")],
    ["close", t("closeCase")],
  ] as const;

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(tab === key ? "none" : key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-hover ${
              tab === key
                ? "border-primary text-primary"
                : "border-border-strong text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "stage" ? (
        <ActionForm
          action={updateLegalCase}
          submitLabel={t("save")}
          onSuccess={() => setTab("none")}
          className="mt-3"
          footer={<Bar label={t("save")} onCancel={() => setTab("none")} />}
        >
          <input type="hidden" name="id" value={caseId} />
          <FormField name="lawyerId" label={t("lawyer")}>
            <Select name="lawyerId" defaultValue={lawyerId ?? ""}>
              <option value="">{t("noLawyer")}</option>
              {lawyers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField name="stage" label={t("stage")}>
            <Select name="stage" defaultValue={stage}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {tEnum(`legalStage.${s}`)}
                </option>
              ))}
            </Select>
          </FormField>
          {/* "Sıradaki işlem" tarihi takip ekranının hatırlatıcı işlevi:
              boş bırakılan bir dosya, kimsenin bakmadığı bir dosya. */}
          <FormField name="nextActionAt" label={t("nextActionAt")}>
            <Input name="nextActionAt" type="date" />
          </FormField>
          <FormField name="nextActionNote" label={t("nextActionNote")}>
            <Input name="nextActionNote" maxLength={500} />
          </FormField>
          <FormField name="note" label={t("stageNote")} hint={t("stageNoteHint")}>
            <Textarea name="note" rows={2} maxLength={1000} />
          </FormField>
        </ActionForm>
      ) : null}

      {tab === "event" ? (
        <ActionForm
          action={addLegalEvent}
          submitLabel={t("addEvent")}
          onSuccess={() => setTab("none")}
          className="mt-3"
          footer={<Bar label={t("addEvent")} onCancel={() => setTab("none")} />}
        >
          <input type="hidden" name="id" value={caseId} />
          <FormField name="title" label={t("eventTitle")} required>
            <Input name="title" maxLength={200} required />
          </FormField>
          <FormField name="note" label={t("note")}>
            <Textarea name="note" rows={2} maxLength={2000} />
          </FormField>
        </ActionForm>
      ) : null}

      {tab === "amount" ? (
        <ActionForm
          action={addLegalAmount}
          submitLabel={t("addAmount")}
          onSuccess={() => setTab("none")}
          className="mt-3"
          footer={<Bar label={t("addAmount")} onCancel={() => setTab("none")} />}
        >
          <input type="hidden" name="id" value={caseId} />
          <FormField name="kind" label={t("amountKind")} hint={t("amountKindHint")}>
            <Select name="kind" defaultValue="collection">
              <option value="collection">{t("kindCollection")}</option>
              <option value="cost">{t("kindCost")}</option>
            </Select>
          </FormField>
          <FormField name="amountMinor" label={t("amount")} required>
            <MoneyInput name="amountMinor" defaultKurus={0} required />
          </FormField>
          <FormField name="note" label={t("note")}>
            <Input name="note" maxLength={500} />
          </FormField>
        </ActionForm>
      ) : null}

      {tab === "close" ? (
        <ActionForm
          action={closeLegalCase}
          submitLabel={t("closeCase")}
          onSuccess={() => setTab("none")}
          className="mt-3"
          footer={
            <Bar label={t("closeCase")} onCancel={() => setTab("none")} danger />
          }
        >
          <input type="hidden" name="id" value={caseId} />
          <FormField name="reason" label={t("closeReason")} hint={t("closeReasonHint")} required>
            <Textarea name="reason" rows={2} maxLength={500} required />
          </FormField>
        </ActionForm>
      ) : null}
    </div>
  );
}

function Bar({
  label,
  onCancel,
  danger,
}: {
  label: string;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <div className="mt-3 flex gap-2">
      <SubmitButton label={label} variant={danger ? "danger" : "primary"} />
      <CancelButton onClick={onCancel} />
    </div>
  );
}

function CancelButton({ onClick }: { onClick: () => void }) {
  // Değişken adı `tCommon`: aynı dosyada iki `useTranslations` varsa ve ikisi
  // de `t` adını kullanırsa, çeviri anahtarlarını tarayan test (i18n-keys)
  // hepsini son namespace'e sayıyor ve var olan anahtarları "eksik" görüyor.
  const tCommon = useTranslations("common");
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
    >
      {tCommon("action.cancel")}
    </button>
  );
}
