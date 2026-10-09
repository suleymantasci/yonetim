"use client";

import { Calculator } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import type { HeatCostPreview, HeatCostRequest } from "@yonetim/contracts";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DateInput,
  Input,
  MoneyInput,
  Select,
  Spinner,
  Switch,
  kurusToDisplay,
  tableClasses as tc,
  useToast,
} from "@yonetim/ui";

import { billHeatCost, previewHeatCost } from "../actions";

type Mode = HeatCostRequest["mode"];
const num = (v: string) => Number(v.replace(",", ".")) || 0;
const fmt = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 3 });

/**
 * Isı pay ölçerli paylaşım formu. Hesap sunucuda (`computeHeatShares`);
 * ekran yalnız girdi toplar ve önizlemeyi gösterir. Girdi değişince önizleme
 * düşer — borçlandır yalnız güncel önizlemeyle.
 */
export function HeatCostForm({
  defaultPeriod,
  blocks,
  debtTypes,
}: {
  defaultPeriod: string;
  blocks: { id: string; name: string }[];
  debtTypes: { id: string; name: string; baseKind: string }[];
}) {
  const t = useTranslations("app.heatCost");
  const toast = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("heat");
  const [period, setPeriod] = useState(defaultPeriod);
  const [invoice, setInvoice] = useState(0);
  const [commonPct, setCommonPct] = useState("30");
  const [minPct, setMinPct] = useState("");
  const [fee, setFee] = useState(0);
  const [rounding, setRounding] = useState<HeatCostRequest["rounding"]>("none");
  const [blockIds, setBlockIds] = useState<string[]>([]);
  const [water, setWater] = useState({ coldWaterPriceMinor: 0, inletTemp: "10", outletTemp: "55", lowerHeatingValue: "8250", gasConsumptionM3: "" });
  const [summerSplit, setSummerSplit] = useState(false);
  const [debtTypeId, setDebtTypeId] = useState(debtTypes.find((x) => x.baseKind === "utility")?.id ?? "");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [preview, setPreview] = useState<HeatCostPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPreview(null);
  };
  const needsWater = mode === "heat_water" || mode === "summer_water";
  const body = (): HeatCostRequest => ({
    period,
    mode,
    invoiceMinor: invoice,
    commonPct: num(commonPct),
    minConsumptionPct: minPct.trim() === "" ? null : num(minPct),
    readingFeeMinor: fee,
    rounding,
    blockIds,
    water: needsWater
      ? {
          coldWaterPriceMinor: water.coldWaterPriceMinor,
          inletTemp: num(water.inletTemp),
          outletTemp: num(water.outletTemp),
          lowerHeatingValue: num(water.lowerHeatingValue),
          gasConsumptionM3: num(water.gasConsumptionM3),
        }
      : null,
    summerSplitEnergy: summerSplit,
    debtTypeId: debtTypeId || null,
    description: description.trim() || null,
    dueDate: dueDate ? new Date(`${dueDate}T20:59:00.000Z`) : null,
  });

  const runPreview = () =>
    start(async () => {
      const r = await previewHeatCost(body());
      if (r.ok) {
        setPreview(r.data);
        setError(null);
      } else {
        setPreview(null);
        setError(r.message);
      }
    });

  const label = "text-xs text-fg-subtle";
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("inputs")} description={t("inputsHint")} />
        <CardBody className="space-y-4">
          <div role="radiogroup" aria-label={t("mode")} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(["heat", "heat_water", "summer_water"] as const).map((m) => (
              <label key={m} className={`cursor-pointer rounded-lg border p-3 text-sm ${mode === m ? "border-primary bg-primary-soft" : "border-border hover:bg-hover"}`}>
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => touch(setMode)(m)} className="sr-only" />
                <span className="block font-semibold text-fg">{t(`modes.${m}`)}</span>
                <span className="text-xs text-fg-subtle">{t(`modes.${m}Hint`)}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={label}>
              {t("period")}
              <Input type="month" value={period} onChange={(e) => touch(setPeriod)(e.target.value)} className="mt-0.5" />
            </label>
            <label className={label}>
              {t("invoice")}
              <MoneyInput name="invoice" onKurusChange={touch(setInvoice)} required />
            </label>
            {mode !== "summer_water" ? (
              <>
                <label className={label}>
                  {t("commonPct")}
                  <Input inputMode="decimal" value={commonPct} onChange={(e) => touch(setCommonPct)(e.target.value)} className="mt-0.5" />
                </label>
                <label className={label}>
                  {t("minPct")}
                  <Input inputMode="decimal" value={minPct} onChange={(e) => touch(setMinPct)(e.target.value)} placeholder={t("minPctPlaceholder")} className="mt-0.5" />
                </label>
              </>
            ) : null}
            <label className={label}>
              {t("readingFee")}
              <MoneyInput name="fee" onKurusChange={touch(setFee)} />
            </label>
            <label className={label}>
              {t("rounding")}
              <Select value={rounding} onChange={(e) => touch(setRounding)(e.target.value as HeatCostRequest["rounding"])} className="mt-0.5">
                <option value="none">{t("roundNone")}</option>
                <option value="lira">{t("roundLira")}</option>
                <option value="ten_kurus">{t("roundTen")}</option>
              </Select>
            </label>
            {blocks.length > 1 ? (
              <label className={label}>
                {t("block")}
                <Select value={blockIds[0] ?? ""} onChange={(e) => touch(setBlockIds)(e.target.value ? [e.target.value] : [])} className="mt-0.5">
                  <option value="">{t("allBlocks")}</option>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
          </div>
          {minPct.trim() !== "" && mode !== "summer_water" ? <p className="text-xs text-fg-subtle">{t("minPctHint")}</p> : null}

          {needsWater ? (
            <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-semibold text-fg">{t("water")}</legend>
              <p className="mb-3 text-xs text-fg-subtle">{t("waterHint")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className={label}>
                  {t("gasM3")}
                  <Input inputMode="decimal" value={water.gasConsumptionM3} onChange={(e) => touch(setWater)({ ...water, gasConsumptionM3: e.target.value })} className="mt-0.5" />
                </label>
                <label className={label}>
                  {t("lhv")}
                  <Input inputMode="decimal" value={water.lowerHeatingValue} onChange={(e) => touch(setWater)({ ...water, lowerHeatingValue: e.target.value })} className="mt-0.5" />
                </label>
                <label className={label}>
                  {t("inletTemp")}
                  <Input inputMode="decimal" value={water.inletTemp} onChange={(e) => touch(setWater)({ ...water, inletTemp: e.target.value })} className="mt-0.5" />
                </label>
                <label className={label}>
                  {t("outletTemp")}
                  <Input inputMode="decimal" value={water.outletTemp} onChange={(e) => touch(setWater)({ ...water, outletTemp: e.target.value })} className="mt-0.5" />
                </label>
                <label className={label}>
                  {t("coldWaterPrice")}
                  <MoneyInput name="cold" onKurusChange={(v) => touch(setWater)({ ...water, coldWaterPriceMinor: v })} />
                </label>
              </div>
              {mode === "summer_water" ? (
                <div className="mt-3">
                  <Switch label={t("summerSplit")} description={t("summerSplitHint")} checked={summerSplit} onCheckedChange={touch(setSummerSplit)} />
                </div>
              ) : null}
            </fieldset>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={runPreview}
              disabled={pending || invoice <= 0}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold text-fg hover:bg-hover disabled:opacity-50"
            >
              {pending ? <Spinner label={t("calculating")} /> : <Calculator aria-hidden className="h-4 w-4" />}
              {t("calculate")}
            </button>
          </div>
        </CardBody>
      </Card>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {preview?.error ? <Alert tone="warning">{t(`error.${preview.error}`)}</Alert> : null}
      {preview?.alreadyBilled ? <Alert tone="warning">{t("alreadyBilled")}</Alert> : null}
      {preview && preview.missingArea > 0 ? <Alert tone="info">{t("missingArea", { count: preview.missingArea })}</Alert> : null}

      {preview && !preview.error ? (
        <Card>
          <CardHeader
            title={t("result", { count: preview.rows.length, total: kurusToDisplay(preview.totals.totalMinor) })}
            description={t("resultHint", {
              area: fmt(preview.totals.areaM2),
              heat: fmt(preview.totals.heatConsumption),
              water: fmt(preview.totals.waterConsumption),
              waterHeating: kurusToDisplay(preview.totals.waterHeatingMinor),
            })}
          />
          <CardBody className="p-0">
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("unit")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>m²</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("consumption")}</th>
                    {needsWater ? <th scope="col" className={`${tc.th} text-right`}>{t("waterCol")}</th> : null}
                    {mode !== "summer_water" ? <th scope="col" className={`${tc.th} text-right`}>{t("commonCol")}</th> : null}
                    {mode !== "summer_water" ? <th scope="col" className={`${tc.th} text-right`}>{t("usageCol")}</th> : <th scope="col" className={`${tc.th} text-right`}>{t("commonCol")}</th>}
                    {needsWater ? <th scope="col" className={`${tc.th} text-right`}>{t("waterCostCol")}</th> : null}
                    <th scope="col" className={`${tc.th} text-right`}>{t("total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.unitId} className={tc.tr}>
                      <td className={tc.td}>
                        {r.unitLabel}
                        {!r.hasHeatMeter && mode !== "summer_water" ? <span className="block text-xs text-fg-subtle">{t("noMeter")}</span> : null}
                      </td>
                      <td className={tc.tdNum}>{fmt(r.areaM2)}</td>
                      <td className={tc.tdNum}>
                        {fmt(r.heatConsumption)}
                        {r.minApplied ? (
                          <Badge tone="warning" className="ml-1">
                            {t("minApplied", { value: fmt(r.adjustedConsumption) })}
                          </Badge>
                        ) : null}
                      </td>
                      {needsWater ? <td className={tc.tdNum}>{fmt(r.waterConsumption)}</td> : null}
                      {mode !== "summer_water" ? <td className={tc.tdNum}>{kurusToDisplay(r.commonMinor)}</td> : null}
                      {mode !== "summer_water" ? <td className={tc.tdNum}>{kurusToDisplay(r.consumptionMinor)}</td> : <td className={tc.tdNum}>{kurusToDisplay(r.commonMinor)}</td>}
                      {needsWater ? <td className={tc.tdNum}>{kurusToDisplay(r.coldWaterMinor + r.waterHeatingMinor)}</td> : null}
                      <td className={`${tc.tdNum} font-semibold`}>{kurusToDisplay(r.totalMinor)} ₺</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
          <CardBody className="grid grid-cols-1 gap-3 border-t border-border sm:grid-cols-4">
            <label className={label}>
              {t("debtType")}
              <Select value={debtTypeId} onChange={(e) => setDebtTypeId(e.target.value)} className="mt-0.5">
                {debtTypes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className={`${label} sm:col-span-2`}>
              {t("description")}
              <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} placeholder={t("descriptionPlaceholder", { period })} className="mt-0.5" />
            </label>
            <label className={label}>
              {t("dueDate")}
              <DateInput name="dueDate" onValueChange={setDueDate} required />
            </label>
            <div className="flex justify-end sm:col-span-4">
              <button
                type="button"
                disabled={pending || !dueDate || preview.alreadyBilled}
                title={dueDate ? undefined : t("needDueDate")}
                onClick={() =>
                  start(async () => {
                    const r = await billHeatCost(body());
                    if (r.ok) {
                      toast.success(r.message);
                      router.push("/panel/borclar");
                    } else toast.error(r.message);
                  })
                }
                className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
              >
                {t("bill", { count: preview.rows.filter((r) => r.totalMinor > 0).length })}
              </button>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
