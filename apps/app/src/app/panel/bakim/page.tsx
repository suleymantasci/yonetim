import { asc, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import {
  MAINTENANCE_TEMPLATE_SEED, maintenanceRecords, maintenanceTemplates, withTenant,
} from "@yonetim/db";
import {
  Alert, Badge, Card, CardBody, CardHeader, EmptyState, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

/** Bakım takvimi — SPEC Bölüm 3.7. Şablon adları `maintenance.template.*` altındadır. */
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export default async function MaintenancePage() {
  const ctx = await requirePermission("maintenance:read");
  const t = await getTranslations("app.maintenance");
  const tLib = await getTranslations("maintenance");
  const f = await formatters();
  const now = Date.now();

  const data = await withTenant(ctx.tenantId, async (tx) => {
    const records = await tx
      .select()
      .from(maintenanceRecords)
      .where(isNull(maintenanceRecords.deletedAt))
      .orderBy(asc(maintenanceRecords.nextDueAt))
      .limit(200);
    const templates = await tx.select().from(maintenanceTemplates).limit(200);
    return { records, templates };
  });

  const library = data.templates.length > 0 ? data.templates : MAINTENANCE_TEMPLATE_SEED;
  const templateCode = new Map(
    data.templates.map((tpl) => [tpl.id, tpl.code] as const),
  );

  const overdue = data.records.filter((r) => r.nextDueAt.getTime() < now);
  const soon = data.records.filter((r) => {
    const diff = r.nextDueAt.getTime() - now;
    return diff >= 0 && diff <= 30 * DAY_MS;
  });
  const mandatoryCount = library.filter((tpl) => tpl.isMandatory).length;

  /** Şablon kodu varsa çeviriden, yoksa kayıttaki serbest metinden okur. */
  const labelFor = (code: string | undefined, fallback: string) =>
    code && tLib.has(`template.${code}.name`) ? tLib(`template.${code}.name`) : fallback;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("tracked")} value={String(data.records.length)} />
        <Stat
          label={t("overdue")}
          value={String(overdue.length)}
          tone={overdue.length ? "danger" : "success"}
        />
        <Stat
          label={t("within30Days")}
          value={String(soon.length)}
          tone={soon.length ? "warning" : "neutral"}
        />
      </div>

      {overdue.length > 0 ? (
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
            {data.records.length === 0 ? (
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
                      <th scope="col" className={tc.th}>{t("planTitle")}</th>
                      <th scope="col" className={tc.th}>{t("intervalDays", { days: "" })}</th>
                      <th scope="col" className={tc.th}>{t("within30Days")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.records.map((r) => {
                      const days = Math.round((r.nextDueAt.getTime() - now) / DAY_MS);
                      return (
                        <tr key={r.id} className={tc.tr}>
                          <td className={tc.td}>
                            <div className="font-medium text-fg">
                              {labelFor(templateCode.get(r.templateId ?? ""), r.label)}
                            </div>
                            {r.location ? (
                              <div className="text-xs text-fg-subtle">{r.location}</div>
                            ) : null}
                          </td>
                          <td className={tc.tdMuted}>
                            {t("intervalLabel", { days: r.intervalDays })}
                          </td>
                          <td className={tc.td}>
                            <div className="text-xs text-fg-muted">{f.date(r.nextDueAt)}</div>
                            <Badge tone={days < 0 ? "danger" : days <= 30 ? "warning" : "neutral"}>
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
              mandatory: mandatoryCount,
            })}
          />
          <CardBody className="max-h-[560px] space-y-2 overflow-y-auto">
            {library.map((tpl) => (
              <div key={tpl.code} className="rounded border border-border p-2 text-sm">
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
