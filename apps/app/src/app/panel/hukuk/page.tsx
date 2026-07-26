import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { legalCases, withTenant } from "@yonetim/db";
import { findLegalActionCandidates } from "@yonetim/jobs";
import {
  Alert, Badge, Card, CardBody, CardHeader, EmptyState, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LegalPage() {
  const ctx = await requirePermission("legal:read");
  const t = await getTranslations("app.legal");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const cases = await withTenant(ctx.tenantId, async (tx) =>
    tx.select().from(legalCases).orderBy(desc(legalCases.openedAt)).limit(100),
  );
  const candidates = await findLegalActionCandidates(ctx.tenantId);

  const collected = cases.reduce((a, c) => a + c.collectedKurus, 0);
  const principal = cases.reduce((a, c) => a + c.principalKurus, 0);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { days: siteConfig.dues.legalActionThresholdDays })}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label={t("openCases")} value={String(cases.filter((c) => !c.closedAt).length)} />
        <Stat label={t("principal")} value={f.money(principal)} />
        <Stat label={t("collected")} value={f.money(collected)} tone="success" />
        <Stat
          label={t("candidates")}
          value={String(candidates.length)}
          tone={candidates.length ? "warning" : "neutral"}
        />
      </div>

      {candidates.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title={t("candidatesTitle")} description={t("candidatesDescription")} />
          <CardBody className="p-0">
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 560 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("unit")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("totalDebt")}</th>
                    <th scope="col" className={tc.th}>{t("oldestDue")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("recordCount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.unit_id} className={tc.tr}>
                      <td className={`${tc.td} font-mono text-xs`}>{c.unit_id.slice(0, 8)}</td>
                      <td className={tc.tdNum}>{f.money(Number(c.total_kurus))}</td>
                      <td className={tc.td}>
                        {c.oldest_due ? f.date(new Date(c.oldest_due)) : "—"}
                      </td>
                      <td className={tc.tdNum}>{c.debt_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader title={t("casesTitle")} />
        <CardBody className="p-0">
          {cases.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {cases.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <div className="font-medium text-fg">
                      {t("caseLabel", { no: c.caseNo ?? c.id.slice(0, 8) })} ·{" "}
                      {tEnum(`legalStage.${c.stage}`)}
                    </div>
                    <div className="text-xs text-fg-subtle">
                      {t("openedAt", { date: f.date(c.openedAt) })}
                      {c.nextActionAt
                        ? ` · ${t("nextAction", { date: f.date(c.nextActionAt) })}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.collectionScore !== null ? (
                      <Badge
                        tone={
                          c.collectionScore >= 66
                            ? "success"
                            : c.collectionScore >= 36
                              ? "warning"
                              : "danger"
                        }
                      >
                        {t("collectionScore", { score: c.collectionScore })}
                      </Badge>
                    ) : null}
                    <span className="font-semibold tabular-nums">
                      {f.money(
                        c.principalKurus + c.interestKurus + c.costsKurus - c.collectedKurus,
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="mt-4">
        <Alert tone="info" title={t("legalNoticeTitle")}>
          {t("legalNoticeBody")}
        </Alert>
      </div>
    </>
  );
}
