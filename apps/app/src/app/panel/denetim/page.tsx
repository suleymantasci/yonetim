import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { auditListResponse, AUDIT_SORT_KEYS } from "@yonetim/contracts";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Pagination,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ListControls } from "@/components/list/list-controls";
import { toListQuery } from "@/lib/api/list";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import {
  buildListHref,
  pageRange,
  parseListParams,
  type SearchParamsInput,
} from "@/lib/list-params";

export const dynamic = "force-dynamic";

/**
 * Denetim kütüğü — salt okunur.
 *
 * Ekran hiçbir kaydı gizleyemez, düzenleyemez ve sıralamasını bozamaz: kütük
 * append-only (DB trigger'ı UPDATE/DELETE'i engelliyor) ve API'de yazma ucu
 * yok. A4 öncesi bu sayfa son 200 satırı sayfalamasız çekiyordu; artık
 * sayfalama ve filtre sunucuda, dolayısıyla saklama süresi boyunca biriken
 * kayıtların tamamına erişilebiliyor.
 */
export default async function AuditPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  await requirePermission("audit:read");
  const t = await getTranslations("app.audit");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const params = parseListParams(await searchParams, {
    sortableKeys: AUDIT_SORT_KEYS,
    defaultSort: "createdAt",
    filterKeys: ["eylem", "kaynak"],
  });

  const data = await apiGet(
    `/v1/panel/audit?${toListQuery(params, {
      action: params.filters.eylem,
      resource: params.filters.kaynak,
    })}`,
    auditListResponse,
  );
  const { from, to, pageCount } = pageRange(params, data.meta.total);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { days: data.retentionDays })}
      />

      <div className="mb-4">
        <Alert tone="info">{t("appendOnlyNote")}</Alert>
      </div>

      <ListControls
        searchPlaceholder={t("searchPlaceholder")}
        filters={[
          {
            param: "eylem",
            label: t("action"),
            value: params.filters.eylem ?? "",
            options: [
              { value: "", label: t("allActions") },
              ...data.facets.actions.map((a) => ({
                value: a.id,
                label: a.count ? `${a.label} (${a.count})` : a.label,
              })),
            ],
          },
          {
            param: "kaynak",
            label: t("resource"),
            value: params.filters.kaynak ?? "",
            options: [
              { value: "", label: t("allResources") },
              ...data.facets.resources.map((r) => ({
                value: r.id,
                label: r.count ? `${r.label} (${r.count})` : r.label,
              })),
            ],
          },
        ]}
      />

      <Card>
        <CardHeader title={t("recordsTitle", { count: data.meta.total })} />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table} style={{ minWidth: 860 }}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>
                    {t("time")}
                  </th>
                  <th scope="col" className={tc.th}>
                    {t("action")}
                  </th>
                  <th scope="col" className={tc.th}>
                    {t("resource")}
                  </th>
                  <th scope="col" className={tc.th}>
                    {t("actor")}
                  </th>
                  <th scope="col" className={tc.th}>
                    {t("ip")}
                  </th>
                  <th scope="col" className={tc.th}>
                    {t("note")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={tc.empty}>
                      {t("noRecords")}
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => (
                    <tr key={row.id} className={tc.tr}>
                      <td className={tc.tdMuted}>
                        {f.dateTime(row.createdAt)}
                      </td>
                      <td className={tc.td}>
                        <Badge
                          tone={
                            row.action.includes("blocked")
                              ? "danger"
                              : "neutral"
                          }
                        >
                          {row.action}
                        </Badge>
                        {row.changeCount > 0 ? (
                          <span className="ml-2 text-xs text-fg-subtle">
                            {t("changedFields", { count: row.changeCount })}
                          </span>
                        ) : null}
                      </td>
                      <td className={tc.td}>{row.resource}</td>
                      <td className={tc.tdMuted}>
                        {row.actorName ?? t("systemActor")}
                        {/* Vekaleten işlem gizlenmiyor: kütüğün amacı tam da bu. */}
                        {row.impersonatedBy ? (
                          <Badge tone="warning">{t("impersonated")}</Badge>
                        ) : null}
                      </td>
                      <td className={`${tc.tdMuted} tabular-nums`}>
                        {row.ip ?? "—"}
                      </td>
                      <td className={`${tc.tdMuted} max-w-[280px] truncate`}>
                        {row.reason ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={params.page}
            pageCount={pageCount}
            total={data.meta.total}
            hrefFor={(page) =>
              buildListHref("/panel/denetim", params, { sayfa: page })
            }
            labels={{
              previous: tCommon("action.previous"),
              next: tCommon("action.next"),
              summary: tCommon("state.showing", {
                from,
                to,
                total: data.meta.total,
              }),
            }}
            linkComponent={Link as never}
          />
        </CardBody>
      </Card>
    </>
  );
}
