import { ClipboardList, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { meterListResponse } from "@yonetim/contracts";
import {
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

export default async function MetersPage() {
  const ctx = await requirePermission("meter:read");
  const t = await getTranslations("app.meters");
  const tEnum = await getTranslations("enum");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const { meters, readings, totals } = await apiGet(
    "/v1/panel/operations/meters",
    meterListResponse,
  );

  const canWrite = hasPermission(ctx.roles, "meter:write");
  const actions = canWrite ? (
    <div className="flex flex-wrap items-center gap-2">
      {/* Okuma girişi birincil eylem: sayaç tanımı yılda bir, okuma ayda bir. */}
      <Link
        href="/panel/sayaclar/okuma"
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
      >
        <ClipboardList aria-hidden className="h-4 w-4" />
        {t("batchTitle")}
      </Link>
      <Link
        href="/panel/sayaclar/yeni"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-fg hover:bg-hover"
      >
        <Plus aria-hidden className="h-4 w-4" />
        {t("newMeter")}
      </Link>
    </div>
  ) : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={actions}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("defined")} value={String(totals.defined)} />
        <Stat
          label={t("recentReadings")}
          value={String(totals.recentReadings)}
        />
        <Stat
          label={t("anomalies")}
          value={String(totals.anomalies)}
          tone={totals.anomalies ? "warning" : "success"}
        />
      </div>

      {/*
        Tanımlı sayaçlar listesi okumalardan **ayrı** bir kart: ikisi farklı
        soruların cevabı ("hangi sayaçlar var" ve "bu dönem ne okundu") ve
        tek tabloya sıkıştırmak, hiç okunmamış bir sayacın görünmez kalmasına
        yol açardı — oysa eksik okuma tam da aranan şey.
      */}
      <Card className="mt-4">
        <CardHeader
          title={t("definedMeters")}
          description={t("definedMetersHint")}
        />
        <CardBody className="p-0">
          {meters.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("noMetersTitle")}
                description={t("noMetersDescription")}
                action={
                  canWrite ? (
                    <Link
                      href="/panel/sayaclar/yeni"
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
                    >
                      <Plus aria-hidden className="h-4 w-4" />
                      {t("newMeter")}
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 560 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>
                      {t("meterColumn")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("type")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("serialNo")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("unitPrice")}
                    </th>
                    {canWrite ? (
                      <th scope="col" className={`${tc.th} w-10`}>
                        <span className="sr-only">{tCommon("action.edit")}</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {meters.map((m) => (
                    <tr key={m.id} className={tc.tr}>
                      <td className={`${tc.td} font-medium`}>
                        {m.isCommon
                          ? t("commonAreaShort")
                          : (m.unitNumber ?? t("unknownUnit"))}
                        {!m.isActive ? (
                          <Badge tone="neutral">{tCommon("state.inactive")}</Badge>
                        ) : null}
                      </td>
                      <td className={tc.tdMuted}>
                        {tEnum(`meterType.${m.type}`)}
                      </td>
                      <td className={`${tc.tdMuted} font-mono text-xs`}>
                        {m.serialNo ?? "—"}
                      </td>
                      <td className={tc.tdNum}>{f.money(m.unitPriceMinor)}</td>
                      {canWrite ? (
                        <td className={tc.td}>
                          <Link
                            href={`/panel/sayaclar/${m.id}/duzenle`}
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
        <CardHeader title={t("recentReadings")} />
        <CardBody className="p-0">
          {readings.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
                action={
                  canWrite && meters.length > 0 ? (
                    <Link
                      href="/panel/sayaclar/okuma"
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
                    >
                      <ClipboardList aria-hidden className="h-4 w-4" />
                      {t("batchTitle")}
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 640 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>
                      {t("period")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("type")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("previous")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("current")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("consumption")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("amount")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("date")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r) => {
                    return (
                      <tr key={r.id} className={tc.tr}>
                        <td className={tc.td}>{f.period(r.period)}</td>
                        <td className={tc.td}>
                          {/* Sayaç türü sunucuda join'lendi. */}
                          {r.meterType
                            ? tEnum(`meterType.${r.meterType}`)
                            : "—"}
                        </td>
                        <td className={tc.tdNum}>{r.previousValue}</td>
                        <td className={tc.tdNum}>{r.currentValue}</td>
                        <td className={tc.tdNum}>
                          {r.consumption}
                          {r.anomalyFlag ? (
                            <Badge tone="warning">{t("anomalyBadge")}</Badge>
                          ) : null}
                        </td>
                        <td className={tc.tdNum}>{f.money(r.amountMinor)}</td>
                        <td className={tc.tdMuted}>{f.date(r.readingDate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
