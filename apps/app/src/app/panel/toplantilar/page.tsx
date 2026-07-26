import { desc, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { meetingDecisions, meetings, withTenant } from "@yonetim/db";
import { type QuorumRule } from "@yonetim/dues";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const ctx = await requirePermission("meeting:read");
  const t = await getTranslations("app.meetings");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const data = await withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(meetings)
      .where(isNull(meetings.deletedAt))
      .orderBy(desc(meetings.scheduledAt))
      .limit(30);
    const decisions = await tx.select().from(meetingDecisions).limit(200);
    return { rows, decisions };
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {data.rows.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
        />
      ) : (
        <div className="space-y-4">
          {data.rows.map((m) => {
            const decisions = data.decisions.filter((d) => d.meetingId === m.id);
            const agenda = m.agenda as string[];
            return (
              <Card key={m.id}>
                <CardHeader
                  title={m.title}
                  description={`${f.dateTime(m.scheduledAt)}${m.location ? ` · ${m.location}` : ""}`}
                  action={
                    m.quorumMet === null ? (
                      <Badge tone="neutral">{t("planned")}</Badge>
                    ) : m.quorumMet ? (
                      <Badge tone="success">{t("quorumMet")}</Badge>
                    ) : (
                      <Badge tone="danger">{t("quorumFailed")}</Badge>
                    )
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
                        <li key={d.id} className="rounded border border-border p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-fg">
                              {d.decisionNo}. {d.title}
                            </span>
                            <Badge tone={d.passed ? "success" : "danger"}>
                              {d.passed ? t("passed") : t("rejected")}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-fg-subtle">
                            {tEnum(`quorumRule.${d.quorumRule as QuorumRule}`)} ·{" "}
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
