import { getTranslations } from "next-intl/server";

import { migrationListResponse } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { MigrationWizard } from "@/components/migration-wizard";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

/** Self-servis veri migration — SPEC Bölüm 3.11. */
export const dynamic = "force-dynamic";

export default async function MigrationPage() {
  await requirePermission("unit:write");
  const t = await getTranslations("app.migration");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const { rows: jobs } = await apiGet(
    "/v1/panel/migrations",
    migrationListResponse,
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid grid-cols-1 gap-4">
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
                    {t("importedRows", {
                      imported: j.importedRows,
                      total: j.totalRows,
                    })}
                    {j.skippedRows > 0
                      ? ` · ${t("skippedRows", { count: j.skippedRows })}`
                      : ""}{" "}
                    · {f.dateTime(j.createdAt)}
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
