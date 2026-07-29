"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { RequestDetail } from "@yonetim/contracts";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Select,
  Switch,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { assignRequest, commentOnRequest, setRequestStatus } from "./actions";

const STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "waiting_resident",
  "resolved",
  "closed",
  "rejected",
] as const;

/** Not gerektiren geçişler — "kapattım" tek başına bir cevap değil. */
const NOTE_SUGGESTED = new Set(["resolved", "closed", "rejected"]);

/**
 * Talep detayının **eylem** yüzeyi: durum, atama, yorum.
 *
 * ÜÇ AYRI FORM, tek büyük form değil. Sebep sunucudaki ayrımın aynısı: üçü
 * farklı uçlara, farklı yetkilere (`request:write` / `request:assign`) ve
 * farklı yan etkilere sahip. Tek forma toplamak, yalnız yorum yazmak isteyen
 * bir görevlinin durumu da kaydetmesine yol açardı — hem de fark etmeden.
 */
export function RequestDetailPanel({
  detail,
  assignees,
  canAssign,
  onDone,
}: {
  detail: RequestDetail;
  assignees: { id: string; name: string; role: string }[];
  canAssign: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations("app.requests");
  const tEnum = useTranslations("enum");
  const tCommon = useTranslations("common");

  const [status, setStatus] = useState<string>(detail.status);

  return (
    <div className="space-y-4">
      {detail.slaBreached ? (
        <Alert tone="danger" title={t("slaBreachedTitle")}>
          {t("slaBreachedBody")}
        </Alert>
      ) : null}

      <Card>
        <CardHeader title={t("statusSection")} />
        <CardBody>
          <ActionForm
            action={setRequestStatus}
            submitLabel={tCommon("action.save")}
            stayOnSuccess
            onSuccess={onDone}
          >
            <input type="hidden" name="id" value={detail.id} />

            <FormField name="status" label={t("status")} required>
              <Select
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                required
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tEnum(`requestStatus.${s}`)}
                  </option>
                ))}
              </Select>
            </FormField>

            {NOTE_SUGGESTED.has(status) ? (
              <FormField
                name="resolutionNote"
                label={t("resolutionNote")}
                hint={t("resolutionNoteHint")}
              >
                <Textarea name="resolutionNote" rows={3} maxLength={2000} />
              </FormField>
            ) : null}
          </ActionForm>
        </CardBody>
      </Card>

      {canAssign ? (
        <Card>
          <CardHeader
            title={t("assignSection")}
            description={t("assignSectionHint")}
          />
          <CardBody>
            <ActionForm
              action={assignRequest}
              submitLabel={tCommon("action.save")}
              stayOnSuccess
              onSuccess={onDone}
            >
              <input type="hidden" name="id" value={detail.id} />
              <FormField name="assignedToUserId" label={t("assignee")}>
                <Select
                  name="assignedToUserId"
                  defaultValue={detail.assignedToUserId ?? ""}
                >
                  <option value="">{t("assigneeNone")}</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {tEnum(`role.${a.role}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={t("commentsSection")}
          description={t("commentsSectionHint")}
        />
        <CardBody className="space-y-4">
          {detail.comments.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noComments")}</p>
          ) : (
            <ol className="space-y-3">
              {detail.comments.map((c) => (
                <li
                  key={c.id}
                  className={`rounded-lg border p-3 text-sm ${
                    c.isInternal
                      ? "border-warning-border bg-warning-soft"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-fg-subtle">
                    <span className="font-medium text-fg">
                      {c.authorName ?? t("unknownAuthor")}
                    </span>
                    <time dateTime={new Date(c.createdAt).toISOString()}>
                      {new Date(c.createdAt).toLocaleString("tr-TR")}
                    </time>
                    {c.isInternal ? (
                      <Badge tone="warning">
                        <Lock aria-hidden className="mr-1 inline h-3 w-3" />
                        {t("internalNote")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap text-fg">{c.body}</p>
                </li>
              ))}
            </ol>
          )}

          <ActionForm
            action={commentOnRequest}
            submitLabel={t("addComment")}
            stayOnSuccess
            onSuccess={onDone}
          >
            <input type="hidden" name="id" value={detail.id} />
            <FormField name="body" label={t("commentBody")} required>
              <Textarea name="body" rows={3} required maxLength={4000} />
            </FormField>
            <div className="sm:col-span-2">
              <Switch
                name="isInternal"
                label={t("internalNote")}
                description={t("internalNoteHint")}
              />
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
