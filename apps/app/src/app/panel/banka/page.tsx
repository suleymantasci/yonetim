import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
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
  const ctx = await requirePermission("bank:read");
  const t = await getTranslations("app.bank");
  const tEnum = await getTranslations("enum");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  // IBAN yalnız maskeli geliyor; eşleştirme blind index ile sunucuda (§9.1).
  const {
    accounts,
    transactions: txs,
    issues,
    totals,
  } = await apiGet("/v1/panel/bank", bankOverviewResponse);

  const canWrite = hasPermission(ctx.roles, "bank:write");
  const newAccountButton = canWrite ? (
    <Link
      href="/panel/banka/hesap/yeni"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
    >
      <Plus aria-hidden className="h-4 w-4" />
      {t("newAccount")}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={newAccountButton}
      />

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

      {/*
        Hesap listesi hareketlerden **ayrı** kart: modülün girişi burası ve
        hiç hesap tanımlanmamışsa ekranın geri kalanı zaten boş kalıyor.
        Boş listeyi hareketlerin arasına gömmek, "neden hiçbir şey yok"
        sorusunu cevapsız bırakırdı.
      */}
      <Card className="mt-4">
        <CardHeader
          title={t("accountsTitle")}
          description={t("accountsTitleHint")}
        />
        <CardBody className="p-0">
          {accounts.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("noAccountsTitle")}
                description={t("noAccountsDescription")}
                action={newAccountButton ?? undefined}
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 640 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>
                      {t("bankName")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("iban")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("purpose")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("balance")}
                    </th>
                    {canWrite ? (
                      <th scope="col" className={`${tc.th} w-10`}>
                        <span className="sr-only">{tCommon("action.edit")}</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id} className={tc.tr}>
                      <td className={`${tc.td} font-medium`}>
                        {a.bankName}
                        {a.accountName ? (
                          <div className="text-xs text-fg-subtle">
                            {a.accountName}
                          </div>
                        ) : null}
                        {!a.isActive ? (
                          <Badge tone="neutral">
                            {tCommon("state.inactive")}
                          </Badge>
                        ) : null}
                      </td>
                      <td className={`${tc.tdMuted} font-mono text-xs`}>
                        {a.ibanMasked ?? "—"}
                      </td>
                      <td className={tc.tdMuted}>
                        {t(`purposeOption.${a.purpose}`)}
                      </td>
                      <td className={tc.tdNum}>{f.money(a.balanceMinor)}</td>
                      {canWrite ? (
                        <td className={tc.td}>
                          <Link
                            href={`/panel/banka/hesap/${a.id}/duzenle`}
                            aria-label={tCommon("action.edit")}
                            className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg"
                          >
                            <Pencil aria-hidden className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

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
