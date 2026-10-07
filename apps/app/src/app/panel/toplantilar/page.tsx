import { Pencil, Plus } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { meetingListResponse } from "@yonetim/contracts";
import { type QuorumRule } from "@yonetim/dues";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const ctx = await requirePermission("meeting:read");
  const t = await getTranslations("app.meetings");
  const tEnum = await getTranslations("enum");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  // Kararlar toplantıya gömülü geliyor: karar defteri toplantıdan ayrı
  // anlam taşımıyor, iki uca bölmek ekranı iki çağrıya çıkarırdı.
  const { rows } = await apiGet(
    "/v1/panel/communication/meetings",
    meetingListResponse,
  );

  const canWrite = hasPermission(ctx.roles, "meeting:write");
  const newMeetingButton = canWrite ? (
    <Link
      href="/panel/toplantilar/yeni"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
    >
      <Plus aria-hidden className="h-4 w-4" />
      {t("newMeeting")}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={newMeetingButton}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
          action={newMeetingButton ?? undefined}
        />
      ) : (
        <div className="space-y-4">
          {rows.map((m) => {
            const decisions = m.decisions;
            const agenda = m.agenda as string[];
            return (
              <Card key={m.id}>
                <CardHeader
                  title={m.title}
                  description={`${f.dateTime(m.scheduledAt)}${m.location ? ` · ${m.location}` : ""}`}
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      {m.status !== "planned" ? (
                        <Badge tone={m.status === "held" ? "success" : m.status === "cancelled" ? "danger" : "warning"}>
                          {tEnum(`meetingStatus.${m.status}` as never)}
                        </Badge>
                      ) : null}
                      {m.status !== "cancelled" && !m.noticeSentAt ? (
                        <Badge tone="warning">{t("noticeMissingBadge")}</Badge>
                      ) : null}
                      {m.quorumMet === null ? (
                        <Badge tone="neutral">{t("planned")}</Badge>
                      ) : m.quorumMet ? (
                        <Badge tone="success">{t("quorumMet")}</Badge>
                      ) : (
                        <Badge tone="danger">{t("quorumFailed")}</Badge>
                      )}
                      <Link
                        href={`/panel/toplantilar/${m.id}`}
                        className="inline-flex h-8 items-center rounded-lg border border-border-strong px-2.5 text-xs font-semibold text-fg hover:bg-hover"
                      >
                        {t("detail")}
                      </Link>
                      {canWrite ? (
                        <Link
                          href={`/panel/toplantilar/${m.id}/duzenle`}
                          aria-label={tCommon("action.edit")}
                          className="-my-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg [&_svg]:pointer-events-none"
                        >
                          <Pencil aria-hidden className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                    </div>
                  }
                />
                <CardBody className="space-y-2 text-sm">
                  <div>
                    <span className="text-fg-subtle">{t("agenda")}: </span>
                    {agenda.length > 0 ? agenda.join(" · ") : t("noAgenda")}
                  </div>
                  {decisions.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {decisions.map((d) => (
                        <li
                          key={d.id}
                          className="rounded border border-border p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-fg">
                              {d.decisionNo}. {d.title}
                            </span>
                            <Badge tone={d.passed ? "success" : "danger"}>
                              {d.passed ? t("passed") : t("rejected")}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-fg-subtle">
                            {tEnum(`quorumRule.${d.quorumRule as QuorumRule}`)}{" "}
                            ·{" "}
                            {t("voteSummary", {
                              for: d.votesFor,
                              against: d.votesAgainst,
                              abstain: d.abstentions,
                            })}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-fg-subtle">{t("noDecisions")}</p>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
