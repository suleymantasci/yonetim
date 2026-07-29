import { getTranslations } from "next-intl/server";

import { announcementListResponse } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader } from "@yonetim/ui";

import { AnnouncementComposer } from "@/components/announcement-composer";
import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  await requirePermission("announcement:read");
  const t = await getTranslations("app.announcements");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const { rows } = await apiGet(
    "/v1/panel/communication/announcements",
    announcementListResponse,
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <AnnouncementComposer />

        <Card>
          <CardHeader
            title={t("publishedTitle")}
            description={tCommon("unit.record", { count: rows.length })}
          />
          <CardBody className="space-y-3">
            {rows.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t("noAnnouncements")}</p>
            ) : (
              rows.map((a) => (
                <article
                  key={a.id}
                  className="rounded border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-fg">{a.title}</h3>
                    {a.isUrgent ? (
                      <Badge tone="danger">{t("urgentBadge")}</Badge>
                    ) : null}
                    {a.kvkkFlagged ? (
                      <Badge tone="warning">{t("kvkkBadge")}</Badge>
                    ) : null}
                    <Badge tone="neutral">
                      {tEnum(`audience.${a.audience}`)}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm text-fg-muted">
                    {a.body}
                  </p>
                  <div className="mt-2 text-xs text-fg-subtle">
                    {a.publishedAt ? f.dateTime(a.publishedAt) : t("draft")} ·{" "}
                    {a.channels.map((c) => tEnum(`channel.${c}`)).join(", ")}
                  </div>
                </article>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
