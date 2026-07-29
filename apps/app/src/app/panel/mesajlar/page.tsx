import { Send } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { messageListResponse } from "@yonetim/contracts";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Stat,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const ctx = await requirePermission("message:read");
  const t = await getTranslations("app.messages");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const { rows, totals } = await apiGet(
    "/v1/panel/communication/messages",
    messageListResponse,
  );
  const botRate = totals.botRatePct / 100;

  const newMessageButton = hasPermission(ctx.roles, "message:write") ? (
    <Link
      href="/panel/mesajlar/yeni"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
    >
      <Send aria-hidden className="h-4 w-4" />
      {t("newMessage")}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={newMessageButton}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("inbound")} value={String(totals.inbound)} />
        <Stat
          label={t("botRate")}
          value={f.percent(botRate)}
          tone={botRate >= 0.9 ? "success" : "warning"}
        />
        <Stat
          label={t("needsHuman")}
          value={String(totals.needsHuman)}
          tone={totals.needsHuman ? "warning" : "success"}
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
                action={newMessageButton ?? undefined}
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
                    <Badge tone="neutral">
                      {tEnum(`channel.${m.channel}`)}
                    </Badge>
                    {m.intent ? (
                      <Badge tone={m.handledByBot ? "success" : "warning"}>
                        {tEnum(`intent.${m.intent}`)}
                        {m.intentConfidence
                          ? ` · ${Number(m.intentConfidence).toFixed(2)}`
                          : ""}
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
