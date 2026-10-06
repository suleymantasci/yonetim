import { ShieldOff } from "lucide-react";
import Link from "@/components/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  ProgressBar,
  Stat,
  Timeline,
  tableClasses as tc,
  type TimelineEntry,
} from "@yonetim/ui";

import {
  bankOverviewResponse,
  debtDetail as debtDetailSchema,
  openDebtList,
  residentOptionList,
} from "@yonetim/contracts";
import { AppError } from "@yonetim/core";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { DebtActionPanels } from "./adjust-panel";

export const dynamic = "force-dynamic";

/**
 * Borç detayı — **VURUCU ÖZELLİK ekranı** (SPEC 3.2, GAP 5.2).
 *
 * Sayfanın merkezinde "Değişiklik tarihçesi" var: her tutar/vade değişimi
 * eski değer → yeni değer, kim, ne zaman ve **neden** olarak listelenir.
 * Kayıtlar append-only tablodan gelir; arayüz hiçbirini gizleyemez ve
 * sıralamayı değiştiremez.
 *
 * Rakip şikâyeti şuydu: "geçmiş aidat tutarı sessizce değiştirilmiş, kimse
 * fark etmemiş." Bu ekran o şikâyeti yapısal olarak imkânsız kılıyor.
 */
export default async function DebtDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("debt:read");
  const t = await getTranslations("app.debts");
  const tUnits = await getTranslations("app.units");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const fmt = await formatters();

  const detail = await apiGet(`/v1/panel/debts/${id}`, debtDetailSchema).catch(
    (error: unknown) => {
      if (error instanceof AppError && error.code === "not_found") notFound();
      throw error;
    },
  );

  const debt = detail.debt;
  const total = debt.amountMinor + debt.lateFeeMinor;
  const outstanding = total - debt.paidMinor;
  const overdue = debt.status !== "paid" && debt.dueDate.getTime() < Date.now();

  /*
   * Banka hesapları tahsilat formundaki "hangi hesaba yattı" seçimi için.
   *
   * `bank:read` yetkisi olmayan bir kullanıcı (ör. yalnız `payment:create`
   * yetkisi olan bir görevli) 403 alır; bu durumda liste boş geçiliyor ve
   * form alanı yerine bilgilendirme gösteriliyor — tahsilat kaydı, hesap
   * bilgisi olmadan da açılabilmeli.
   */
  const [openDebts, residents, bank] = await Promise.all([
    apiGet(`/v1/panel/debts/open/${debt.unitId}`, openDebtList),
    apiGet("/v1/panel/residents/options", residentOptionList),
    apiGet("/v1/panel/bank", bankOverviewResponse).catch(() => null),
  ]);

  const timelineEntries: TimelineEntry[] = [
    ...detail.changes.map((change) => {
      const isAmount = change.changeType === "amount_changed";
      const increased =
        isAmount &&
        change.oldAmountMinor !== null &&
        change.newAmountMinor !== null &&
        change.newAmountMinor > change.oldAmountMinor;

      return {
        id: change.id,
        title: t(`changeType.${change.changeType}`),
        timestamp: fmt.dateTime(change.createdAt),
        actor: change.changedByName ?? t("changedBySystem"),
        // Artış uyarı tonunda: sakinin dikkatini çekmesi gereken değişiklik bu.
        tone: increased
          ? ("warning" as const)
          : isAmount
            ? ("info" as const)
            : ("neutral" as const),
        delta: isAmount
          ? {
              from: fmt.money(change.oldAmountMinor ?? 0),
              to: fmt.money(change.newAmountMinor ?? 0),
            }
          : change.oldDueDate && change.newDueDate
            ? {
                from: fmt.date(change.oldDueDate),
                to: fmt.date(change.newDueDate),
              }
            : undefined,
        reason: change.reason ?? undefined,
        meta: change.visibleToResident ? null : (
          <Badge tone="neutral">{t("hiddenFromResident")}</Badge>
        ),
      };
    }),
    // Oluşturma kaydı en altta: tarihçenin başlangıç noktası.
    {
      id: "created",
      title: t("changeType.created"),
      timestamp: fmt.dateTime(debt.createdAt),
      tone: "brand" as const,
      delta: { from: "—", to: fmt.money(debt.amountMinor) },
      reason: detail.planName
        ? t("createdByPlan", { plan: detail.planName })
        : undefined,
    },
  ];

  return (
    <>
      <PageHeader
        title={debt.description}
        description={t("detailSubtitle", {
          unit: detail.unit.blockName
            ? `${detail.unit.blockName}/${detail.unit.number}`
            : detail.unit.number,
          kind: tEnum(`debtKind.${debt.kind}`),
        })}
        breadcrumb={[
          { label: t("title"), href: "/panel/borclar" },
          { label: debt.description },
        ]}
        meta={
          <>
            <Badge tone={statusTone(debt.status, overdue)}>
              {tEnum(`debtStatus.${debt.status}`)}
            </Badge>
            {debt.lateFeeExempt ? (
              <Badge tone="info">
                <ShieldOff aria-hidden className="h-3 w-3" />
                {t("exemptTooltip")}
              </Badge>
            ) : null}
            {debt.installmentNo && debt.installmentCount ? (
              <Badge tone="neutral">
                {t("installmentBadge", {
                  no: debt.installmentNo,
                  count: debt.installmentCount,
                })}
              </Badge>
            ) : null}
            {detail.changes.length > 0 ? (
              <Badge tone="warning">
                {t("changeCountBadge", { count: detail.changes.length })}
              </Badge>
            ) : null}
          </>
        }
        action={
          <DebtActionPanels
            debtId={id}
            unitId={debt.unitId}
            currentAmountKurus={debt.amountMinor}
            currentDueDate={debt.dueDate.toISOString().slice(0, 10)}
            lateFeeExempt={debt.lateFeeExempt}
            paidKurus={debt.paidMinor}
            openDebts={openDebts.rows.map((row) => ({
              id: row.id,
              label: `${row.description}${row.period ? ` · ${fmt.period(row.period)}` : ""}`,
              remaining: fmt.money(
                row.amountMinor + row.lateFeeMinor - row.paidMinor,
              ),
            }))}
            residents={residents.rows.map((person) => ({
              id: person.id,
              label:
                [person.firstName, person.lastName].filter(Boolean).join(" ") ||
                person.id,
            }))}
            bankAccounts={(bank?.accounts ?? [])
              .filter((account) => account.isActive)
              .map((account) => ({
                id: account.id,
                label: `${account.bankName}${account.ibanMasked ? ` · ${account.ibanMasked}` : ""}`,
              }))}
            labels={{
              adjust: t("adjustAction"),
              adjustTitle: t("adjustTitle"),
              adjustHint: t("adjustHint"),
              amount: tUnits("amount"),
              dueDate: tUnits("dueDate"),
              reason: t("reasonLabel"),
              reasonHint: t("reasonHint"),
              reasonWarning: t("reasonWarning"),
              visibleToResident: t("visibleToResident"),
              visibleHint: t("visibleHint"),
              lateFeeExempt: tUnits("lateFeeExempt"),
              lateFeeExemptHint: tUnits("lateFeeExemptHint"),
              paidWarning: t("paidWarning"),
              collect: t("collectAction"),
              collectTitle: t("collectTitle"),
              collectHint: t("collectHint"),
              collectAmount: t("collectAmount"),
              method: tUnits("method"),
              methodCash: tEnum("paymentMethod.cash"),
              methodTransfer: tEnum("paymentMethod.bank_transfer"),
              methodCard: tEnum("paymentMethod.card"),
              methodOffset: tEnum("paymentMethod.offset"),
              paidAt: tUnits("paidAt"),
              bankAccount: t("bankAccount"),
              bankAccountHint: t("bankAccountHint"),
              bankAccountNone: t("bankAccountNone"),
              noBankAccounts: t("noBankAccounts"),
              payer: t("payer"),
              payerHint: t("payerHint"),
              receiptNo: tUnits("receiptNo"),
              targetDebts: t("targetDebts"),
              targetDebtsHint: t("targetDebtsHint"),
              note: t("note"),
              save: tCommon("action.save"),
              cancel: tCommon("action.cancel"),
            }}
          />
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={tUnits("amount")} value={fmt.money(debt.amountMinor)} />
        <Stat
          label={tUnits("lateFee")}
          value={fmt.money(debt.lateFeeMinor)}
          tone={debt.lateFeeMinor > 0 ? "warning" : "neutral"}
        />
        <Stat
          label={tUnits("paid")}
          value={fmt.money(debt.paidMinor)}
          tone="success"
        />
        <Stat
          label={t("statOutstanding")}
          value={fmt.money(Math.max(0, outstanding))}
          tone={outstanding > 0 ? "danger" : "success"}
        />
      </div>

      {overdue ? (
        <div className="mb-4">
          <Alert tone="danger">
            {t("overdueNotice", {
              days: Math.floor(
                (Date.now() - debt.dueDate.getTime()) / 86_400_000,
              ),
            })}
          </Alert>
        </div>
      ) : null}

      <div className="mb-5">
        <Card>
          <CardBody>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-fg-muted">{t("collectionProgress")}</span>
              <span className="font-semibold tabular-nums text-fg">
                {total > 0 ? Math.round((debt.paidMinor / total) * 100) : 0}%
              </span>
            </div>
            <ProgressBar
              value={debt.paidMinor}
              max={Math.max(1, total)}
              label={t("collectionProgress")}
              tone={
                debt.paidMinor >= total
                  ? "success"
                  : overdue
                    ? "danger"
                    : "primary"
              }
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* VURUCU: tarihçe kartı — ekranın en geniş sütunu. */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title={t("timelineTitle")}
              description={t("timelineHint")}
            />
            <CardBody>
              <Timeline
                entries={timelineEntries}
                emptyText={t("timelineEmpty")}
                reasonLabel={t("reasonLabel")}
                actorLabel={t("actorLabel")}
              />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("summaryTitle")} />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Row
                  label={tUnits("period")}
                  value={debt.period ? fmt.period(debt.period) : "—"}
                />
                <Row label={tUnits("dueDate")} value={fmt.date(debt.dueDate)} />
                <Row label={t("kind")} value={tEnum(`debtKind.${debt.kind}`)} />
                <Row
                  label={t("debtor")}
                  value={detail.debtorName ?? t("debtorUnassigned")}
                />
                <Row label={t("plan")} value={detail.planName ?? "—"} />
                <Row
                  label={tUnits("createdAt")}
                  value={fmt.date(debt.createdAt)}
                />
              </dl>
              {detail.debtorName === null ? (
                <div className="mt-3">
                  <Alert tone="warning">{t("debtorUnassignedNotice")}</Alert>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("paymentsTitle")} />
            <CardBody className="p-0">
              {detail.allocations.length === 0 ? (
                <p className="p-5 text-center text-sm text-fg-subtle">
                  {tUnits("noPayments")}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {detail.allocations.map((allocation) => (
                    <li key={allocation.paymentId} className="p-3 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold tabular-nums text-fg">
                          {fmt.money(allocation.amountMinor)}
                        </span>
                        <span className="text-xs text-fg-subtle">
                          {allocation.paidAt
                            ? fmt.date(allocation.paidAt)
                            : "—"}
                        </span>
                      </div>
                      <p className="text-xs text-fg-muted">
                        {tEnum(`paymentMethod.${allocation.method}`)}
                        {allocation.payerName
                          ? ` · ${allocation.payerName}`
                          : ""}
                        {allocation.receiptNo
                          ? ` · ${allocation.receiptNo}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {detail.siblings.length > 1 ? (
            <Card>
              <CardHeader
                title={t("installmentPlanTitle")}
                description={t("installmentPlanHint")}
              />
              <CardBody className="p-0">
                <div className={tc.wrapper}>
                  <table className={tc.table}>
                    <thead className={tc.thead}>
                      <tr>
                        <th scope="col" className={tc.th}>
                          #
                        </th>
                        <th scope="col" className={`${tc.th} text-right`}>
                          {tUnits("amount")}
                        </th>
                        <th scope="col" className={tc.th}>
                          {tUnits("dueDate")}
                        </th>
                        <th scope="col" className={tc.th}>
                          {t("status")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.siblings.map((sibling) => (
                        <tr
                          key={sibling.id}
                          className={`${tc.tr} ${sibling.id === id ? "bg-selected" : ""}`}
                        >
                          <td className={tc.td}>
                            <Link
                              href={`/panel/borclar/${sibling.id}`}
                              className="hover:underline"
                            >
                              {sibling.installmentNo ?? "—"}
                            </Link>
                          </td>
                          <td className={tc.tdNum}>
                            {fmt.money(sibling.amountMinor)}
                          </td>
                          <td className={tc.td}>{fmt.date(sibling.dueDate)}</td>
                          <td className={tc.td}>
                            <Badge tone={statusTone(sibling.status, false)}>
                              {tEnum(`debtStatus.${sibling.status}`)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="font-medium text-fg">{value}</dd>
    </>
  );
}

function statusTone(
  status: string,
  overdue: boolean,
): "success" | "danger" | "warning" | "neutral" {
  if (status === "paid") return "success";
  if (overdue || status === "overdue" || status === "in_legal") return "danger";
  if (status === "partial") return "warning";
  return "neutral";
}
