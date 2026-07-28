import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { auditListResponse, AUDIT_SORT_KEYS } from "@yonetim/contracts";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
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
          {/*
           * Denetim kütüğü salt okunur: seçim, sıralama bağlantısı ve satır
           * aksiyonu yok. `DataTable` yine de kullanılıyor — yapışkan başlık,
           * yoğunluk tercihi ve mobil kart görünümü buradan geliyor ve altı
           * sütunlu bir kütüğü telefonda yana kaydırmak okunmuyordu.
           */}
          <DataTable
            rows={data.rows}
            caption={t("recordsTitle", { count: data.meta.total })}
            cardBreakpoint="lg"
            columns={[
              {
                key: "time",
                header: t("time"),
                primary: true,
                render: (row) => (
                  <span className="text-fg-muted">{f.dateTime(row.createdAt)}</span>
                ),
              },
              {
                key: "action",
                header: t("action"),
                render: (row) => (
                  <>
                    <Badge tone={row.action.includes("blocked") ? "danger" : "neutral"}>
                      {row.action}
                    </Badge>
                    {row.changeCount > 0 ? (
                      <span className="ml-2 text-xs text-fg-subtle">
                        {t("changedFields", { count: row.changeCount })}
                      </span>
                    ) : null}
                  </>
                ),
              },
              { key: "resource", header: t("resource"), render: (row) => row.resource },
              {
                key: "actor",
                header: t("actor"),
                render: (row) => (
                  <span className="text-fg-muted">
                    {row.actorName ?? t("systemActor")}
                    {/* Vekaleten işlem gizlenmiyor: kütüğün amacı tam da bu. */}
                    {row.impersonatedBy ? (
                      <Badge tone="warning">{t("impersonated")}</Badge>
                    ) : null}
                  </span>
                ),
              },
              {
                key: "ip",
                header: t("ip"),
                render: (row) => (
                  <span className="tabular-nums text-fg-muted">{row.ip ?? "—"}</span>
                ),
              },
              {
                key: "note",
                header: t("note"),
                className: "max-w-[280px] truncate",
                render: (row) => <span className="text-fg-muted">{row.reason ?? "—"}</span>,
              },
            ]}
            empty={<p className={tc.empty}>{t("noRecords")}</p>}
          />
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
            linkComponent={Link}
          />
        </CardBody>
      </Card>
    </>
  );
}
