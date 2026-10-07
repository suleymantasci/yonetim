import { Pencil, Plus } from "lucide-react";
import Link from "@/components/link";
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
import { StatementUpload } from "./statement-upload";
import { TransactionActions } from "./transaction-actions";

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
    cashbox,
    totals,
  } = await apiGet("/v1/panel/bank", bankOverviewResponse);

  const canWrite = hasPermission(ctx.roles, "bank:write");
  const canReconcile = hasPermission(ctx.roles, "bank:reconcile");
  const activeAccounts = accounts.filter((a) => a.isActive);
  const newAccountButton = canWrite ? (
    <Link
      href="/panel/banka/hesap/yeni"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
    >
      <Plus aria-hidden className="h-4 w-4" />
      {t("newAccount")}
    </Link>
  ) : null;

  /**
   * Kasa satırının başlığı. Nakit ve "hesabı belirtilmemiş" kovaları gerçek
   * bir hesaba karşılık gelmediği için adlarını buradan alıyor.
   */
  const rowLabel = (row: (typeof cashbox.rows)[number]) => {
    if (row.source === "cash") return t("cashboxCash");
    if (row.source === "unassigned") return t("cashboxUnassigned");
    return row.bankName ?? "—";
  };
  const rowHint = (row: (typeof cashbox.rows)[number]) => {
    if (row.source === "cash") return t("cashboxCashHint");
    if (row.source === "unassigned") return t("cashboxUnassignedHint");
    return row.accountName;
  };

  const hasOpening = cashbox.rows.some((row) => row.openingMinor !== 0);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={newAccountButton}
      />

      {/*
        PARA ÖNCE, MUTABAKAT SONRA.

        Ekranın ilk sorusu "kasada ne var" — tanımlı hesap sayısı ya da
        eşleşmemiş hareket adedi değil. Üstelik daha önce tek gösterilen
        rakam `bank_accounts.balance_kurus` idi; o alan yalnız open banking
        bağlanınca doluyor, panelden tahsilat girilince değil. Tahsilat
        girilmiş bir sitede "0 ₺" yazması tam olarak bu yüzdendi.
      */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
        <Stat
          label={t("totalIncoming")}
          value={f.money(cashbox.totals.incomingMinor)}
          tone="success"
        />
        <Stat
          label={t("totalOutgoing")}
          value={f.money(cashbox.totals.outgoingMinor)}
          hint={
            cashbox.totals.unpaidExpenseMinor > 0
              ? `${t("cashboxUnpaid")}: ${f.money(cashbox.totals.unpaidExpenseMinor)} — ${t("cashboxUnpaidHint")}`
              : undefined
          }
        />
        <Stat
          label={t("netBalance")}
          value={f.money(cashbox.totals.balanceMinor)}
          tone={cashbox.totals.balanceMinor < 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        KASA DÖKÜMÜ — her hesap ve nakit için ayrı, altında toplam.

        Hesap listesindeki "bakiye" sütunu kaldırıldı: aynı ekranda iki farklı
        anlamda bakiye göstermek, tam da şikâyet edilen karışıklığı üretiyordu.
        Paranın hareketi burada, hesabın tanımı aşağıdaki kartta.
      */}
      {/* Açılış fişi girildiyse "Açılış" sütunu çıkıyor; yoksa tablo eski hâlinde. */}
      <Card className="mt-4">
        <CardHeader title={t("cashboxTitle")} description={t("cashboxHint")} />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table} style={{ minWidth: 640 }}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>
                    {t("cashboxSource")}
                  </th>
                  {hasOpening ? (
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("cashboxOpening")}
                    </th>
                  ) : null}
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("cashboxIncoming")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("cashboxOutgoing")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("balance")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("cashboxSynced")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {cashbox.rows.map((row) => (
                  <tr
                    key={row.accountId ?? row.source}
                    className={tc.tr}
                    data-testid="cashbox-row"
                  >
                    <td className={`${tc.td} font-medium`}>
                      <span className="flex flex-wrap items-center gap-2">
                        {rowLabel(row)}
                        {row.source === "bank" && !row.isActive ? (
                          <Badge tone="neutral">
                            {tCommon("state.inactive")}
                          </Badge>
                        ) : null}
                      </span>
                      {rowHint(row) ? (
                        <div className="mt-0.5 text-xs font-normal text-fg-subtle">
                          {rowHint(row)}
                        </div>
                      ) : null}
                    </td>
                    {hasOpening ? (
                      <td className={tc.tdNum}>{f.money(row.openingMinor)}</td>
                    ) : null}
                    <td className={`${tc.tdNum} text-success-fg`}>
                      {f.money(row.incomingMinor)}
                    </td>
                    <td className={tc.tdNum}>{f.money(row.outgoingMinor)}</td>
                    <td className={`${tc.tdNum} font-semibold`}>
                      {f.money(row.balanceMinor)}
                    </td>
                    {/*
                      Bankadan gelen bakiye ayrı sütunda: bizim kaydımızla
                      çelişmesi bilgi, birleştirilirse fark kayboluyor.
                    */}
                    <td className={`${tc.tdNum} text-fg-muted`}>
                      {row.syncedBalanceMinor === null
                        ? t("cashboxSyncedNone")
                        : f.money(row.syncedBalanceMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border-strong">
                <tr>
                  <th scope="row" className={`${tc.td} text-left font-semibold`}>
                    {t("cashboxTotal")}
                  </th>
                  {hasOpening ? (
                    <td className={`${tc.tdNum} font-semibold`}>
                      {f.money(cashbox.totals.openingMinor)}
                    </td>
                  ) : null}
                  <td className={`${tc.tdNum} font-semibold text-success-fg`}>
                    {f.money(cashbox.totals.incomingMinor)}
                  </td>
                  <td className={`${tc.tdNum} font-semibold`}>
                    {f.money(cashbox.totals.outgoingMinor)}
                  </td>
                  <td className={`${tc.tdNum} font-bold`}>
                    {f.money(cashbox.totals.balanceMinor)}
                  </td>
                  <td className={tc.tdNum} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardBody>
      </Card>

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
                      {canWrite ? (
                        <td className={tc.td}>
                          <Link
                            href={`/panel/banka/hesap/${a.id}/duzenle`}
                            aria-label={tCommon("action.edit")}
                            className="-my-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg [&_svg]:pointer-events-none"
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

      {canReconcile && activeAccounts.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title={t("statementTitle")} />
          <CardBody>
            <StatementUpload
              accounts={activeAccounts.map((a) => ({
                id: a.id,
                label: [a.bankName, a.accountName, a.ibanMasked].filter(Boolean).join(" · "),
              }))}
            />
          </CardBody>
        </Card>
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
                    {canReconcile ? (
                      <th scope="col" className={tc.th}>
                        <span className="sr-only">{t("actionsColumn")}</span>
                      </th>
                    ) : null}
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
                        {x.matchedUnitNumber ? (
                          <span className="ml-1.5 text-xs text-fg-subtle">
                            {t("suggestedUnit", { unit: x.matchedUnitNumber })}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`${tc.tdNum} ${x.direction === "in" ? "text-success-fg" : ""}`}
                      >
                        {x.direction === "in" ? "+" : "−"}
                        {f.money(x.amountMinor)}
                      </td>
                      {canReconcile ? (
                        <td className={tc.td}>
                          {x.direction === "in" &&
                          (x.matchStatus === "unmatched" || x.matchStatus === "suggested") ? (
                            <TransactionActions
                              id={x.id}
                              canConfirm={x.matchStatus === "suggested"}
                            />
                          ) : null}
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
    </>
  );
}
