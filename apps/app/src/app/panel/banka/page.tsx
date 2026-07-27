import { getTranslations } from "next-intl/server";

import { bankOverviewResponse } from "@yonetim/contracts";
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

export const dynamic = "force-dynamic";

export default async function BankPage() {
  await requirePermission("bank:read");
  const t = await getTranslations("app.bank");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  // IBAN yalnız maskeli geliyor; eşleştirme blind index ile sunucuda (§9.1).
  const {
    accounts,
    transactions: txs,
    issues,
    totals,
  } = await apiGet("/v1/panel/bank", bankOverviewResponse);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("accounts")} value={String(accounts.length)} />
        <Stat
          label={t("unmatched")}
          value={String(totals.unmatched)}
          tone={totals.unmatched ? "warning" : "success"}
        />
        <Stat
          label={t("openIssues")}
          value={String(totals.openIssues)}
          tone={totals.openIssues ? "danger" : "success"}
        />
      </div>

      {issues.length > 0 ? (
        <div className="mt-4 space-y-2">
          {issues.slice(0, 5).map((i) => (
            <Alert
              key={i.id}
              tone={i.severity === "critical" ? "danger" : "warning"}
            >
              <strong>{t(`issue.${i.kind}`)}</strong>
              {" — "}
              {t("issueLine", {
                expected: f.money(i.expectedMinor),
                actual: f.money(i.actualMinor),
              })}
            </Alert>
          ))}
        </div>
      ) : null}

      <Card className="mt-4">
        <CardHeader title={t("recentTransactions")} />
        <CardBody className="p-0">
          {txs.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 640 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>
                      {t("date")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("counterparty")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("descriptionColumn")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("match")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("amount")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((x) => (
                    <tr key={x.id} className={tc.tr}>
                      <td className={tc.tdMuted}>
                        {f.dateTime(x.transactionAt)}
                      </td>
                      <td className={tc.td}>{x.counterparty ?? "—"}</td>
                      <td className={`${tc.tdMuted} max-w-[280px] truncate`}>
                        {x.description ?? "—"}
                      </td>
                      <td className={tc.td}>
                        <Badge
                          tone={
                            x.matchStatus === "auto" ||
                            x.matchStatus === "manual"
                              ? "success"
                              : x.matchStatus === "ignored"
                                ? "neutral"
                                : "warning"
                          }
                        >
                          {tEnum(`matchStatus.${x.matchStatus}`)}
                        </Badge>
                      </td>
                      <td
                        className={`${tc.tdNum} ${x.direction === "in" ? "text-success-fg" : ""}`}
                      >
                        {x.direction === "in" ? "+" : "−"}
                        {f.money(x.amountMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
