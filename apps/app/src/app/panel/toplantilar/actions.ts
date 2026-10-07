"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  meetingDecisionSaveResult,
  meetingSaveResult,
} from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import {
  checkboxField,
  dateField,
  decimalField,
  okState,
  optionalDateField,
  optionalText,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Toplantı yazma köprüsü — PROJE-DURUMU §5.2, sıra 6.
 *
 * KARAR DEFTERİYLE KARIŞTIRILMAMALI: buradaki "karar" toplantı tutanağının
 * kendi sırasıdır ve düzeltilebilir. Site geneli sürekli numaralı,
 * değiştirilemez defter ayrı bir modül (`/panel/karar-defteri`, §2.7).
 */

const KINDS = ["ordinary", "extraordinary"] as const;
const STATUSES = ["planned", "held", "cancelled", "postponed"] as const;
const QUORUM_RULES = [
  "simple_majority",
  "absolute_majority",
  "two_thirds",
  "four_fifths",
  "unanimous",
] as const;

const meetingSchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  title: requiredText(3, 200),
  kind: z.enum(KINDS, { errorMap: () => ({ message: V.invalidSelection }) }),
  scheduledAt: dateField,
  secondCallAt: optionalDateField,
  location: optionalText(200),
  onlineUrl: optionalText(500),
  status: z.enum(STATUSES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  minutesUrl: optionalText(500),
});

export async function saveMeeting(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  // Gündem maddeleri değişken sayıda; boş satırlar kullanıcının sildiği
  // satırlar ve sunucuya taşınmıyor.
  const agenda = formData
    .getAll("agendaItem")
    .map((value) => String(value).trim())
    .filter((value) => value !== "");

  return runAction(
    {
      permission: "meeting:write",
      schema: meetingSchema,
      meta: { action: "meeting_saved", resource: "meeting" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.meetings");

      const body = {
        title: input.title,
        kind: input.kind,
        scheduledAt: input.scheduledAt,
        secondCallAt: input.secondCallAt ?? null,
        location: input.location ?? null,
        onlineUrl: input.onlineUrl ?? null,
        agenda,
        status: input.status,
        minutesUrl: input.minutesUrl ?? null,
      };

      const result = input.id
        ? await apiPatch(
            `/v1/panel/communication/meetings/${input.id}`,
            body,
            meetingSaveResult,
          )
        : await apiPost(
            "/v1/panel/communication/meetings",
            body,
            meetingSaveResult,
          );

      return okState(t("saved", { title: result.title }), {
        data: { id: result.id },
      });
    },
  );
}

const decisionSchema = z.object({
  meetingId: uuidField,
  title: requiredText(3, 200),
  body: requiredText(3, 8000),
  quorumRule: z.enum(QUORUM_RULES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  votesFor: decimalField({ min: 0, max: 1_000_000 }),
  votesAgainst: decimalField({ min: 0, max: 1_000_000 }),
  abstentions: decimalField({ min: 0, max: 1_000_000 }),
  passed: checkboxField,
  ledgerPageNo: decimalField({ min: 1, max: 99_999 }),
});

export async function addMeetingDecision(
  _previous: ActionState<{ decisionNo: number }>,
  formData: FormData,
): Promise<ActionState<{ decisionNo: number }>> {
  return runAction(
    {
      permission: "meeting:write",
      schema: decisionSchema,
      meta: { action: "meeting_decision_added", resource: "meeting_decision" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.meetings");

      const result = await apiPost(
        `/v1/panel/communication/meetings/${input.meetingId}/decisions`,
        {
          title: input.title,
          body: input.body,
          quorumRule: input.quorumRule,
          votesFor: input.votesFor ?? 0,
          votesAgainst: input.votesAgainst ?? 0,
          abstentions: input.abstentions ?? 0,
          passed: input.passed,
          ledgerPageNo: input.ledgerPageNo ?? null,
        },
        meetingDecisionSaveResult,
      );

      return okState(t("decisionAdded", { no: result.decisionNo }), {
        data: { decisionNo: result.decisionNo },
      });
    },
  );
}

/* ------------------------------------------------------------------ *
 * Tebliğ, durum, hazirun (KMK md.29–31)
 * ------------------------------------------------------------------ */

const NOTICE_METHODS = ["hand", "registered_mail", "notice_board", "electronic"] as const;

const noticeSchema = z.object({
  id: uuidField,
  noticeSentAt: dateField,
  method: z.enum(NOTICE_METHODS, { errorMap: () => ({ message: V.invalidSelection }) }),
});

export async function recordMeetingNotice(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "meeting:write",
      schema: noticeSchema,
      meta: { action: "meeting_notice_recorded", resource: "meeting" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.meetings");
      await apiPost(`/v1/panel/communication/meetings/${input.id}/notice`, {
        noticeSentAt: input.noticeSentAt,
        method: input.method,
      });
      return okState(t("noticeSaved"));
    },
  );
}

const statusSchema = z.object({
  id: uuidField,
  status: z.enum(["cancelled", "postponed", "held"]),
  reason: optionalText(1000),
  newScheduledAt: optionalDateField,
});

export async function changeMeetingStatus(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "meeting:write",
      schema: statusSchema,
      meta: { action: "meeting_status_changed", resource: "meeting" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.meetings");
      await apiPost(`/v1/panel/communication/meetings/${input.id}/status`, {
        status: input.status,
        reason: input.reason ?? null,
        newScheduledAt: input.newScheduledAt ?? null,
      });
      return okState(t(`statusChanged_${input.status}`));
    },
  );
}

const attendanceSchema = z.object({
  id: uuidField,
  unitId: uuidField,
  proxyName: optionalText(160),
  proxyDocumentUrl: optionalText(500),
  proxyDocumentFile: optionalText(60),
});

export async function addMeetingAttendance(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "meeting:write",
      schema: attendanceSchema,
      meta: { action: "meeting_attendance_added", resource: "meeting" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.meetings");
      await apiPost(`/v1/panel/communication/meetings/${input.id}/attendance`, {
        unitId: input.unitId,
        proxyName: input.proxyName ?? null,
        proxyDocumentUrl:
          (input.proxyDocumentFile && /^document:[0-9a-f-]{36}$/i.test(input.proxyDocumentFile)
            ? input.proxyDocumentFile
            : undefined) ??
          input.proxyDocumentUrl ??
          null,
      });
      return okState(t("attendanceAdded"));
    },
  );
}

const removeAttendanceSchema = z.object({
  id: uuidField,
  attendanceId: uuidField,
});

export async function removeMeetingAttendance(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "meeting:write",
      schema: removeAttendanceSchema,
      meta: { action: "meeting_attendance_removed", resource: "meeting" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.meetings");
      await apiDelete(
        `/v1/panel/communication/meetings/${input.id}/attendance/${input.attendanceId}`,
      );
      return okState(t("attendanceRemoved"));
    },
  );
}
