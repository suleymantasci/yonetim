"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import {
  Alert,
  Badge,
  DateInput,
  Input,
  PeriodInput,
  Switch,
  kurusToDisplay,
  tableClasses as tc,
} from "@yonetim/ui";

import { recordMeterReadings, type ReadingBatchState } from "./actions";

export interface MeterEntryRow {
  id: string;
  label: string;
  typeLabel: string;
  /** Son okunan endeks — kapıcı ne yazacağını bilsin diye gösteriliyor. */
  lastValue: string | null;
  lastPeriod: string | null;
}

/**
 * Dönemsel toplu okuma girişi.
 *
 * TEK FORM, SAYAÇ BAŞINA BİR SATIR. Gerçek iş ayda bir kez binayı dolaşıp
 * bütün sayaçları okumak; sayaç başına ayrı kaydet düğmesi 60 daireli bir
 * binada 60 istek ve yarım kalmış bir tur demekti.
 *
 * BOŞ BIRAKILAN SATIR **ATLANIR, SIFIR SAYILMAZ**. Sıfır sayılsaydı okunamayan
 * bir sayaç (kilitli daire, arızalı gösterge) "bu ay hiç kullanmadı" olarak
 * kaydedilir, bir sonraki dönemde iki dönemlik tüketim tek faturaya binerdi.
 *
 * SON ENDEKS HER SATIRDA GÖRÜNÜYOR: yeni değerin ondan küçük olması bir
 * hatanın işareti ve bunu yazma anında görmek, faturaya yansıdıktan sonra
 * fark etmekten iyi.
 */
export function ReadingBatchForm({ meters }: { meters: MeterEntryRow[] }) {
  const t = useTranslations("app.meters");
  const [state, formAction, pending] = useActionState<
    ReadingBatchState,
    FormData
  >(recordMeterReadings, { ok: false });

  if (meters.length === 0) {
    return <Alert tone="info">{t("batchNoMeters")}</Alert>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg">{t("period")}</span>
          <PeriodInput name="period" defaultValue={currentPeriod()} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg">
            {t("readingDate")}
          </span>
          <DateInput name="readingDate" defaultValue={today()} required />
        </label>
        <div className="sm:col-span-1">
          <Switch
            name="overwrite"
            label={t("overwrite")}
            description={t("overwriteHint")}
          />
        </div>
      </div>

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
              <th scope="col" className={`${tc.th} text-right`}>
                {t("lastValue")}
              </th>
              <th scope="col" className={`${tc.th} text-right`}>
                {t("newValue")}
              </th>
            </tr>
          </thead>
          <tbody>
            {meters.map((m) => (
              <tr key={m.id} className={tc.tr}>
                <td className={`${tc.td} font-medium`}>{m.label}</td>
                <td className={tc.tdMuted}>{m.typeLabel}</td>
                <td className={tc.tdNum}>
                  {m.lastValue ?? "—"}
                  {m.lastPeriod ? (
                    <div className="text-xs text-fg-subtle">{m.lastPeriod}</div>
                  ) : null}
                </td>
                <td className={tc.td}>
                  <Input
                    name={`meter_${m.id}`}
                    type="number"
                    step="0.001"
                    min={0}
                    inputMode="decimal"
                    aria-label={t("newValueFor", { meter: m.label })}
                    className="w-32 text-right"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-fg-subtle">{t("batchEmptyRowHint")}</p>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? t("batchSaving") : t("batchSubmit")}
      </button>

      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      {state.data && state.data.totalKurus > 0 ? (
        <Alert tone="info">
          {t("batchTotal", {
            amount: `${kurusToDisplay(state.data.totalKurus)} ₺`,
          })}
        </Alert>
      ) : null}

      {state.data && state.data.flagged.length > 0 ? (
        <Alert tone="warning" title={t("batchAnomalyTitle")}>
          <ul className="mt-1 space-y-1 text-sm">
            {state.data.flagged.map((f) => (
              <li key={f.meterId} className="flex items-center gap-2">
                <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
                <span>{f.unitNumber ?? t("commonAreaShort")}</span>
                <span className="tabular-nums">{f.consumption}</span>
                <Badge tone="warning">
                  {f.reason === "negative"
                    ? t("anomalyNegative")
                    : t("anomalySpike")}
                </Badge>
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </form>
  );
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
