import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  bankOverviewResponse,
  residentDetail as residentDetailSchema,
  unitOptionList,
} from "@yonetim/contracts";
import type { Role } from "@yonetim/core";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Stat,
  TabView,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { CollectPaymentButton } from "@/components/collect-payment";
import { apiGet } from "@/lib/api/server";
import { VoidPaymentButton } from "@/components/payments/void-payment-button";
import { can, requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import type { SearchParamsInput } from "@/lib/list-params";
import { OccupancyManager, type OccupancyView } from "./occupancy-manager";

export const dynamic = "force-dynamic";

const TAB_KEYS = ["ozet", "birimler", "borclar", "odemeler", "kvkk"] as const;
type TabKey = (typeof TAB_KEYS)[number];

/**
 * Sakin detayı — GAP 4.1.2.
 *
 * "Tek cari" ekranı: kişinin **tüm** birimlerdeki ilişkileri, toplam bakiyesi,
 * borçları, ödemeleri ve KVKK rıza geçmişi bir arada. Rakiplerde bu bilgi
 * daire başına ayrı ayrı duruyor; burada kişi merkezli.
 *
 * TCKN yalnız maskeli gösterilir. A3 sonrası bu artık bir konvansiyon değil
 * **kısıt**: maskeyi sunucu üretiyor, `apps/app` şifreleme anahtarına sahip
 * olmadığı için açık değeri üretemez (MIMARI-PLAN §9.1).
 */
export default async function ResidentDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const ctx = await requirePermission("resident:read");
  const canVoid = can(ctx, "payment:refund");
  const t = await getTranslations("app.residents");
  const tUnits = await getTranslations("app.units");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const tDebts = await getTranslations("app.debts");
  const fmt = await formatters();

  // KVKK erişim kaydını uç yazıyor (§8.4); burada ayrıca yazmak çift satır olurdu.
  const [detail, units, bank] = await Promise.all([
    apiGet(`/v1/panel/residents/${id}`, residentDetailSchema).catch(() => null),
    apiGet("/v1/panel/units/options", unitOptionList),
    // Tahsilat paneli için: nakit dışı yöntemde paranın girdiği hesap.
    // Hata yutuluyor — banka modülü kapalıysa tahsilat yine girilebilmeli.
    apiGet("/v1/panel/bank", bankOverviewResponse).catch(() => null),
  ]);
  if (!detail) notFound();

  const rawTab = Array.isArray(query.sekme) ? query.sekme[0] : query.sekme;
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as TabKey)
    : "ozet";

  const name =
    [detail.firstName, detail.lastName].filter(Boolean).join(" ") ||
    t("unnamed");

  // Birim başına bakiye: ayrılma kararında hangi birimde borç kaldığını gösterir.
  const balanceByUnit = new Map<string, number>();
  for (const debt of detail.debts) {
    if (debt.status === "paid") continue;
    const open = debt.amountMinor + debt.lateFeeMinor - debt.paidMinor;
    balanceByUnit.set(
      debt.unitNumber,
      (balanceByUnit.get(debt.unitNumber) ?? 0) + open,
    );
  }

  const occupancyViews: OccupancyView[] = detail.occupancies.map(
    (occupancy) => {
      const outstanding = balanceByUnit.get(occupancy.unitNumber) ?? 0;
      return {
        occupancyId: occupancy.occupancyId,
        unitId: occupancy.unitId,
        unitLabel: occupancy.blockName
          ? `${occupancy.blockName} / ${occupancy.unitNumber}`
          : occupancy.unitNumber,
        relation: occupancy.relation,
        relationLabel: tEnum(`occupancy.${occupancy.relation}`),
        ownershipPct: `${Number(occupancy.ownershipPct).toFixed(2)}%`,
        startDate: fmt.date(occupancy.startDate),
        endDate: occupancy.endDate ? fmt.date(occupancy.endDate) : null,
        policyLabel: tUnits(`transferPolicy.${occupancy.debtTransferPolicy}`),
        contractUrl: occupancy.contractUrl,
        outstanding: outstanding > 0 ? fmt.money(outstanding) : "—",
        hasOutstanding: outstanding > 0,
      };
    },
  );

  const activeCount = detail.occupancies.filter(
    (o) => o.endDate === null,
  ).length;

  /*
   * Tahsilat kutusu için birim/borç listeleri.
   *
   * BİTMİŞ İLİŞKİLER LİSTEDE YOK: taşınmış bir kiracının eski dairesine
   * tahsilat girmek, parayı yanlış birimin hesabına yazmak olurdu. Borcu
   * duruyorsa o borç birimde kalıyor ve birim ekranından tahsil ediliyor.
   */
  const collectUnits = detail.occupancies
    .filter((occupancy) => occupancy.endDate === null)
    .map((occupancy) => ({
      id: occupancy.unitId,
      label: occupancy.blockName
        ? `${occupancy.blockName} / ${occupancy.unitNumber}`
        : occupancy.unitNumber,
    }));

  const collectDebts = detail.debts
    .filter((debt) => debt.status !== "paid")
    .map((debt) => ({
      id: debt.id,
      unitId: debt.unitId,
      label: `${debt.description}${debt.period ? ` · ${fmt.period(debt.period)}` : ""}`,
      remaining: fmt.money(
        debt.amountMinor + debt.lateFeeMinor - debt.paidMinor,
      ),
    }));

  const collectBankAccounts = (bank?.accounts ?? [])
    .filter((account) => account.isActive)
    .map((account) => ({
      id: account.id,
      label: `${account.bankName}${account.ibanMasked ? ` · ${account.ibanMasked}` : ""}`,
    }));

  const collectLabels = {
    trigger: tDebts("collectFromUnit"),
    title: tDebts("collectTitle"),
    hint: tDebts("collectHint"),
    cancel: tCommon("action.cancel"),
    submit: tDebts("collectAction"),
    unit: tDebts("collectUnitLabel"),
    amount: tDebts("collectAmount"),
    method: tUnits("method"),
    methodTransfer: tEnum("paymentMethod.bank_transfer"),
    methodCash: tEnum("paymentMethod.cash"),
    methodCard: tEnum("paymentMethod.card"),
    methodOffset: tEnum("paymentMethod.offset"),
    paidAt: tUnits("paidAt"),
    bankAccount: tDebts("bankAccount"),
    bankAccountHint: tDebts("bankAccountHint"),
    bankAccountNone: tDebts("bankAccountNone"),
    noBankAccounts: tDebts("noBankAccounts"),
    payer: tDebts("payer"),
    payerHint: tDebts("payerHint"),
    receiptNo: tUnits("receiptNo"),
    targetDebts: tDebts("targetDebts"),
    targetDebtsHint: tDebts("targetDebtsHint"),
    noOpenDebts: tDebts("noOpenDebts"),
    note: tDebts("note"),
  };

  return (
    <>
      <PageHeader
        title={name}
        description={
          detail.phoneMasked
            ? t("detailSubtitle", { phone: detail.phoneMasked })
            : (detail.email ?? undefined)
        }
        breadcrumb={[
          { label: t("title"), href: "/panel/sakinler" },
          { label: name },
        ]}
        meta={
          <>
            {detail.roles.map((role) => (
              <Badge key={role} tone="neutral">
                {tEnum(`role.${role as Role}`)}
              </Badge>
            ))}
            {detail.whatsappOptIn ? (
              <Badge tone="success">{t("whatsappOptIn")}</Badge>
            ) : (
              <Badge tone="neutral">{t("whatsappOptOut")}</Badge>
            )}
            {activeCount > 1 ? (
              <Badge tone="brand">{t("multiUnitBadge")}</Badge>
            ) : null}
          </>
        }
        action={
          <>
            <CollectPaymentButton
              units={collectUnits}
              openDebts={collectDebts}
              payers={[{ id, label: name }]}
              defaultPayerId={id}
              bankAccounts={collectBankAccounts}
              labels={collectLabels}
            />
            <Link
              href={`/panel/borclar/yeni?sakin=${id}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {tUnits("quickNewDebt")}
            </Link>
            <Link
              href={`/panel/sakinler/${id}/duzenle`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <Pencil aria-hidden className="h-4 w-4" />
              {tCommon("action.edit")}
            </Link>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("outstanding")}
          value={fmt.money(detail.balance.outstandingMinor)}
          tone={detail.balance.outstandingMinor > 0 ? "danger" : "success"}
        />
        <Stat
          label={t("overdue")}
          value={fmt.money(detail.balance.overdueMinor)}
          tone={detail.balance.overdueMinor > 0 ? "danger" : "neutral"}
        />
        <Stat
          label={t("paidTotal")}
          value={fmt.money(detail.balance.paidTotalMinor)}
        />
        <Stat label={t("activeUnits")} value={String(activeCount)} />
      </div>

      <TabView
        initialKey={tab}
        label={t("detailTabs")}
        defaultKey="ozet"
        items={[
          {
            key: "ozet",
            label: t("tabSummary"),
            panel: (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title={t("tabSummary")} />
                  <CardBody>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <Row
                        label={t("firstName")}
                        value={detail.firstName ?? "—"}
                      />
                      <Row
                        label={t("lastName")}
                        value={detail.lastName ?? "—"}
                      />
                      <Row
                        label={t("phone")}
                        value={detail.phoneMasked ?? "—"}
                      />
                      <Row label={t("email")} value={detail.email ?? "—"} />
                      <Row label={t("tckn")} value={detail.tcknMasked ?? "—"} />
                      <Row
                        label={t("locale")}
                        value={detail.locale.toUpperCase()}
                      />
                      <Row
                        label={t("emergencyName")}
                        value={detail.emergencyContactName ?? "—"}
                      />
                      <Row
                        label={t("emergencyPhone")}
                        value={detail.emergencyContactPhoneMasked ?? "—"}
                      />
                      {/*
                      Kan grubu maskesiz: maskelenmiş bir kan grubu ("A ••")
                      hiçbir işe yaramaz. Koruma erişim denetiminde — bu
                      görüntüleme `saglik_bilgisi` kategorisiyle kütüğe geçiyor.
                    */}
                      <Row
                        label={t("bloodType")}
                        value={detail.bloodType ?? "—"}
                      />
                      <Row
                        label={t("createdAt")}
                        value={fmt.date(detail.createdAt)}
                      />
                      <Row
                        label={t("lastLogin")}
                        value={
                          detail.lastLoginAt
                            ? fmt.dateTime(detail.lastLoginAt)
                            : t("neverLoggedIn")
                        }
                      />
                    </dl>
                    {detail.notes ? (
                      <div className="mt-4 rounded-lg bg-surface-sunken p-3 text-sm text-fg-muted">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                          {t("notes")}
                        </span>
                        {detail.notes}
                      </div>
                    ) : null}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title={t("tabUnits")}
                    description={t("unitsSummaryHint")}
                  />
                  <CardBody className="p-0">
                    {occupancyViews.length === 0 ? (
                      <p className="p-6 text-center text-sm text-fg-subtle">
                        {t("noUnits")}
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {occupancyViews.map((occupancy) => (
                          <li
                            key={occupancy.occupancyId}
                            className="flex items-center justify-between gap-3 p-4"
                          >
                            <div className="min-w-0">
                              <Link
                                href={`/panel/birimler/${occupancy.unitId}`}
                                className="text-sm font-medium text-fg hover:underline"
                              >
                                {occupancy.unitLabel}
                              </Link>
                              <p className="text-xs text-fg-subtle">
                                {occupancy.relationLabel} ·{" "}
                                {occupancy.startDate}
                                {occupancy.endDate
                                  ? ` → ${occupancy.endDate}`
                                  : ""}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 text-sm tabular-nums ${
                                occupancy.hasOutstanding
                                  ? "font-semibold text-danger-fg"
                                  : "text-fg-muted"
                              }`}
                            >
                              {occupancy.outstanding}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>
              </div>
            ),
          },
          {
            key: "birimler",
            label: t("tabUnits"),
            count: detail.occupancies.length,
            panel: (
              <OccupancyManager
                userId={id}
                occupancies={occupancyViews}
                units={units.map((unit) => ({
                  id: unit.id,
                  number: unit.number,
                  blockName: unit.blockName,
                }))}
                labels={{
                  title: t("tabUnits"),
                  hint: t("occupancyHint"),
                  unit: t("unit"),
                  relation: t("relation"),
                  relationOwner: tEnum("occupancy.owner"),
                  relationTenant: tEnum("occupancy.tenant"),
                  sharePct: t("ownershipPct"),
                  startDate: t("startDate"),
                  endDate: t("endDate"),
                  policy: t("debtTransferPolicy"),
                  ongoing: t("ongoing"),
                  empty: t("noUnits"),
                  addTitle: t("addOccupancy"),
                  addHint: t("addOccupancyHint"),
                  endTitle: t("endOccupancyTitle"),
                  endHint: t("endOccupancyHint"),
                  endAction: t("endOccupancyAction"),
                  outstandingWarning: t("endOccupancyDebtWarning"),
                  transferLabel: t("transferLabel"),
                  transferHint: t("debtTransferPolicyHint"),
                  transferOwner: t("transferPolicy.owner"),
                  transferNextTenant: t("transferPolicy.next_tenant"),
                  transferKeep: t("transferPolicy.keep"),
                  reason: t("transferReason"),
                  reasonHint: t("transferReasonHint"),
                  ownershipPct: t("ownershipPct"),
                  ownershipPctHint: t("ownershipPctHint"),
                  selectUnit: t("selectUnit"),
                  searchUnit: t("searchUnit"),
                  noUnitFound: t("noUnitFound"),
                  outstanding: t("outstanding"),
                  contract: t("contract"),
                }}
              />
            ),
          },
          {
            key: "borclar",
            label: t("tabDebts"),
            count: detail.debts.filter((d) => d.status !== "paid").length,
            panel: (
              <Card>
                <CardHeader
                  title={t("tabDebts")}
                  description={t("debtsHint")}
                />
                <CardBody className="p-0">
                  <div className={tc.wrapper}>
                    <table className={tc.table} style={{ minWidth: 780 }}>
                      <thead className={tc.thead}>
                        <tr>
                          <th scope="col" className={tc.th}>
                            {t("unit")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {tUnits("debtDescription")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {tUnits("period")}
                          </th>
                          <th scope="col" className={`${tc.th} text-right`}>
                            {tUnits("amount")}
                          </th>
                          <th scope="col" className={`${tc.th} text-right`}>
                            {tUnits("paid")}
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
                        {detail.debts.length === 0 ? (
                          <tr>
                            <td colSpan={7} className={tc.empty}>
                              {tUnits("noDebts")}
                            </td>
                          </tr>
                        ) : (
                          detail.debts.map((debt) => (
                            <tr key={debt.id} className={tc.tr}>
                              <td className={tc.td}>{debt.unitNumber}</td>
                              <td className={`${tc.td} font-medium`}>
                                <Link
                                  href={`/panel/borclar/${debt.id}`}
                                  className="hover:underline"
                                >
                                  {debt.description}
                                </Link>
                              </td>
                              <td className={tc.tdMuted}>
                                {debt.period ? fmt.period(debt.period) : "—"}
                              </td>
                              <td className={tc.tdNum}>
                                {fmt.money(debt.amountMinor)}
                              </td>
                              <td className={tc.tdNum}>
                                {fmt.money(debt.paidMinor)}
                              </td>
                              <td className={tc.td}>
                                {fmt.date(debt.dueDate)}
                              </td>
                              <td className={tc.td}>
                                <Badge tone={debtTone(debt.status)}>
                                  {tEnum(`debtStatus.${debt.status}`)}
                                </Badge>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            ),
          },
          {
            key: "odemeler",
            label: t("tabPayments"),
            count: detail.payments.length,
            panel: (
              <Card>
                <CardHeader
                  title={t("tabPayments")}
                  description={t("paymentsHint")}
                />
                <CardBody className="p-0">
                  <div className={tc.wrapper}>
                    <table className={tc.table} style={{ minWidth: 720 }}>
                      <thead className={tc.thead}>
                        <tr>
                          <th scope="col" className={tc.th}>
                            {tUnits("paidAt")}
                          </th>
                          <th scope="col" className={`${tc.th} text-right`}>
                            {tUnits("amount")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {tUnits("method")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("status")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("onBehalfOf")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {tUnits("receiptNo")}
                          </th>
                          {canVoid ? (
                            <th scope="col" className={tc.th}>
                              <span className="sr-only">{tEnum("paymentStatus.cancelled")}</span>
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.payments.length === 0 ? (
                          <tr>
                            <td colSpan={canVoid ? 7 : 6} className={tc.empty}>
                              {tUnits("noPayments")}
                            </td>
                          </tr>
                        ) : (
                          detail.payments.map((payment) => (
                            <tr key={payment.id} className={tc.tr}>
                              <td className={tc.td}>
                                {payment.paidAt
                                  ? fmt.dateTime(payment.paidAt)
                                  : "—"}
                              </td>
                              <td className={tc.tdNum}>
                                {fmt.money(payment.amountMinor)}
                              </td>
                              <td className={tc.td}>
                                {tEnum(`paymentMethod.${payment.method}`)}
                              </td>
                              <td className={tc.td}>
                                <Badge
                                  tone={
                                    payment.status === "completed"
                                      ? "success"
                                      : payment.status === "cancelled"
                                        ? "danger"
                                        : "neutral"
                                  }
                                >
                                  {tEnum(`paymentStatus.${payment.status}`)}
                                </Badge>
                              </td>
                              <td className={tc.tdMuted}>
                                {payment.onBehalfOf ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Badge tone="info">
                                      {t("onBehalfBadge")}
                                    </Badge>
                                    {payment.onBehalfOf}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className={tc.tdMuted}>
                                {payment.receiptNo ?? "—"}
                              </td>
                              {canVoid ? (
                                <td className={tc.td}>
                                  {payment.status === "completed" && payment.processor === "manual" ? (
                                    <VoidPaymentButton
                                      paymentId={payment.id}
                                      summary={[
                                        fmt.money(payment.amountMinor),
                                        payment.paidAt ? fmt.date(payment.paidAt) : null,
                                        tEnum(`paymentMethod.${payment.method}`),
                                        payment.receiptNo,
                                      ].filter(Boolean).join(" · ")}
                                    />
                                  ) : null}
                                </td>
                              ) : null}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            ),
          },
          {
            key: "kvkk",
            label: t("tabKvkk"),
            count: detail.consents.length,
            panel: (
              <Card>
                <CardHeader title={t("tabKvkk")} description={t("kvkkHint")} />
                <CardBody className="p-0">
                  {detail.consents.length === 0 ? (
                    <p className="p-6 text-center text-sm text-fg-subtle">
                      {t("noConsents")}
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {detail.consents.map((consent, index) => (
                        <li
                          key={`${consent.kind}-${index}`}
                          className="flex items-center justify-between gap-3 p-4"
                        >
                          <div className="min-w-0">
                            <span className="block text-sm font-medium text-fg">
                              {t(`consentKind.${consent.kind}`)}
                            </span>
                            <span className="text-xs text-fg-subtle">
                              {t("consentVersion", {
                                version: consent.documentVersion,
                              })}
                              {consent.at
                                ? ` · ${fmt.dateTime(consent.at)}`
                                : ""}
                            </span>
                          </div>
                          <Badge tone={consent.granted ? "success" : "danger"}>
                            {consent.granted
                              ? t("consentGranted")
                              : t("consentRevoked")}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            ),
          },
        ]}
      />
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
      <dd className="min-w-0 break-words font-medium text-fg">{value}</dd>
    </>
  );
}

function debtTone(
  status: string,
): "success" | "danger" | "warning" | "neutral" {
  if (status === "paid") return "success";
  if (status === "overdue" || status === "in_legal") return "danger";
  if (status === "partial") return "warning";
  return "neutral";
}
