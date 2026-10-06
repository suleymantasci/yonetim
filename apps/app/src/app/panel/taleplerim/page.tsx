import { Plus } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { portalRequestsResponse } from "@yonetim/contracts";
import {
  Badge, Card, CardBody, EmptyState, pageActionClasses, tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

/**
 * "Taleplerim" — sakinin kendi açtığı arıza/istek kayıtları.
 *
 * Liste `created_by_user_id` ile sınırlı; yönetimin `/panel/talepler` ekranı
 * site genelini gösteriyor ve `request:read` istiyor. Sakinde yalnız
 * `request:read_own` var.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.myRequests");
  return { title: t("title") };
}

/** Açık sayılan durumlar — rozet rengi ve "çözüldü mü" ayrımı için. */
const CLOSED = new Set(["resolved", "closed", "rejected"]);

export default async function MyRequestsPage() {
  await requirePermission("request:read_own");
  const t = await getTranslations("app.myRequests");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const { rows } = await apiGet("/v1/panel/portal/requests", portalRequestsResponse);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/panel/taleplerim/yeni" className={pageActionClasses.primary}>
            <Plus aria-hidden className="h-4 w-4" />
            {t("new")}
          </Link>
        }
      />

      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                action={
                  <Link href="/panel/taleplerim/yeni" className={pageActionClasses.primary}>
                    {t("new")}
                  </Link>
                }
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th className={tc.th}>{t("col.code")}</th>
                    <th className={tc.th}>{t("col.title")}</th>
                    <th className={tc.th}>{t("col.category")}</th>
                    <th className={tc.th}>{t("col.createdAt")}</th>
                    <th className={tc.th}>{t("col.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={tc.tr}>
                      <td className={tc.tdMuted}>
                        <Link
                          href={`/panel/taleplerim/${r.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.code}
                        </Link>
                      </td>
                      <td className={tc.td}>
                        {r.title}
                        {r.commentCount > 0 ? (
                          <span className="ml-2 text-xs text-fg-subtle">
                            {t("commentCount", { count: r.commentCount })}
                          </span>
                        ) : null}
                      </td>
                      <td className={tc.tdMuted}>
                        {tEnum(`requestCategory.${r.category}`)}
                      </td>
                      <td className={tc.tdMuted}>{f.date(r.createdAt)}</td>
                      <td className={tc.td}>
                        <Badge tone={CLOSED.has(r.status) ? "success" : "info"}>
                          {tEnum(`requestStatus.${r.status}`)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
