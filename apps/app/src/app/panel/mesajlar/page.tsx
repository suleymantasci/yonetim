import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { messages, withTenant } from "@yonetim/db";
import { Badge, Card, CardBody, CardHeader, EmptyState, Stat } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const ctx = await requirePermission("message:read");
  const t = await getTranslations("app.messages");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const rows = await withTenant(ctx.tenantId, async (tx) =>
    tx.select().from(messages).orderBy(desc(messages.createdAt)).limit(150),
  );

  const inbound = rows.filter((m) => m.direction === "in");
  const botHandled = inbound.filter((m) => m.handledByBot);
  const needsHuman = inbound.filter((m) => !m.handledByBot);
  const botRate = inbound.length ? botHandled.length / inbound.length : 0;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("inbound")} value={String(inbound.length)} />
        <Stat
          label={t("botRate")}
          value={f.percent(botRate)}
          tone={botRate >= 0.9 ? "success" : "warning"}
        />
        <Stat
          label={t("needsHuman")}
          value={String(needsHuman.length)}
          tone={needsHuman.length ? "warning" : "success"}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title={t("conversation")} />
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((m) => (
                <li key={m.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={m.direction === "in" ? "info" : "neutral"}>
                      {tEnum(`direction.${m.direction}`)}
                    </Badge>
                    <Badge tone="neutral">{tEnum(`channel.${m.channel}`)}</Badge>
                    {m.intent ? (
                      <Badge tone={m.handledByBot ? "success" : "warning"}>
                        {tEnum(`intent.${m.intent}`)}
                        {m.intentConfidence ? ` · ${Number(m.intentConfidence).toFixed(2)}` : ""}
                      </Badge>
                    ) : null}
                    <span className="ml-auto text-xs text-fg-subtle">
                      {f.dateTime(m.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-fg-muted">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
