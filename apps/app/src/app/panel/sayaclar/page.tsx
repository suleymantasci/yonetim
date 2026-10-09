import { ClipboardList, FileSpreadsheet, Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { meterListResponse } from "@yonetim/contracts";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DateInput,
  EmptyState,
  Input,
  MoneyInput,
  Stat,
  Switch,
  tableClasses as tc,
  Textarea,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ActionDrawerButton } from "@/components/form/action-drawer-button";
import { FormField } from "@/components/form/action-form";
import {
  billMeterPeriod,
  correctMeterReading,
  removeMeterReading,
} from "./actions";
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
        href="/panel/sayaclar/firma-dosyasi"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-fg hover:bg-hover"
      >
        <FileSpreadsheet aria-hidden className="h-4 w-4" />
        {t("vendorFile")}
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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
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

      <Card className="mt-4">
        <CardHeader
          title={t("recentReadings")}
          description={t("recentReadingsHint")}
          action={
            canWrite && readings.length > 0 ? (
              <ActionDrawerButton
                action={billMeterPeriod}
                hidden={{}}
                icon={<ReceiptText />}
                label={t("billAction")}
                title={t("billTitle")}
                description={t("billDescription")}
                submitLabel={t("billConfirm")}
              >
                <FormField name="period" label={t("period")} required>
                  <Input
                    name="period"
                    type="month"
                    defaultValue={readings[0]?.period}
                    required
                  />
                </FormField>
                <FormField name="dueDate" label={t("billDueDate")} required>
                  <DateInput name="dueDate" required />
                </FormField>
                <FormField name="readingFeeKurus" label={t("readingFee")} hint={t("readingFeeHint")}>
                  <MoneyInput name="readingFeeKurus" />
                </FormField>
                <Switch name="roundLira" label={t("roundLira")} description={t("roundLiraHint")} />
              </ActionDrawerButton>
            ) : undefined
          }
        />
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
              <table className={tc.table} style={{ minWidth: 760 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>
                      {t("period")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("unit")}
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
                    <th scope="col" className={tc.th}>
                      <span className="sr-only">{t("actionsColumn")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r) => {
                    return (
                      <tr key={r.id} className={tc.tr}>
                        <td className={tc.td}>{f.period(r.period)}</td>
                        <td className={tc.tdMuted}>{r.unitNumber ?? t("commonAreaShort")}</td>
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
                        <td className={tc.td}>
                          {r.billed ? (
                            <Badge tone="success">{t("billedBadge")}</Badge>
                          ) : canWrite ? (
                            <div className="flex justify-end gap-1.5">
                              <ActionDrawerButton
                                action={correctMeterReading}
                                hidden={{ id: r.id }}
                                icon={<Pencil />}
                                label={t("correctAction")}
                                title={t("correctTitle")}
                                description={`${f.period(r.period)} · ${r.unitNumber ?? t("commonAreaShort")} · ${t("previous")}: ${r.previousValue}`}
                                warning={t("correctWarning")}
                                submitLabel={tCommon("action.save")}
                              >
                                <FormField name="currentValue" label={t("current")} required>
                                  <Input
                                    name="currentValue"
                                    inputMode="decimal"
                                    defaultValue={r.currentValue.replace(".", ",")}
                                    required
                                  />
                                </FormField>
                                <FormField name="reason" label={t("reason")} hint={t("reasonHint")} required>
                                  <Textarea name="reason" rows={3} minLength={10} maxLength={500} required />
                                </FormField>
                              </ActionDrawerButton>
                              <ActionDrawerButton
                                action={removeMeterReading}
                                hidden={{ id: r.id }}
                                icon={<Trash2 />}
                                tone="danger"
                                label={tCommon("action.delete")}
                                title={t("deleteTitle")}
                                description={`${f.period(r.period)} · ${r.unitNumber ?? t("commonAreaShort")} · ${r.currentValue}`}
                                warning={t("deleteWarning")}
                                submitLabel={tCommon("action.delete")}
                              >
                                <FormField name="reason" label={t("reason")} hint={t("reasonHint")} required>
                                  <Textarea name="reason" rows={3} minLength={10} maxLength={500} required />
                                </FormField>
                              </ActionDrawerButton>
                            </div>
                          ) : null}
                        </td>
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
