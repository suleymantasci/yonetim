import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { maskPhone } from "@yonetim/core";
import {
  Badge, Card, CardBody, CardHeader, Stat, Tabs, tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { logDataAccess } from "@/lib/access";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { getUnitDetail } from "@/lib/queries/units";
import type { SearchParamsInput } from "@/lib/list-params";

export const dynamic = "force-dynamic";

const TAB_KEYS = ["ozet", "sakinler", "borclar", "odemeler", "sayaclar", "belgeler"] as const;
type TabKey = (typeof TAB_KEYS)[number];

/**
 * Birim detayı — GAP 4.1.1 ("bu birimin sakinleri, borçları, ödemeleri,
 * sayaçları, geçmişi, dökümanları tek ekranda sekmeli görünüm").
 *
 * Sekme durumu URL'de (`?sekme=borclar`): paylaşılabilir ve geri tuşuyla
 * gezilebilir. Tüm veri tek sorgu turunda geldiği için sekme geçişi anlık.
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
  const t = await getTranslations("app.units");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const fmt = await formatters();

  const detail = await getUnitDetail(ctx, id);
  if (!detail) notFound();

  const rawTab = Array.isArray(query.sekme) ? query.sekme[0] : query.sekme;
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as TabKey)
    : "ozet";

  // KVKK md.12: sakin bilgisi içeren sekme açıldığında erişim kaydı.
  if (tab === "sakinler" || tab === "ozet") {
    for (const occupant of detail.occupants.filter((o) => o.endDate === null)) {
      await logDataAccess(ctx, {
        subjectUserId: occupant.userId,
        dataCategory: "iletisim_bilgisi",
        action: "view",
        purpose: "unit_detail_view",
      });
    }
  }

  const unit = detail.unit;
  const activeOccupants = detail.occupants.filter((o) => o.endDate === null);
  const pastOccupants = detail.occupants.filter((o) => o.endDate !== null);
  const tabHref = (key: TabKey) =>
    key === "ozet" ? `/panel/birimler/${id}` : `/panel/birimler/${id}?sekme=${key}`;

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
            ? t("detailSubtitleWithBlock", { block: detail.block.name, floor: unit.floor })
            : t("detailSubtitle", { floor: unit.floor })
        }
        breadcrumb={[{ label: t("title"), href: "/panel/birimler" }, { label: unit.number }]}
        meta={
          <>
            <Badge tone="neutral">{tEnum(`unitType.${unit.type}`)}</Badge>
            {unit.duesExempt ? <Badge tone="warning">{t("duesExempt")}</Badge> : null}
            {unit.lateFeeExempt ? <Badge tone="info">{t("lateFeeExempt")}</Badge> : null}
            {unit.deletedAt ? <Badge tone="danger">{t("trashed")}</Badge> : null}
          </>
        }
        action={
          <>
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
          value={fmt.money(detail.debtSummary.outstandingKurus)}
          tone={detail.debtSummary.outstandingKurus > 0 ? "danger" : "success"}
        />
        <Stat
          label={t("overdue")}
          value={fmt.money(detail.debtSummary.overdueKurus)}
          tone={detail.debtSummary.overdueKurus > 0 ? "danger" : "neutral"}
        />
        <Stat label={t("paidThisYear")} value={fmt.money(detail.debtSummary.paidThisYearKurus)} />
        <Stat label={t("openDebtCount")} value={String(detail.debtSummary.openCount)} />
      </div>

      <div className="mb-4">
        <Tabs
          activeKey={tab}
          linkComponent={Link as never}
          label={t("detailTabs")}
          items={[
            { key: "ozet", label: t("tabSummary"), href: tabHref("ozet") },
            {
              key: "sakinler",
              label: t("tabOccupants"),
              href: tabHref("sakinler"),
              count: activeOccupants.length,
            },
            {
              key: "borclar",
              label: t("tabDebts"),
              href: tabHref("borclar"),
              count: detail.debtSummary.openCount,
            },
            {
              key: "odemeler",
              label: t("tabPayments"),
              href: tabHref("odemeler"),
              count: detail.recentPayments.length,
            },
            {
              key: "sayaclar",
              label: t("tabMeters"),
              href: tabHref("sayaclar"),
              count: detail.meters.length,
            },
            {
              key: "belgeler",
              label: t("tabDocuments"),
              href: tabHref("belgeler"),
              count: detail.documents.length,
            },
          ]}
        />
      </div>

      {tab === "ozet" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t("tabSummary")} />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Row label={t("block")} value={detail.block?.name ?? "—"} />
                <Row label={t("floor")} value={String(unit.floor)} />
                <Row label={t("type")} value={tEnum(`unitType.${unit.type}`)} />
                <Row
                  label={t("area")}
                  value={unit.areaM2 ? `${Number(unit.areaM2).toLocaleString(fmt.locale)} m²` : "—"}
                />
                <Row label={t("landShare")} value={share} />
                <Row label={t("roomCount")} value={unit.roomCount ?? "—"} />
                <Row label={t("residentCount")} value={String(unit.residentCount)} />
                <Row label={t("duesMultiplier")} value={unit.duesMultiplier} />
                <Row
                  label={t("ownershipType")}
                  value={tEnum(`occupancy.${unit.ownershipType}`)}
                />
                <Row label={t("createdAt")} value={fmt.date(unit.createdAt)} />
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
                <p className="p-6 text-center text-sm text-fg-subtle">{t("noOccupants")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {activeOccupants.map((occupant) => (
                    <li key={occupant.occupancyId} className="flex items-start gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/panel/sakinler/${occupant.userId}`}
                          className="text-sm font-medium text-fg hover:underline"
                        >
                          {[occupant.firstName, occupant.lastName].filter(Boolean).join(" ") ||
                            t("unnamed")}
                        </Link>
                        <p className="text-xs tabular-nums text-fg-muted">
                          {occupant.phone ? maskPhone(occupant.phone) : "—"}
                        </p>
                        <p className="mt-0.5 text-xs text-fg-subtle">
                          {t("since", { date: fmt.date(occupant.startDate) })}
                          {Number(occupant.ownershipPct) < 100
                            ? ` · ${Number(occupant.ownershipPct).toFixed(2)}%`
                            : ""}
                        </p>
                      </div>
                      <Badge tone={occupant.relation === "owner" ? "brand" : "info"}>
                        {tEnum(`occupancy.${occupant.relation}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "sakinler" ? (
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
                    <th scope="col" className={tc.th}>{t("fullName")}</th>
                    <th scope="col" className={tc.th}>{t("relation")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("sharePct")}</th>
                    <th scope="col" className={tc.th}>{t("startDate")}</th>
                    <th scope="col" className={tc.th}>{t("endDate")}</th>
                    <th scope="col" className={tc.th}>{t("debtTransferPolicy")}</th>
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
                            {[occupant.firstName, occupant.lastName].filter(Boolean).join(" ") ||
                              t("unnamed")}
                          </Link>
                        </td>
                        <td className={tc.td}>
                          <Badge tone={occupant.relation === "owner" ? "brand" : "info"}>
                            {tEnum(`occupancy.${occupant.relation}`)}
                          </Badge>
                        </td>
                        <td className={tc.tdNum}>{Number(occupant.ownershipPct).toFixed(2)}</td>
                        <td className={tc.td}>{fmt.date(occupant.startDate)}</td>
                        <td className={tc.tdMuted}>
                          {occupant.endDate ? fmt.date(occupant.endDate) : t("ongoing")}
                        </td>
                        <td className={tc.tdMuted}>
                          {t(`transferPolicy.${occupant.debtTransferPolicy}`)}
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
      ) : null}

      {tab === "borclar" ? (
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
                    <th scope="col" className={tc.th}>{t("debtDescription")}</th>
                    <th scope="col" className={tc.th}>{t("period")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("amount")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("paid")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("lateFee")}</th>
                    <th scope="col" className={tc.th}>{t("dueDate")}</th>
                    <th scope="col" className={tc.th}>{t("status")}</th>
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
                          <Link href={`/panel/borclar/${debt.id}`} className="hover:underline">
                            {debt.description}
                          </Link>
                        </td>
                        <td className={tc.tdMuted}>
                          {debt.period ? fmt.period(debt.period) : "—"}
                        </td>
                        <td className={tc.tdNum}>{fmt.money(debt.amountKurus)}</td>
                        <td className={tc.tdNum}>{fmt.money(debt.paidKurus)}</td>
                        <td className={tc.tdNum}>
                          {debt.lateFeeKurus > 0 ? fmt.money(debt.lateFeeKurus) : "—"}
                        </td>
                        <td className={tc.td}>{fmt.date(debt.dueDate)}</td>
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
      ) : null}

      {tab === "odemeler" ? (
        <Card>
          <CardHeader title={t("tabPayments")} />
          <CardBody className="p-0">
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 640 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("paidAt")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("amount")}</th>
                    <th scope="col" className={tc.th}>{t("method")}</th>
                    <th scope="col" className={tc.th}>{t("status")}</th>
                    <th scope="col" className={tc.th}>{t("receiptNo")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.recentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={tc.empty}>
                        {t("noPayments")}
                      </td>
                    </tr>
                  ) : (
                    detail.recentPayments.map((payment) => (
                      <tr key={payment.id} className={tc.tr}>
                        <td className={tc.td}>
                          {payment.paidAt ? fmt.dateTime(payment.paidAt) : "—"}
                        </td>
                        <td className={tc.tdNum}>{fmt.money(payment.amountKurus)}</td>
                        <td className={tc.td}>{tEnum(`paymentMethod.${payment.method}`)}</td>
                        <td className={tc.td}>
                          <Badge tone={payment.status === "completed" ? "success" : "neutral"}>
                            {tEnum(`paymentStatus.${payment.status}`)}
                          </Badge>
                        </td>
                        <td className={tc.tdMuted}>{payment.receiptNo ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {tab === "sayaclar" ? (
        <Card>
          <CardHeader title={t("tabMeters")} description={t("metersHint")} />
          <CardBody className="p-0">
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 560 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("meterType")}</th>
                    <th scope="col" className={tc.th}>{t("serialNo")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("lastReading")}</th>
                    <th scope="col" className={tc.th}>{t("lastReadAt")}</th>
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
                        <td className={tc.td}>{tEnum(`meterType.${meter.type}`)}</td>
                        <td className={tc.tdMuted}>{meter.serialNo ?? "—"}</td>
                        <td className={tc.tdNum}>{meter.lastReading ?? "—"}</td>
                        <td className={tc.tdMuted}>
                          {meter.lastReadAt ? fmt.date(new Date(meter.lastReadAt)) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {tab === "belgeler" ? (
        <Card>
          <CardHeader title={t("tabDocuments")} />
          <CardBody className="p-0">
            {detail.documents.length === 0 ? (
              <p className="p-6 text-center text-sm text-fg-subtle">{t("noDocuments")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {detail.documents.map((document) => (
                  <li key={document.id} className="flex items-center justify-between gap-3 p-4">
                    <span className="min-w-0 truncate text-sm text-fg">{document.title}</span>
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
      ) : null}
    </>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="font-medium text-fg">{value}</dd>
    </>
  );
}

function debtTone(status: string): "success" | "danger" | "warning" | "neutral" {
  if (status === "paid") return "success";
  if (status === "overdue" || status === "in_legal") return "danger";
  if (status === "partial") return "warning";
  return "neutral";
}
