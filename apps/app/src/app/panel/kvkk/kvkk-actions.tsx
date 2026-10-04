"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert, Combobox, DateInput, Drawer, Input, Select, Textarea } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";

import {
  createDataBreach,
  createKvkkRequest,
  eraseKvkkSubject,
  updateDataBreach,
  updateKvkkRequest,
} from "./actions";

const TYPES = ["access", "rectification", "erasure", "objection", "portability"] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ başvuru */

export function CreateRequestButton({
  residents,
}: {
  residents: Array<{ value: string; label: string }>;
}) {
  const t = useTranslations("app.kvkkPanel");
  const tEnum = useTranslations("enum");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
      >
        <Plus aria-hidden className="h-4 w-4" />
        {t("createRequest")}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t("createRequest")}
        description={t("createRequestHint")}
        closeLabel={tCommon("action.close")}
        padded={false}
      >
        <ActionForm
          action={createKvkkRequest}
          submitLabel={tCommon("action.save")}
          onSuccess={() => setOpen(false)}
          layout="modal"
          onCancel={() => setOpen(false)}
        >
          <div className="space-y-4">
            <FormField name="type" label={t("requestType")} required>
              <Select name="type" defaultValue="access" required>
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {tEnum(`kvkkRequestType.${type}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField name="userId" label={t("subject")} hint={t("subjectHint")}>
              <Combobox
                name="userId"
                options={residents}
                placeholder={t("subjectPlaceholder")}
                searchPlaceholder={t("subjectSearch")}
                emptyText={t("subjectEmpty")}
              />
            </FormField>
            <FormField name="requesterEmail" label={t("requesterEmail")} hint={t("requesterEmailHint")}>
              <Input name="requesterEmail" type="email" maxLength={255} />
            </FormField>
            <FormField name="detail" label={t("detail")} required>
              <Textarea name="detail" rows={4} minLength={5} maxLength={2000} required />
            </FormField>
            <FormField name="receivedAt" label={t("receivedAt")} hint={t("receivedAtHint")}>
              <DateInput name="receivedAt" defaultValue={today()} max={today()} />
            </FormField>
          </div>
        </ActionForm>
      </Drawer>
    </>
  );
}

type RequestMode = "in_progress" | "fulfilled" | "rejected" | "erase";

export function RequestActions({
  requestId,
  type,
  status,
}: {
  requestId: string;
  type: string;
  status: string;
}) {
  const t = useTranslations("app.kvkkPanel");
  const tCommon = useTranslations("common");
  const [mode, setMode] = useState<RequestMode | null>(null);

  if (status === "fulfilled" || status === "rejected") return null;

  const buttons: Array<{ mode: RequestMode; label: string; tone: string }> = [];
  if (status === "received") buttons.push({ mode: "in_progress", label: t("actionStart"), tone: "neutral" });
  buttons.push(
    type === "erasure"
      ? { mode: "erase", label: t("actionErase"), tone: "danger" }
      : { mode: "fulfilled", label: t("actionFulfill"), tone: "primary" },
  );
  buttons.push({ mode: "rejected", label: t("actionReject"), tone: "neutral" });

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {buttons.map((b) => (
          <button
            key={b.mode}
            type="button"
            onClick={() => setMode(b.mode)}
            className={
              b.tone === "danger"
                ? "inline-flex h-8 items-center rounded-lg border border-danger-fg/40 px-3 text-xs font-semibold text-danger-fg hover:bg-danger-soft"
                : b.tone === "primary"
                  ? "inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-fg hover:bg-primary-hover"
                  : "inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-xs font-semibold text-fg hover:bg-hover"
            }
          >
            {b.label}
          </button>
        ))}
      </div>

      <Drawer
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode ? t(`modeTitle.${mode}`) : ""}
        closeLabel={tCommon("action.close")}
        padded={false}
      >
        {mode ? (
          <ActionForm
            key={mode}
            action={mode === "erase" ? eraseKvkkSubject : updateKvkkRequest}
            submitLabel={t(`modeTitle.${mode}`)}
            onSuccess={() => setMode(null)}
            layout="modal"
            onCancel={() => setMode(null)}
          >
            <input type="hidden" name="requestId" value={requestId} />
            {mode !== "erase" ? <input type="hidden" name="status" value={mode} /> : null}
            <div className="space-y-4">
              {mode === "erase" ? (
                <Alert tone="warning" title={t("eraseWarningTitle")}>
                  {t("eraseWarning")}
                </Alert>
              ) : null}
              <FormField name="responseNote" label={t("responseNote")} hint={t("responseNoteHint")} required>
                <Textarea name="responseNote" rows={4} minLength={10} maxLength={2000} required />
              </FormField>
            </div>
          </ActionForm>
        ) : null}
      </Drawer>
    </>
  );
}

/* --------------------------------------------------------------- ihlal */

export function CreateBreachButton() {
  const t = useTranslations("app.kvkkPanel");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
      >
        <Plus aria-hidden className="h-4 w-4" />
        {t("createBreach")}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t("createBreach")}
        description={t("createBreachHint")}
        closeLabel={tCommon("action.close")}
        padded={false}
      >
        <ActionForm
          action={createDataBreach}
          submitLabel={tCommon("action.save")}
          onSuccess={() => setOpen(false)}
          layout="modal"
          onCancel={() => setOpen(false)}
        >
          <div className="space-y-4">
            <FormField name="title" label={t("breachTitle")} required>
              <Input name="title" minLength={5} maxLength={200} required />
            </FormField>
            <FormField name="description" label={t("breachDescription")} required>
              <Textarea name="description" rows={4} minLength={10} maxLength={4000} required />
            </FormField>
            <FormField name="detectedAt" label={t("detectedAt")} hint={t("detectedAtHint")} required>
              <DateInput name="detectedAt" defaultValue={today()} max={today()} required />
            </FormField>
            <FormField name="affectedUserCount" label={t("affectedUserCount")} required>
              <Input name="affectedUserCount" type="number" min={0} defaultValue={0} required />
            </FormField>
            <FormField name="dataCategories" label={t("dataCategories")} hint={t("dataCategoriesHint")}>
              <Input name="dataCategories" maxLength={400} />
            </FormField>
          </div>
        </ActionForm>
      </Drawer>
    </>
  );
}

export function BreachActions({
  breachId,
  status,
  boardNotified,
}: {
  breachId: string;
  status: string;
  boardNotified: boolean;
}) {
  const t = useTranslations("app.kvkkPanel");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  if (status === "closed") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-xs font-semibold text-fg hover:bg-hover"
      >
        {t("updateBreach")}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t("updateBreach")}
        closeLabel={tCommon("action.close")}
        padded={false}
      >
        <ActionForm
          action={updateDataBreach}
          submitLabel={tCommon("action.save")}
          onSuccess={() => setOpen(false)}
          layout="modal"
          onCancel={() => setOpen(false)}
        >
          <input type="hidden" name="breachId" value={breachId} />
          <div className="space-y-4">
            {!boardNotified ? (
              <FormField name="boardNotifiedAt" label={t("boardNotifiedAt")} hint={t("boardNotifiedAtHint")}>
                <DateInput name="boardNotifiedAt" max={today()} />
              </FormField>
            ) : null}
            <FormField name="subjectsNotifiedAt" label={t("subjectsNotifiedAt")}>
              <DateInput name="subjectsNotifiedAt" max={today()} />
            </FormField>
            <FormField name="mitigation" label={t("mitigation")}>
              <Textarea name="mitigation" rows={3} maxLength={4000} />
            </FormField>
            <FormField name="status" label={t("breachStatus")} required>
              <Select name="status" defaultValue={status} required>
                {(["open", "contained", "closed"] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`breachStatusOption.${s}`)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </ActionForm>
      </Drawer>
    </>
  );
}
