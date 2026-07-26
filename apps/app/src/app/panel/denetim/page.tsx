import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { auditLogs, withTenant } from "@yonetim/db";
import { Alert, Badge, Card, CardBody, CardHeader, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const ctx = await requirePermission("audit:read");
  const t = await getTranslations("app.audit");
  const f = await formatters();

  const rows = await withTenant(ctx.tenantId, async (tx) =>
    tx.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200),
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { days: siteConfig.legal.logRetentionDays })}
      />

      <div className="mb-4">
        <Alert tone="info">{t("appendOnlyNote")}</Alert>
      </div>

      <Card>
        <CardHeader title={t("recordsTitle", { count: rows.length })} />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table} style={{ minWidth: 720 }}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>{t("time")}</th>
                  <th scope="col" className={tc.th}>{t("action")}</th>
                  <th scope="col" className={tc.th}>{t("resource")}</th>
                  <th scope="col" className={tc.th}>{t("ip")}</th>
                  <th scope="col" className={tc.th}>{t("note")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={tc.empty}>
                      {t("noRecords")}
                    </td>
                  </tr>
                ) : (
                  rows.map((l) => (
                    <tr key={l.id} className={tc.tr}>
                      <td className={tc.tdMuted}>{f.dateTime(l.createdAt)}</td>
                      <td className={tc.td}>
                        <Badge tone={l.action.includes("blocked") ? "danger" : "neutral"}>
                          {l.action}
                        </Badge>
                      </td>
                      <td className={tc.td}>{l.resource}</td>
                      <td className={`${tc.tdMuted} tabular-nums`}>{l.ip ?? "—"}</td>
                      <td className={`${tc.tdMuted} max-w-[280px] truncate`}>{l.reason ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
