import { Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { siteConfig } from "@yonetim/config";
import { requestListResponse } from "@yonetim/contracts";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Stat,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

const PRIORITY_TONE = {
  critical: "danger",
  high: "warning",
  normal: "neutral",
  low: "info",
} as const;

export default async function RequestsPage() {
  const ctx = await requirePermission("request:read");
  const t = await getTranslations("app.requests");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  // SLA sayaçları ve "aşıldı mı" işareti sunucudan geliyor: karşılaştırmanın
  // ölçütü sunucu saati olmalı (MIMARI-PLAN §9a).
  const { rows, totals } = await apiGet(
    "/v1/panel/operations/requests",
    requestListResponse,
  );

  const newRequestButton = hasPermission(ctx.roles, "request:write") ? (
    <Link
      href="/panel/talepler/yeni"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
    >
      <Plus aria-hidden className="h-4 w-4" />
      {t("newRequest")}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", {
          critical: siteConfig.sla.critical.hours,
          high: siteConfig.sla.high.hours,
          normal: siteConfig.sla.normal.hours,
        })}
        action={newRequestButton}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label={t("open")} value={String(totals.open)} />
        <Stat
          label={t("slaBreached")}
          value={String(totals.breached)}
          tone={totals.breached ? "danger" : "success"}
        />
        <Stat label={t("resolved")} value={String(totals.resolved)} />
        <Stat
          label={t("avgResolution")}
          value={t("avgResolutionValue", { hours: totals.avgResolutionHours })}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title={t("listTitle")} />
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
                action={newRequestButton}
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 760 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>
                      {t("code")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("subject")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("category")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("priority")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("status")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("sla")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("cost")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    return (
                      <tr key={r.id} className={tc.tr}>
                        <td className={`${tc.td} font-mono text-xs`}>
                          {/* Kod bağlantı: satırın tamamını tıklanabilir yapmak
                              kopyalanabilir metni (başlık, tutar) seçilemez
                              hale getiriyordu. */}
                          <Link
                            href={`/panel/talepler/${r.id}`}
                            className="text-primary hover:underline"
                          >
                            {r.code}
                          </Link>
                        </td>
                        <td className={tc.td}>{r.title}</td>
                        <td className={tc.tdMuted}>
                          {tEnum(`requestCategory.${r.category}`)}
                        </td>
                        <td className={tc.td}>
                          <Badge tone={PRIORITY_TONE[r.priority]}>
                            {tEnum(`requestPriority.${r.priority}`)}
                          </Badge>
                        </td>
                        <td className={tc.td}>
                          {tEnum(`requestStatus.${r.status}`)}
                        </td>
                        <td className={`${tc.td} text-xs`}>
                          {r.slaDueAt ? (
                            r.slaBreached ? (
                              <Badge tone="danger">
                                {t("slaExceeded", {
                                  date: f.dateTime(r.slaDueAt),
                                })}
                              </Badge>
                            ) : (
                              f.dateTime(r.slaDueAt)
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={tc.tdNum}>{f.money(r.costMinor)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
