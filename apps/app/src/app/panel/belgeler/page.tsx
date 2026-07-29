import { getTranslations } from "next-intl/server";

import { documentListResponse } from "@yonetim/contracts";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
} from "@yonetim/ui";

import { hasPermission } from "@yonetim/auth/guard";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { DocumentRowActions } from "./row-actions";
import { UploadPanel } from "./upload-panel";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const ctx = await requirePermission("document:read");
  const t = await getTranslations("app.documents");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  // "Süresi doluyor" sunucu saatine göre hesaplanıyor (MIMARI-PLAN §9a).
  const { rows, totals, uploadEnabled } = await apiGet(
    "/v1/panel/documents",
    documentListResponse,
  );
  const canWrite = hasPermission(ctx.roles, "document:write");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {canWrite ? (
        <Card className="mb-4">
          <CardBody>
            <UploadPanel enabled={uploadEnabled} />
          </CardBody>
        </Card>
      ) : null}

      {totals.expiringSoon > 0 ? (
        <div className="mb-4">
          <Alert tone="warning" title={t("expiringTitle")}>
            {t("expiringBody", { count: totals.expiringSoon })}
          </Alert>
        </div>
      ) : null}

      <Card>
        <CardHeader title={t("countTitle", { count: totals.total })} />
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
                      {tEnum(`documentCategory.${d.category}`)} · v{d.version} ·{" "}
                      {f.date(d.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">
                      {tEnum(`documentVisibility.${d.visibility}`)}
                    </Badge>
                    <DocumentRowActions id={d.id} canWrite={canWrite} />
                    {d.expiresAt ? (
                      <Badge
                        tone={
                          d.expiringSoon
                            ? "warning"
                            : d.expired
                              ? "danger"
                              : "neutral"
                        }
                      >
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
