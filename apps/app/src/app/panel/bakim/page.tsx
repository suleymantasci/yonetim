import { getTranslations } from "next-intl/server";

import { maintenanceListResponse } from "@yonetim/contracts";
import {
  Alert,
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

/** Bakım takvimi — SPEC Bölüm 3.7. Şablon adları `maintenance.template.*` altındadır. */
export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  await requirePermission("maintenance:read");
  const t = await getTranslations("app.maintenance");
  const tLib = await getTranslations("maintenance");
  const f = await formatters();

  // "Gecikti mi" ve "kaç gün kaldı" sunucu saatine göre hesaplanıyor; yasal
  // şablon kütüphanesi de site kendi şablonlarını tanımlamadıysa API'den
  // tohum liste olarak geliyor (MIMARI-PLAN §9a).
  const {
    records,
    templates: library,
    totals,
  } = await apiGet("/v1/panel/operations/bakim", maintenanceListResponse);

  /** Şablon kodu varsa çeviriden, yoksa kayıttaki serbest metinden okur. */
  const labelFor = (code: string | null, fallback: string) =>
    code && tLib.has(`template.${code}.name`)
      ? tLib(`template.${code}.name`)
      : fallback;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("tracked")} value={String(totals.tracked)} />
        <Stat
          label={t("overdue")}
          value={String(totals.overdue)}
          tone={totals.overdue ? "danger" : "success"}
        />
        <Stat
          label={t("within30Days")}
          value={String(totals.soon)}
          tone={totals.soon ? "warning" : "neutral"}
        />
      </div>

      {totals.overdue > 0 ? (
        <div className="mt-4">
          <Alert tone="danger" title={t("overdueAlertTitle")}>
            {t("overdueAlertBody")}
          </Alert>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={t("planTitle")} />
          <CardBody className="p-0">
            {records.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title={t("emptyTitle")}
                  description={t("emptyDescription")}
                  steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
                />
              </div>
            ) : (
              <div className={tc.wrapper}>
                <table className={tc.table} style={{ minWidth: 520 }}>
                  <thead className={tc.thead}>
                    <tr>
                      <th scope="col" className={tc.th}>
                        {t("planTitle")}
                      </th>
                      <th scope="col" className={tc.th}>
                        {t("intervalDays", { days: "" })}
                      </th>
                      <th scope="col" className={tc.th}>
                        {t("within30Days")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => {
                      const days = r.daysUntilDue;
                      return (
                        <tr key={r.id} className={tc.tr}>
                          <td className={tc.td}>
                            <div className="font-medium text-fg">
                              {labelFor(r.templateCode, r.label)}
                            </div>
                            {r.location ? (
                              <div className="text-xs text-fg-subtle">
                                {r.location}
                              </div>
                            ) : null}
                          </td>
                          <td className={tc.tdMuted}>
                            {t("intervalLabel", { days: r.intervalDays })}
                          </td>
                          <td className={tc.td}>
                            <div className="text-xs text-fg-muted">
                              {f.date(r.nextDueAt)}
                            </div>
                            <Badge
                              tone={
                                days < 0
                                  ? "danger"
                                  : days <= 30
                                    ? "warning"
                                    : "neutral"
                              }
                            >
                              {days < 0
                                ? t("daysOverdue", { days: Math.abs(days) })
                                : t("daysRemaining", { days })}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={t("libraryTitle")}
            description={t("libraryDescription", {
              total: library.length,
              mandatory: totals.mandatory,
            })}
          />
          <CardBody className="max-h-[560px] space-y-2 overflow-y-auto">
            {library.map((tpl) => (
              <div
                key={tpl.code}
                className="rounded border border-border p-2 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-fg">
                    {tLib(`template.${tpl.code}.name`)}
                  </span>
                  <Badge tone={tpl.isMandatory ? "danger" : "neutral"}>
                    {tpl.isMandatory ? t("mandatory") : t("recommended")}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-fg-subtle">
                  {tLib(`equipment.${tpl.equipmentType}`)} ·{" "}
                  {t("intervalDays", { days: tpl.intervalDays })}
                </div>
                {tLib.has(`template.${tpl.code}.ref`) ? (
                  <div className="mt-1 text-xs text-fg-muted">
                    {tLib(`template.${tpl.code}.ref`)}
                  </div>
                ) : null}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
