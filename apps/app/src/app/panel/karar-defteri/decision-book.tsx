"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { DECISION_KINDS, DECISION_QUORUM_RULES } from "@yonetim/contracts";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DateInput,
  Drawer,
  EmptyState,
  FormSection,
  Input,
  Select,
  Switch,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { createDecisionEntry } from "./actions";

export interface DecisionEntryView {
  id: string;
  entryNo: number;
  decidedAt: string;
  kind: string;
  kindLabel: string;
  meetingTitle: string | null;
  subject: string;
  body: string;
  quorumLabel: string;
  votesFor: string;
  votesAgainst: string;
  abstentions: string;
  passed: boolean;
  correctsEntryId: string | null;
  correctedByEntryNo: number | null;
  bookPageNo: number | null;
  createdByName: string | null;
}

/**
 * Karar Defteri — KMK md.32.
 *
 * DÜZENLEME VE SİLME DÜĞMESİ **YOK** ve olmayacak. Defter noter tasdikli,
 * sayfaları numaralı bir kitabın karşılığı: yazılan karar değiştirilmez.
 * Yanlış karar için "Düzeltme kararı yaz" var — yeni bir kayıt açıp eskisine
 * işaret ediyor, ikisi de defterde duruyor. Veritabanı trigger'ı da
 * güncellemeyi engelliyor, yani bu bir arayüz nezaketi değil, veri kuralı.
 *
 * Düzeltilmiş kararın üstünde uyarı çıkıyor: defteri okuyan kişi hangi
 * kararın hâlâ geçerli olduğunu, iki kaydı yan yana koymak zorunda kalmadan
 * görmeli.
 */
export function DecisionBook({
  entries,
  meetings,
  nextEntryNo,
  canWrite,
}: {
  readonly entries: DecisionEntryView[];
  readonly meetings: { id: string; label: string }[];
  readonly nextEntryNo: number;
  /**
   * Sakinler de bu ekranı görüyor (KMK md.32/son okuma hakkı) ama yazamıyor;
   * bağlayıcı karar uçta (`decision:write`), buradaki bayrak yalnız düğmeyi
   * göstermemek için.
   */
  readonly canWrite: boolean;
}) {
  const t = useTranslations("app.decisionBook");
  const tCommon = useTranslations("common");
  const tEnum = useTranslations("enum");

  const [open, setOpen] = useState(false);
  /** Düzeltme kaydıysa hangi kararı düzelttiği. */
  const [correcting, setCorrecting] = useState<DecisionEntryView | null>(null);

  function openNew(target: DecisionEntryView | null) {
    setCorrecting(target);
    setOpen(true);
  }

  return (
    <>
      <Card>
        <CardHeader
          title={t("tableTitle")}
          description={t("tableHint")}
          action={
            canWrite ? (
              <button
                type="button"
                onClick={() => openNew(null)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
              >
                <Plus aria-hidden className="h-4 w-4" />
                {t("newEntry", { no: nextEntryNo })}
              </button>
            ) : null
          }
        />
        <CardBody>
          {entries.length === 0 ? (
            <EmptyState
              title={t("emptyTitle")}
              description={t("emptyDescription")}
              steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
            />
          ) : (
            /*
              Tablo değil **liste**: karar metni uzun ve bir tablo hücresine
              sıkıştırıldığında okunmuyor. Defterin kendisi de sayfa sayfa
              okunan bir belge; ekran o biçimi izliyor.
            */
            <ol className="space-y-4">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="text-sm font-semibold text-fg">
                      <span className="tabular-nums text-fg-muted">
                        {t("entryNo", { no: entry.entryNo })}
                      </span>{" "}
                      {entry.subject}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{entry.kindLabel}</Badge>
                      <Badge tone={entry.passed ? "success" : "danger"}>
                        {entry.passed ? t("passed") : t("rejected")}
                      </Badge>
                    </div>
                  </div>

                  <p className="mt-1 text-xs text-fg-subtle">
                    {t("entryMeta", {
                      date: entry.decidedAt,
                      quorum: entry.quorumLabel,
                    })}
                    {entry.meetingTitle
                      ? ` · ${entry.meetingTitle}`
                      : ""}
                    {entry.bookPageNo
                      ? ` · ${t("bookPage", { page: entry.bookPageNo })}`
                      : ""}
                    {entry.createdByName ? ` · ${entry.createdByName}` : ""}
                  </p>

                  {entry.correctedByEntryNo ? (
                    <div className="mt-2">
                      <Alert tone="warning">
                        {t("correctedBy", { no: entry.correctedByEntryNo })}
                      </Alert>
                    </div>
                  ) : null}
                  {entry.correctsEntryId ? (
                    <div className="mt-2">
                      <Alert tone="info">{t("isCorrection")}</Alert>
                    </div>
                  ) : null}

                  {/* `whitespace-pre-wrap`: karar metni paragraflı yazılıyor
                      ve satır sonları hukuki metinde anlam taşıyor. */}
                  <p className="mt-3 whitespace-pre-wrap text-sm text-fg">
                    {entry.body}
                  </p>

                  <p className="mt-3 text-xs tabular-nums text-fg-muted">
                    {t("voteSummary", {
                      forVotes: entry.votesFor,
                      against: entry.votesAgainst,
                      abstain: entry.abstentions,
                    })}
                  </p>

                  {canWrite && !entry.correctedByEntryNo ? (
                    <button
                      type="button"
                      onClick={() => openNew(entry)}
                      className="mt-3 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-hover"
                    >
                      {t("writeCorrection")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={
          correcting
            ? t("correctionTitle", { no: correcting.entryNo })
            : t("newEntry", { no: nextEntryNo })
        }
        size="lg"
        closeLabel={tCommon("action.close")}
        padded={false}
      >
        <ActionForm
          key={correcting?.id ?? "new"}
          action={createDecisionEntry}
          submitLabel={t("writeToBook")}
          layout="modal"
          stayOnSuccess
          onCancel={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
        >
          {correcting ? (
            <input
              type="hidden"
              name="correctsEntryId"
              value={correcting.id}
            />
          ) : null}

          {correcting ? (
            <Alert tone="warning">
              {t("correctionNotice", { no: correcting.entryNo })}
            </Alert>
          ) : (
            <Alert tone="info">{t("immutableNotice")}</Alert>
          )}

          <FormSection title={t("sectionDecision")}>
            <FormField name="decidedAt" label={t("decidedAt")} required>
              <DateInput name="decidedAt" defaultValue={today()} required />
            </FormField>
            <FormField name="kind" label={t("kind")} required>
              <Select name="kind" defaultValue="kurul" required>
                {DECISION_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {tEnum(`decisionKind.${value}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="sm:col-span-2">
              <FormField name="subject" label={t("subject")} required>
                <Input
                  name="subject"
                  required
                  minLength={3}
                  maxLength={200}
                  defaultValue={
                    correcting ? t("correctionSubject", { no: correcting.entryNo }) : ""
                  }
                />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField
                name="body"
                label={t("body")}
                required
                hint={t("bodyHint")}
              >
                <Textarea name="body" required rows={8} maxLength={20000} />
              </FormField>
            </div>
          </FormSection>

          <FormSection title={t("sectionVoting")}>
            <FormField name="quorumRule" label={t("quorumRule")} required>
              <Select name="quorumRule" defaultValue="simple_majority" required>
                {DECISION_QUORUM_RULES.map((value) => (
                  <option key={value} value={value}>
                    {tEnum(`quorumRule.${value}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              name="meetingId"
              label={t("meeting")}
              hint={t("meetingHint")}
            >
              <Select name="meetingId" defaultValue="">
                <option value="">{t("noMeeting")}</option>
                {meetings.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>
                    {meeting.label}
                  </option>
                ))}
              </Select>
            </FormField>
            {/* Oy alanları metin: arsa payı ağırlıklı oy kesirli olabiliyor
                ve sayıya çevirmek yuvarlama kaybı demek. */}
            <FormField
              name="votesFor"
              label={t("votesFor")}
              hint={t("votesHint")}
            >
              <Input name="votesFor" inputMode="decimal" defaultValue="0" />
            </FormField>
            <FormField name="votesAgainst" label={t("votesAgainst")}>
              <Input name="votesAgainst" inputMode="decimal" defaultValue="0" />
            </FormField>
            <FormField name="abstentions" label={t("abstentions")}>
              <Input name="abstentions" inputMode="decimal" defaultValue="0" />
            </FormField>
            <FormField
              name="bookPageNo"
              label={t("bookPageNo")}
              hint={t("bookPageNoHint")}
            >
              <Input name="bookPageNo" type="number" min={1} max={100000} />
            </FormField>
            <div className="sm:col-span-2">
              <Switch
                name="passed"
                label={t("passedLabel")}
                description={t("passedHint")}
                defaultChecked
              />
            </div>
          </FormSection>
        </ActionForm>
      </Drawer>
    </>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
