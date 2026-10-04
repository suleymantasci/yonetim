import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  bankOverviewResponse,
  openDebtList,
  unitDetail,
} from "@yonetim/contracts";
import { AppError } from "@yonetim/core";
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

export const dynamic = "force-dynamic";

const TAB_KEYS = [
  "ozet",
  "sakinler",
  "borclar",
  "odemeler",
  "sayaclar",
  "belgeler",
] as const;
type TabKey = (typeof TAB_KEYS)[number];

/**
 * Birim detayı — GAP 4.1.1 ("bu birimin sakinleri, borçları, ödemeleri,
 * sayaçları, geçmişi, dökümanları tek ekranda sekmeli görünüm").
 *
 * Sekme durumu URL'de (`?sekme=borclar`): paylaşılabilir ve geri tuşuyla
 * gezilebilir. Tüm veri **tek API çağrısında** geldiği için sekme geçişi anlık
 * (MIMARI-PLAN §9.2a).
 *
 * KVKK md.12 erişim kaydı artık burada değil, `UnitService.detail()` içinde
 * yazılıyor — kayıt yanıtta **dönen** kişi kümesiyle birebir örtüşsün diye
 * (§8.4). Render katmanında yazılırken bu garanti yoktu.
 */
export default async function UnitDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const ctx = await requirePermission("unit:read");
  const canVoid = can(ctx, "payment:refund");
  const t = await getTranslations("app.units");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const tDebts = await getTranslations("app.debts");
  const fmt = await formatters();

  const detail = await apiGet(`/v1/panel/units/${id}`, unitDetail).catch(
    (error: unknown) => {
      if (error instanceof AppError && error.code === "not_found") notFound();
      throw error;
    },
  );

  /*
   * Tahsilat kutusunun ihtiyaçları — birim detayı bunları taşımıyor.
   * İkisi de hatada yutuluyor: banka modülü kapalıysa ya da borç listesi
   * alınamıyorsa ekranın kalanı yine açılmalı.
   */
  const [openDebts, bank] = await Promise.all([
    apiGet(`/v1/panel/debts/open/${id}`, openDebtList).catch(() => null),
    apiGet("/v1/panel/bank", bankOverviewResponse).catch(() => null),
  ]);

  const rawTab = Array.isArray(query.sekme) ? query.sekme[0] : query.sekme;
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as TabKey)
    : "ozet";

  const unit = detail.unit;
  const activeOccupants = detail.occupants.filter((o) => o.endDate === null);
  const pastOccupants = detail.occupants.filter((o) => o.endDate !== null);
  const share =
    unit.landShareNumerator && unit.landShareDenominator
      ? `${unit.landShareNumerator}/${unit.landShareDenominator} (${(
          (unit.landShareNumerator / unit.landShareDenominator) *
          100
        ).toFixed(3)}%)`
      : unit.landShare
        ? Number(unit.landShare).toFixed(6)
        : "—";

  return (
    <>
      <PageHeader
        title={unit.number}
        description={
          detail.block
            ? t("detailSubtitleWithBlock", {
                block: detail.block.name,
                floor: unit.floor,
              })
            : t("detailSubtitle", { floor: unit.floor })
        }
        breadcrumb={[
          { label: t("title"), href: "/panel/birimler" },
          { label: unit.number },
        ]}
        meta={
          <>
            <Badge tone="neutral">{tEnum(`unitType.${unit.type}`)}</Badge>
            {unit.duesExempt ? (
              <Badge tone="warning">{t("duesExempt")}</Badge>
            ) : null}
            {unit.lateFeeExempt ? (
              <Badge tone="info">{t("lateFeeExempt")}</Badge>
            ) : null}
            {unit.deletedAt ? (
              <Badge tone="danger">{t("trashed")}</Badge>
            ) : null}
          </>
        }
        action={
          <>
            <CollectPaymentButton
              units={[
                {
                  id,
                  label: detail.block
                    ? `${detail.block.name} / ${unit.number}`
                    : unit.number,
                },
              ]}
              openDebts={(openDebts?.rows ?? []).map((row) => ({
                id: row.id,
                unitId: id,
                label: `${row.description}${row.period ? ` · ${fmt.period(row.period)}` : ""}`,
                remaining: fmt.money(
                  row.amountMinor + row.lateFeeMinor - row.paidMinor,
                ),
              }))}
              payers={activeOccupants.map((occupant) => ({
                id: occupant.userId,
                label:
                  [occupant.firstName, occupant.lastName]
                    .filter(Boolean)
                    .join(" ") || occupant.userId,
              }))}
              bankAccounts={(bank?.accounts ?? [])
                .filter((account) => account.isActive)
                .map((account) => ({
                  id: account.id,
                  label: `${account.bankName}${account.ibanMasked ? ` · ${account.ibanMasked}` : ""}`,
                }))}
              labels={{
                trigger: tDebts("collectFromUnit"),
                title: tDebts("collectTitle"),
                hint: tDebts("collectHint"),
                cancel: tCommon("action.cancel"),
                submit: tDebts("collectAction"),
                unit: tDebts("collectUnitLabel"),
                amount: tDebts("collectAmount"),
                method: t("method"),
                methodTransfer: tEnum("paymentMethod.bank_transfer"),
                methodCash: tEnum("paymentMethod.cash"),
                methodCard: tEnum("paymentMethod.card"),
                methodOffset: tEnum("paymentMethod.offset"),
                paidAt: t("paidAt"),
                bankAccount: tDebts("bankAccount"),
                bankAccountHint: tDebts("bankAccountHint"),
                bankAccountNone: tDebts("bankAccountNone"),
                noBankAccounts: tDebts("noBankAccounts"),
                payer: tDebts("payer"),
                payerHint: tDebts("payerHint"),
                receiptNo: t("receiptNo"),
                targetDebts: tDebts("targetDebts"),
                targetDebtsHint: tDebts("targetDebtsHint"),
                noOpenDebts: tDebts("noOpenDebts"),
                note: tDebts("note"),
              }}
            />
            <Link
              href={`/panel/borclar/yeni?birim=${id}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("quickNewDebt")}
            </Link>
            <Link
              href={`/panel/sakinler/yeni?birim=${id}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("quickNewResident")}
            </Link>
            <Link
              href={`/panel/birimler/${id}/duzenle`}
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
          value={fmt.money(detail.debtSummary.outstandingMinor)}
          tone={detail.debtSummary.outstandingMinor > 0 ? "danger" : "success"}
        />
        <Stat
          label={t("overdue")}
          value={fmt.money(detail.debtSummary.overdueMinor)}
          tone={detail.debtSummary.overdueMinor > 0 ? "danger" : "neutral"}
        />
        <Stat
          label={t("paidThisYear")}
          value={fmt.money(detail.debtSummary.paidThisYearMinor)}
        />
        <Stat
          label={t("openDebtCount")}
          value={String(detail.debtSummary.openCount)}
        />
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
                        label={t("block")}
                        value={detail.block?.name ?? "—"}
                      />
                      <Row label={t("floor")} value={String(unit.floor)} />
                      <Row
                        label={t("type")}
                        value={tEnum(`unitType.${unit.type}`)}
                      />
                      <Row
                        label={t("area")}
                        value={
                          unit.areaM2
                            ? `${Number(unit.areaM2).toLocaleString(fmt.locale)} m²`
                            : "—"
                        }
                      />
                      <Row label={t("landShare")} value={share} />
                      <Row
                        label={t("roomCount")}
                        value={unit.roomCount ?? "—"}
                      />
                      <Row
                        label={t("residentCount")}
                        value={String(unit.residentCount)}
                      />
                      <Row
                        label={t("duesMultiplier")}
                        value={unit.duesMultiplier}
                      />
                      <Row
                        label={t("ownershipType")}
                        value={tEnum(`occupancy.${unit.ownershipType}`)}
                      />
                      <Row
                        label={t("createdAt")}
                        value={fmt.date(unit.createdAt)}
                      />
                    </dl>
                    {unit.notes ? (
                      <div className="mt-4 rounded-lg bg-surface-sunken p-3 text-sm text-fg-muted">
                        {unit.notes}
                      </div>
                    ) : null}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title={t("tabOccupants")}
                    action={
                      <Link
                        href={`/panel/sakinler/yeni?birim=${id}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        {tCommon("action.add")}
                      </Link>
                    }
                  />
                  <CardBody className="p-0">
                    {activeOccupants.length === 0 ? (
                      <p className="p-6 text-center text-sm text-fg-subtle">
                        {t("noOccupants")}
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {activeOccupants.map((occupant) => (
                          <li
                            key={occupant.occupancyId}
                            className="flex items-start gap-3 p-4"
                          >
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/panel/sakinler/${occupant.userId}`}
                                className="text-sm font-medium text-fg hover:underline"
                              >
                                {[occupant.firstName, occupant.lastName]
                                  .filter(Boolean)
                                  .join(" ") || t("unnamed")}
                              </Link>
                              <p className="text-xs tabular-nums text-fg-muted">
                                {occupant.phoneMasked ?? "—"}
                              </p>
                              <p className="mt-0.5 text-xs text-fg-subtle">
                                {t("since", {
                                  date: fmt.date(occupant.startDate),
                                })}
                                {Number(occupant.ownershipPct) < 100
                                  ? ` · ${Number(occupant.ownershipPct).toFixed(2)}%`
                                  : ""}
                              </p>
                            </div>
                            <Badge
                              tone={
                                occupant.relation === "owner" ? "brand" : "info"
                              }
                            >
                              {tEnum(`occupancy.${occupant.relation}`)}
                            </Badge>
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
            key: "sakinler",
            label: t("tabOccupants"),
            count: activeOccupants.length,
            panel: (
              <Card>
                <CardHeader
                  title={t("tabOccupants")}
                  description={t("occupancyHistoryHint")}
                  action={
                    <Link
                      href={`/panel/sakinler/yeni?birim=${id}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
                    >
                      <Plus aria-hidden className="h-4 w-4" />
                      {t("quickNewResident")}
                    </Link>
                  }
                />
                <CardBody className="p-0">
                  <div className={tc.wrapper}>
                    <table className={tc.table} style={{ minWidth: 720 }}>
                      <thead className={tc.thead}>
                        <tr>
                          <th scope="col" className={tc.th}>
                            {t("fullName")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("relation")}
                          </th>
                          <th scope="col" className={`${tc.th} text-right`}>
                            {t("sharePct")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("startDate")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("endDate")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("debtTransferPolicy")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.occupants.length === 0 ? (
                          <tr>
                            <td colSpan={6} className={tc.empty}>
                              {t("noOccupants")}
                            </td>
                          </tr>
                        ) : (
                          detail.occupants.map((occupant) => (
                            <tr key={occupant.occupancyId} className={tc.tr}>
                              <td className={`${tc.td} font-medium`}>
                                <Link
                                  href={`/panel/sakinler/${occupant.userId}`}
                                  className="hover:underline"
                                >
                                  {[occupant.firstName, occupant.lastName]
                                    .filter(Boolean)
                                    .join(" ") || t("unnamed")}
                                </Link>
                              </td>
                              <td className={tc.td}>
                                <Badge
                                  tone={
                                    occupant.relation === "owner"
                                      ? "brand"
                                      : "info"
                                  }
                                >
                                  {tEnum(`occupancy.${occupant.relation}`)}
                                </Badge>
                              </td>
                              <td className={tc.tdNum}>
                                {Number(occupant.ownershipPct).toFixed(2)}
                              </td>
                              <td className={tc.td}>
                                {fmt.date(occupant.startDate)}
                              </td>
                              <td className={tc.tdMuted}>
                                {occupant.endDate
                                  ? fmt.date(occupant.endDate)
                                  : t("ongoing")}
                              </td>
                              <td className={tc.tdMuted}>
                                {t(
                                  `transferPolicy.${occupant.debtTransferPolicy}`,
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {pastOccupants.length > 0 ? (
                    <p className="border-t border-border px-4 py-2 text-xs text-fg-subtle">
                      {t("pastOccupantCount", { count: pastOccupants.length })}
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            ),
          },
          {
            key: "borclar",
            label: t("tabDebts"),
            count: detail.debtSummary.openCount,
            panel: (
              <Card>
                <CardHeader
                  title={t("tabDebts")}
                  action={
                    <Link
                      href={`/panel/borclar/yeni?birim=${id}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
                    >
                      <Plus aria-hidden className="h-4 w-4" />
                      {t("quickNewDebt")}
                    </Link>
                  }
                />
                <CardBody className="p-0">
                  <div className={tc.wrapper}>
                    <table className={tc.table} style={{ minWidth: 720 }}>
                      <thead className={tc.thead}>
                        <tr>
                          <th scope="col" className={tc.th}>
                            {t("debtDescription")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("period")}
                          </th>
                          <th scope="col" className={`${tc.th} text-right`}>
                            {t("amount")}
                          </th>
                          <th scope="col" className={`${tc.th} text-right`}>
                            {t("paid")}
                          </th>
                          <th scope="col" className={`${tc.th} text-right`}>
                            {t("lateFee")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("dueDate")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("status")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.recentDebts.length === 0 ? (
                          <tr>
                            <td colSpan={7} className={tc.empty}>
                              {t("noDebts")}
                            </td>
                          </tr>
                        ) : (
                          detail.recentDebts.map((debt) => (
                            <tr key={debt.id} className={tc.tr}>
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
                              <td className={tc.tdNum}>
                                {debt.lateFeeMinor > 0
                                  ? fmt.money(debt.lateFeeMinor)
                                  : "—"}
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
            count: detail.recentPayments.length,
            panel: (
              <Card>
                <CardHeader title={t("tabPayments")} />
                <CardBody className="p-0">
                  <div className={tc.wrapper}>
                    <table className={tc.table} style={{ minWidth: 640 }}>
                      <thead className={tc.thead}>
                        <tr>
                          <th scope="col" className={tc.th}>
                            {t("paidAt")}
                          </th>
                          <th scope="col" className={`${tc.th} text-right`}>
                            {t("amount")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("method")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("status")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("receiptNo")}
                          </th>
                          {canVoid ? (
                            <th scope="col" className={tc.th}>
                              <span className="sr-only">{tEnum("paymentStatus.cancelled")}</span>
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.recentPayments.length === 0 ? (
                          <tr>
                            <td colSpan={canVoid ? 6 : 5} className={tc.empty}>
                              {t("noPayments")}
                            </td>
                          </tr>
                        ) : (
                          detail.recentPayments.map((payment) => (
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
            key: "sayaclar",
            label: t("tabMeters"),
            count: detail.meters.length,
            panel: (
              <Card>
                <CardHeader
                  title={t("tabMeters")}
                  description={t("metersHint")}
                />
                <CardBody className="p-0">
                  <div className={tc.wrapper}>
                    <table className={tc.table} style={{ minWidth: 560 }}>
                      <thead className={tc.thead}>
                        <tr>
                          <th scope="col" className={tc.th}>
                            {t("meterType")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("serialNo")}
                          </th>
                          <th scope="col" className={`${tc.th} text-right`}>
                            {t("lastReading")}
                          </th>
                          <th scope="col" className={tc.th}>
                            {t("lastReadAt")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.meters.length === 0 ? (
                          <tr>
                            <td colSpan={4} className={tc.empty}>
                              {t("noMeters")}
                            </td>
                          </tr>
                        ) : (
                          detail.meters.map((meter) => (
                            <tr key={meter.id} className={tc.tr}>
                              <td className={tc.td}>
                                {tEnum(`meterType.${meter.type}`)}
                              </td>
                              <td className={tc.tdMuted}>
                                {meter.serialNo ?? "—"}
                              </td>
                              <td className={tc.tdNum}>
                                {meter.lastReading ?? "—"}
                              </td>
                              <td className={tc.tdMuted}>
                                {meter.lastReadAt
                                  ? fmt.date(new Date(meter.lastReadAt))
                                  : "—"}
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
            key: "belgeler",
            label: t("tabDocuments"),
            count: detail.documents.length,
            panel: (
              <Card>
                <CardHeader title={t("tabDocuments")} />
                <CardBody className="p-0">
                  {detail.documents.length === 0 ? (
                    <p className="p-6 text-center text-sm text-fg-subtle">
                      {t("noDocuments")}
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {detail.documents.map((document) => (
                        <li
                          key={document.id}
                          className="flex items-center justify-between gap-3 p-4"
                        >
                          <span className="min-w-0 truncate text-sm text-fg">
                            {document.title}
                          </span>
                          <span className="shrink-0 text-xs text-fg-subtle">
                            {tEnum(`documentCategory.${document.category}`)} ·{" "}
                            {fmt.date(document.createdAt)}
                          </span>
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
      <dd className="font-medium text-fg">{value}</dd>
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
