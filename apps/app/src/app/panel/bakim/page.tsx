import { Pencil, Plus } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
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
import { MaintenanceHistory } from "./maintenance-history";

/** Bakım takvimi — SPEC Bölüm 3.7. Şablon adları `maintenance.template.*` altındadır. */
export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const ctx = await requirePermission("maintenance:read");
  const t = await getTranslations("app.maintenance");
  const tLib = await getTranslations("maintenance");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  // "Gecikti mi" ve "kaç gün kaldı" sunucu saatine göre hesaplanıyor; yasal
  // şablon kütüphanesi de site kendi şablonlarını tanımlamadıysa API'den
  // tohum liste olarak geliyor (MIMARI-PLAN §9a).
  const {
    records,
    templates: library,
    recentLogs,
    totals,
  } = await apiGet("/v1/panel/operations/maintenance", maintenanceListResponse);

  /** Şablon kodu varsa çeviriden, yoksa kayıttaki serbest metinden okur. */
  const labelFor = (code: string | null, fallback: string) =>
    code && tLib.has(`template.${code}.name`)
      ? tLib(`template.${code}.name`)
      : fallback;

  const canWrite = hasPermission(ctx.roles, "maintenance:write");
  const newRecordButton = canWrite ? (
    <Link
      href="/panel/bakim/yeni"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
    >
      <Plus aria-hidden className="h-4 w-4" />
      {t("newRecord")}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={newRecordButton}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
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
                  action={newRecordButton}
                />
              </div>
            ) : (
              <>
                {/* Telefon: kart listesi. 520 px'lik tablo dar ekranda yatay
                  kaydırma istiyordu; vade ve son bakım bir bakışta okunmalı. */}
                <ul className="divide-y divide-border sm:hidden">
                  {records.map((r) => {
                    const days = r.daysUntilDue;
                    const body = (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-fg [overflow-wrap:anywhere]">
                              {labelFor(r.templateCode, r.label)}
                            </div>
                            {r.location ? (
                              <div className="text-xs text-fg-subtle">
                                {r.location}
                              </div>
                            ) : null}
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
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-muted">
                          <span>{f.date(r.nextDueAt)}</span>
                          <span>
                            {t("intervalLabel", { days: r.intervalDays })}
                          </span>
                          <span>
                            {r.lastDoneAt
                              ? t("lastDoneShort", {
                                  date: f.date(r.lastDoneAt),
                                })
                              : t("neverDoneShort")}
                          </span>
                        </div>
                      </>
                    );
                    return (
                      <li key={r.id}>
                        {canWrite ? (
                          <Link
                            href={`/panel/bakim/${r.id}/duzenle`}
                            className="block px-4 py-3 hover:bg-hover"
                          >
                            {body}
                          </Link>
                        ) : (
                          <div className="px-4 py-3">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className={`${tc.wrapper} hidden sm:block`}>
                  <table className={tc.table} style={{ minWidth: 520 }}>
                    <thead className={tc.thead}>
                      <tr>
                        <th scope="col" className={tc.th}>
                          {t("planTitle")}
                        </th>
                        <th scope="col" className={tc.th}>
                          {t("colInterval")}
                        </th>
                        <th scope="col" className={tc.th}>
                          {t("colNextDue")}
                        </th>
                        {canWrite ? (
                          <th scope="col" className={`${tc.th} w-10`}>
                            <span className="sr-only">
                              {tCommon("action.edit")}
                            </span>
                          </th>
                        ) : null}
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
                              <div className="text-xs text-fg-subtle">
                                {r.lastDoneAt
                                  ? t("lastDoneShort", {
                                      date: f.date(r.lastDoneAt),
                                    })
                                  : t("neverDoneShort")}
                              </div>
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
                            {canWrite ? (
                              <td className={tc.td}>
                                <Link
                                  href={`/panel/bakim/${r.id}/duzenle`}
                                  aria-label={tCommon("action.edit")}
                                  className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg"
                                >
                                  <Pencil aria-hidden className="h-3.5 w-3.5" />
                                </Link>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
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

      <Card className="mt-4">
        <CardHeader
          title={t("recentTitle")}
          description={t("recentDescription")}
        />
        <CardBody>
          <MaintenanceHistory rows={recentLogs} showRecord />
        </CardBody>
      </Card>
    </>
  );
}
