import { desc, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { daysBetween } from "@yonetim/core";
import { documents, withTenant } from "@yonetim/db";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const ctx = await requirePermission("document:read");
  const t = await getTranslations("app.documents");
  const tEnum = await getTranslations("enum");
  const f = await formatters();
  const now = new Date();

  const rows = await withTenant(ctx.tenantId, async (tx) =>
    tx
      .select()
      .from(documents)
      .where(isNull(documents.deletedAt))
      .orderBy(desc(documents.createdAt))
      .limit(200),
  );

  const expiring = rows.filter((d) => d.expiresAt && daysBetween(now, d.expiresAt) <= 30);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {expiring.length > 0 ? (
        <div className="mb-4">
          <Alert tone="warning" title={t("expiringTitle")}>
            {t("expiringBody", { count: expiring.length })}
          </Alert>
        </div>
      ) : null}

      <Card>
        <CardHeader title={t("countTitle", { count: rows.length })} />
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
              {rows.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-fg">{d.title}</div>
                    <div className="text-xs text-fg-subtle">
                      {tEnum(`documentCategory.${d.category}`)} · v{d.version} · {f.date(d.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{tEnum(`documentVisibility.${d.visibility}`)}</Badge>
                    {d.expiresAt ? (
                      <Badge tone={daysBetween(now, d.expiresAt) <= 30 ? "warning" : "neutral"}>
                        {t("validUntil", { date: f.date(d.expiresAt) })}
                      </Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
