"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { RequestDetail } from "@yonetim/contracts";
import {
  Alert,
  Badge,
  FormSection,
  Select,
  Switch,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveRequestDetail } from "./actions";
import { RequestRecordFields } from "./request-form";

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
 * Talep detayının **tek formu**: durum, atama, yeni yorum ve (tam sayfada)
 * kayıt alanları — tek "Kaydet".
 *
 * Eskiden dört ayrı form vardı (kayıt, durum, atama, yorum), her birinin
 * kendi kaydet düğmesi ve yapışkan çubuğu; panelin geri kalanındaki "bir
 * form, bir kaydet" düzenine aykırıydı ve hangi düğmenin neyi kaydettiği
 * belirsizdi. API uçları hâlâ ayrı (farklı yetki ve yan etki); hangi parçanın
 * değiştiğine `saveRequestDetail` bakıyor.
 *
 * `units` verilirse kayıt alanları (konu, kategori, öncelik…) da çizilir —
 * tam sayfa. Çekmecede yalnız durum/atama/yazışma: orada sırayla iş
 * kapatılıyor, başlık düzeltmek tam sayfanın işi.
 */
export function RequestDetailPanel(props: RequestDetailPanelProps) {
  const { detail } = props;
  /*
   * Kayıttan sonra `router.refresh()` yeni `detail` getirir; anahtar değişince
   * form (seçili durum, yazılan yorum) sunucudaki hâlden yeniden kurulur.
   * Yalnız `ActionForm`'u değil bu bileşeni yeniden kurmak gerekiyor: durum
   * seçimi buradaki state'te.
   */
  const key = [
    detail.status,
    detail.assignedToUserId ?? "",
    detail.comments.length,
  ].join("|");
  return <RequestDetailForm key={key} {...props} />;
}

interface RequestDetailPanelProps {
  detail: RequestDetail;
  assignees: { id: string; name: string; role: string }[];
  canAssign: boolean;
  units?: { id: string; number: string; blockName: string | null }[];
  layout?: "page" | "modal";
  onCancel?: () => void;
}

function RequestDetailForm({
  detail,
  assignees,
  canAssign,
  units,
  layout = "page",
  onCancel,
}: RequestDetailPanelProps) {
  const t = useTranslations("app.requests");
  const tEnum = useTranslations("enum");
  const tCommon = useTranslations("common");

  const [status, setStatus] = useState<string>(detail.status);

  return (
    <ActionForm
      action={saveRequestDetail}
      submitLabel={tCommon("action.save")}
      stayOnSuccess
      layout={layout}
      onCancel={onCancel}
    >

      {detail.slaBreached ? (
        <div className="mb-5">
          <Alert tone="danger" title={t("slaBreachedTitle")}>
            {t("slaBreachedBody")}
          </Alert>
        </div>
      ) : null}

      <FormSection
        title={t("statusSection")}
        description={canAssign ? t("assignSectionHint") : undefined}
      >
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

        {canAssign ? (
          <FormField
            name="assignedToUserId"
            label={t("assignee")}
            hint={t("assigneeHint")}
          >
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
        ) : null}
      </FormSection>

      <FormSection
        title={t("commentsSection")}
        description={t("commentsSectionHint")}
        columns={1}
      >
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
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
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
                <p className="whitespace-pre-wrap break-words text-fg">
                  {c.body}
                </p>
              </li>
            ))}
          </ol>
        )}

        <FormField
          name="body"
          label={
            NOTE_SUGGESTED.has(status) && status !== detail.status
              ? t("resolutionNote")
              : t("commentBody")
          }
          hint={
            NOTE_SUGGESTED.has(status) && status !== detail.status
              ? t("resolutionNoteHint")
              : t("commentBodyHint")
          }
        >
          <Textarea name="body" rows={3} maxLength={4000} />
        </FormField>
        <Switch
          name="isInternal"
          label={t("internalNote")}
          description={t("internalNoteHint")}
        />
      </FormSection>

      {units ? (
        <RequestRecordFields
          defaults={{
            unitId: detail.unitId,
            category: detail.category,
            title: detail.title,
            description: detail.description,
            priority: detail.priority,
            assignedToUserId: detail.assignedToUserId,
            costKurus: detail.costMinor,
          }}
          units={units}
        />
      ) : null}

      {/* Sonda: başta dursalar ilk bölümün `first:pt-0` boşluğu bozulur. */}
      <input type="hidden" name="id" value={detail.id} />
      <input type="hidden" name="previousStatus" value={detail.status} />
      <input
        type="hidden"
        name="previousAssignee"
        value={detail.assignedToUserId ?? ""}
      />
    </ActionForm>
  );
}
