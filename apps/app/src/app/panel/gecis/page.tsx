import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { migrationJobs, withTenant } from "@yonetim/db";
import { Badge, Card, CardBody, CardHeader } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { MigrationWizard } from "@/components/migration-wizard";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

/** Self-servis veri migration — SPEC Bölüm 3.11. */
export const dynamic = "force-dynamic";

export default async function MigrationPage() {
  const ctx = await requirePermission("unit:write");
  const t = await getTranslations("app.migration");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const jobs = await withTenant(ctx.tenantId, async (tx) =>
    tx.select().from(migrationJobs).orderBy(desc(migrationJobs.createdAt)).limit(20),
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <MigrationWizard />

        <Card>
          <CardHeader title={t("historyTitle")} />
          <CardBody className="space-y-2 text-sm">
            {jobs.length === 0 ? (
              <p className="text-fg-subtle">{t("noHistory")}</p>
            ) : (
              jobs.map((j) => (
                <div key={j.id} className="rounded border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-fg">
                      {tEnum(`migrationSource.${j.source}`)}
                    </span>
                    <Badge
                      tone={
                        j.status === "completed"
                          ? "success"
                          : j.status === "failed"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {tEnum(`jobStatus.${j.status}`)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-fg-subtle">
                    {t("importedRows", { imported: j.importedRows, total: j.totalRows })}
                    {j.skippedRows > 0 ? ` · ${t("skippedRows", { count: j.skippedRows })}` : ""} ·{" "}
                    {f.dateTime(j.createdAt)}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
