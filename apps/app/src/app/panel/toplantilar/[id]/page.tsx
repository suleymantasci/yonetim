import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarClock, CheckCircle2, Megaphone, Pencil, Trash2, UserPlus, XCircle } from "lucide-react";

import { hasPermission } from "@yonetim/auth/guard";
import { meetingDetail, MEETING_NOTICE_METHODS, MEETING_NOTICE_MIN_DAYS } from "@yonetim/contracts";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DateInput,
  Input,
  Select,
  Stat,
  tableClasses as tc,
  Textarea,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ActionDrawerButton } from "@/components/form/action-drawer-button";
import { FormField } from "@/components/form/action-form";
import { AttachmentField } from "@/components/form/attachment-field";
import Link from "@/components/link";
import { PrintButton } from "@/components/print-button";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { attachmentHref } from "@/lib/attachment-href";
import {
  addMeetingAttendance,
  changeMeetingStatus,
  recordMeetingNotice,
  removeMeetingAttendance,
} from "../actions";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  planned: "info",
  held: "success",
  postponed: "warning",
  cancelled: "danger",
};

/**
 * Toplantı ayrıntısı — çağrı tebliği (KMK md.29), hazirun cetveli ve yeter
 * sayı (md.30), vekâlet sınırı (md.31). Hazirun yazdırılıp imzaya açılıyor.
 */
export default async function MeetingDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("meeting:read");
  const t = await getTranslations("app.meetings");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const m = await apiGet(`/v1/panel/communication/meetings/${id}`, meetingDetail).catch(() => null);
  if (!m) notFound();

  const canWrite = hasPermission(ctx.roles, "meeting:write");
  const open = m.status !== "cancelled";
  const agenda = m.agenda as string[];
  const q = m.quorum;
  const sharePct = q.totalShare > 0 ? (q.attendingShare / q.totalShare) * 100 : 0;
  const availableUnits = m.units.filter((u) => !u.attending);

  return (
    <>
      <PageHeader
        title={m.title}
        description={`${f.dateTime(m.scheduledAt)}${m.location ? ` · ${m.location}` : ""}`}
        breadcrumb={[
          { label: t("title"), href: "/panel/toplantilar" },
          { label: m.title },
        ]}
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PrintButton label={t("printAttendance")} />
            {canWrite && open ? (
              <Link
                href={`/panel/toplantilar/${m.id}/duzenle`}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
              >
                <Pencil aria-hidden className="h-4 w-4" />
                {tCommon("action.edit")}
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>{tEnum(`meetingStatus.${m.status}` as never)}</Badge>
        <Badge tone="neutral">{tEnum(`meetingKind.${m.kind}` as never)}</Badge>
        {m.statusReason ? <span className="text-sm text-fg-muted">{m.statusReason}</span> : null}
      </div>

      {canWrite && open ? (
        <div className="mb-4 flex flex-wrap gap-2 print:hidden">
          <ActionDrawerButton
            action={changeMeetingStatus}
            hidden={{ id: m.id, status: "held" }}
            icon={<CheckCircle2 />}
            label={t("markHeld")}
            title={t("markHeld")}
            description={t("markHeldHint")}
            submitLabel={t("markHeld")}
          >
            <FormField name="reason" label={t("statusNote")}>
              <Textarea name="reason" rows={2} maxLength={1000} />
            </FormField>
          </ActionDrawerButton>
          <ActionDrawerButton
            action={changeMeetingStatus}
            hidden={{ id: m.id, status: "postponed" }}
            icon={<CalendarClock />}
            label={t("postpone")}
            title={t("postpone")}
            description={t("postponeHint")}
            warning={t("postponeWarning")}
            submitLabel={t("postpone")}
          >
            <FormField name="newScheduledAt" label={t("newDate")} required>
              <DateInput name="newScheduledAt" required />
            </FormField>
            <FormField name="reason" label={t("reason")} required>
              <Textarea name="reason" rows={2} minLength={3} maxLength={1000} required />
            </FormField>
          </ActionDrawerButton>
          <ActionDrawerButton
            action={changeMeetingStatus}
            hidden={{ id: m.id, status: "cancelled" }}
            icon={<XCircle />}
            tone="danger"
            label={t("cancelMeeting")}
            title={t("cancelMeeting")}
            warning={t("cancelWarning")}
            submitLabel={t("cancelMeeting")}
          >
            <FormField name="reason" label={t("reason")} required>
              <Textarea name="reason" rows={2} minLength={3} maxLength={1000} required />
            </FormField>
          </ActionDrawerButton>
        </div>
      ) : null}

      {/* Tebliğ (KMK md.29) */}
      <Card className="mb-4 print:hidden">
        <CardHeader
          title={t("noticeTitle")}
          description={t("noticeHint", { days: MEETING_NOTICE_MIN_DAYS })}
          action={
            canWrite && open ? (
              <ActionDrawerButton
                action={recordMeetingNotice}
                hidden={{ id: m.id }}
                icon={<Megaphone />}
                label={m.noticeSentAt ? t("noticeUpdate") : t("noticeRecord")}
                title={t("noticeRecord")}
                description={t("noticeHint", { days: MEETING_NOTICE_MIN_DAYS })}
                submitLabel={tCommon("action.save")}
              >
                <FormField name="noticeSentAt" label={t("noticeSentAt")} required>
                  <DateInput name="noticeSentAt" required />
                </FormField>
                <FormField name="method" label={t("noticeMethodLabel")} required>
                  <Select name="method" defaultValue="hand" required>
                    {MEETING_NOTICE_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {t(`noticeMethod.${method}`)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </ActionDrawerButton>
            ) : undefined
          }
        />
        <CardBody className="space-y-3 text-sm">
          {m.noticeSentAt ? (
            <p className="text-fg">
              {t("noticeDone", {
                date: f.date(m.noticeSentAt),
                method: m.noticeMethod ? t(`noticeMethod.${m.noticeMethod}`) : "—",
                days: m.noticeDays ?? 0,
              })}
            </p>
          ) : null}
          {m.noticeWarning === "missing" ? (
            <Alert tone="warning">{t("noticeMissing", { days: MEETING_NOTICE_MIN_DAYS })}</Alert>
          ) : m.noticeWarning === "late" ? (
            <Alert tone="danger">
              {t("noticeLate", { days: m.noticeDays ?? 0, min: MEETING_NOTICE_MIN_DAYS })}
            </Alert>
          ) : null}
          {agenda.length > 0 ? (
            <div>
              <div className="text-xs font-medium text-fg-subtle">{t("agenda")}</div>
              <ol className="mt-1 list-inside list-decimal space-y-0.5 text-fg">
                {agenda.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Yeter sayı (KMK md.30) */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
        <Stat label={t("attendingUnits")} value={`${q.attendingUnits} / ${q.totalUnits}`} />
        <Stat label={t("attendingShare")} value={`%${sharePct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`} />
        <Stat
          label={t("firstCall")}
          value={q.firstCallMet ? t("quorumYes") : t("quorumNo")}
          tone={q.firstCallMet ? "success" : "danger"}
        />
        <Stat
          label={t("secondCall")}
          value={q.secondCallMet ? t("quorumYes") : t("quorumNo")}
          tone={q.secondCallMet ? "success" : "warning"}
        />
      </div>

      {/* Hazirun cetveli */}
      <Card>
        <CardHeader
          title={t("attendanceTitle")}
          description={t("attendanceHint", { limit: q.proxyLimit })}
          action={
            canWrite && open && availableUnits.length > 0 ? (
              <div className="print:hidden">
                <ActionDrawerButton
                  action={addMeetingAttendance}
                  hidden={{ id: m.id }}
                  icon={<UserPlus />}
                  label={t("attendanceAdd")}
                  title={t("attendanceAdd")}
                  description={t("attendanceAddHint")}
                  submitLabel={tCommon("action.add")}
                >
                  <FormField name="unitId" label={t("unit")} required>
                    <Select name="unitId" defaultValue="" required>
                      <option value="">{t("selectUnit")}</option>
                      {availableUnits.map((u) => (
                        <option key={u.unitId} value={u.unitId}>
                          {u.unitLabel}
                          {u.ownerName ? ` · ${u.ownerName}` : ""}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField name="proxyName" label={t("proxyName")} hint={t("proxyNameHint", { limit: q.proxyLimit })}>
                    <Input name="proxyName" maxLength={160} />
                  </FormField>
                  <FormField name="proxyDocumentUrl" label={t("proxyDocument")} hint={t("proxyDocumentHint")}>
                    <Input name="proxyDocumentUrl" type="url" maxLength={500} placeholder="https://…" />
                  </FormField>
                  <AttachmentField name="proxyDocumentFile" category="legal" title={t("proxyDocument")} />
                </ActionDrawerButton>
              </div>
            ) : undefined
          }
        />
        <CardBody className="p-0">
          <div className="hidden px-4 pt-4 print:block">
            <h2 className="text-lg font-semibold">{m.title}</h2>
            <p className="text-sm">
              {f.dateTime(m.scheduledAt)}
              {m.location ? ` · ${m.location}` : ""}
            </p>
          </div>
          {m.attendances.length === 0 ? (
            <p className="p-4 text-sm text-fg-muted">{t("attendanceEmpty")}</p>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 560 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("unit")}</th>
                    <th scope="col" className={tc.th}>{t("owner")}</th>
                    <th scope="col" className={tc.th}>{t("proxyName")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("landShare")}</th>
                    <th scope="col" className={tc.th}>{t("signature")}</th>
                    {canWrite && open ? (
                      <th scope="col" className={`${tc.th} print:hidden`}>
                        <span className="sr-only">{tCommon("action.delete")}</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {m.attendances.map((a) => (
                    <tr key={a.id} className={tc.tr}>
                      <td className={tc.td}>{a.unitLabel}</td>
                      <td className={tc.td}>{a.ownerName}</td>
                      <td className={tc.tdMuted}>
                        {a.proxyName ?? t("inPerson")}
                        {attachmentHref(a.proxyDocumentUrl) ? (
                          <a
                            href={attachmentHref(a.proxyDocumentUrl)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-xs text-primary hover:underline print:hidden"
                          >
                            {t("proxyDocument")}
                          </a>
                        ) : null}
                      </td>
                      <td className={tc.tdNum}>{Number(a.landShare).toLocaleString("tr-TR", { maximumFractionDigits: 6 })}</td>
                      <td className={`${tc.td} w-40`}>&nbsp;</td>
                      {canWrite && open ? (
                        <td className={`${tc.td} text-right print:hidden`}>
                          <ActionDrawerButton
                            action={removeMeetingAttendance}
                            hidden={{ id: m.id, attendanceId: a.id }}
                            icon={<Trash2 />}
                            tone="danger"
                            label={tCommon("action.delete")}
                            title={t("attendanceRemove")}
                            description={`${a.unitLabel} · ${a.ownerName}`}
                            submitLabel={tCommon("action.delete")}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {m.decisions.length > 0 ? (
        <Card className="mt-4 print:hidden">
          <CardHeader title={t("decisionsSection")} />
          <CardBody>
            <ul className="space-y-2">
              {m.decisions.map((d) => (
                <li key={d.id} className="rounded border border-border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-fg">
                      {d.decisionNo}. {d.title}
                    </span>
                    <Badge tone={d.passed ? "success" : "danger"}>
                      {d.passed ? t("passed") : t("rejected")}
                    </Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-fg-muted">{d.body}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
