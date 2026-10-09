"use client";

import { FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import type { MeterVendorPreview } from "@yonetim/contracts";
import { Alert, Badge, Card, CardBody, CardHeader, DateInput, Input, MoneyInput, Spinner, kurusToDisplay, tableClasses as tc, useToast } from "@yonetim/ui";

import { importVendorFile, previewVendorFile, type VendorFileInput } from "../actions";

const TONE = { ok: "success", unmatched: "danger", no_unit: "warning", already: "info", zero: "neutral" } as const;

/** Dosya → eşleşme önizlemesi → borçlandır. Sunucu durumsuz: her adımda aynı dosya gider. */
export function VendorImporter({ defaultPeriod }: { defaultPeriod: string }) {
  const t = useTranslations("app.meterVendor");
  const toast = useToast();
  const router = useRouter();
  const [period, setPeriod] = useState(defaultPeriod);
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [fee, setFee] = useState(0);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [preview, setPreview] = useState<MeterVendorPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const input = (f = file): VendorFileInput | null =>
    f ? { period, fileBase64: f.base64, dueDate: dueDate || undefined, description, readingFeeKurus: fee } : null;

  const runPreview = (f = file) => {
    const body = input(f);
    if (!body) return;
    start(async () => {
      const r = await previewVendorFile(body);
      if (r.ok) {
        setPreview(r.data);
        setError(null);
      } else {
        setPreview(null);
        setError(r.message);
      }
    });
  };

  const okCount = preview?.rows.filter((r) => r.status === "ok").length ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("step1")} description={t("step1Hint")} />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-fg-subtle">
            {t("period")}
            <Input
              type="month"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setPreview(null);
              }}
              className="mt-0.5"
            />
          </label>
          <label className="text-xs text-fg-subtle">
            {t("dueDate")}
            <DateInput name="dueDate" onValueChange={setDueDate} />
          </label>
          <label className="text-xs text-fg-subtle">
            {t("readingFee")}
            <MoneyInput
              name="fee"
              onKurusChange={(v) => {
                setFee(v);
                setPreview(null);
              }}
            />
          </label>
          <label className="text-xs text-fg-subtle">
            {t("debtDescription")}
            <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} placeholder={t("debtDescriptionPlaceholder")} className="mt-0.5" />
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border-strong p-4 text-sm hover:bg-hover sm:col-span-2 lg:col-span-4">
            <FileSpreadsheet aria-hidden className="h-6 w-6 text-fg-subtle" />
            <span>
              <span className="block font-semibold text-fg">{file ? file.name : t("pickFile")}</span>
              <span className="text-xs text-fg-subtle">{t("fileHint")}</span>
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (!picked) return;
                if (picked.size > 4 * 1024 * 1024) {
                  setError(t("tooLarge"));
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  const next = { name: picked.name, base64: String(reader.result).split(",")[1] ?? "" };
                  setFile(next);
                  runPreview(next);
                };
                reader.readAsDataURL(picked);
              }}
            />
          </label>
          {file ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <button
                type="button"
                onClick={() => runPreview()}
                disabled={pending}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover disabled:opacity-50"
              >
                {pending ? <Spinner label={t("checking")} /> : null}
                {t("recheck")}
              </button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {preview && preview.missing.length > 0 ? (
        <Alert tone="warning" title={t("missingTitle")}>
          {preview.missing.map((m) => t(`missing.${m}`)).join(" · ")}
        </Alert>
      ) : null}

      {preview && preview.missing.length === 0 ? (
        <Card>
          <CardHeader
            title={t("step2", { ok: okCount, total: preview.rows.length })}
            description={t("step2Hint", { amount: kurusToDisplay(preview.totalMinor) })}
            action={
              <button
                type="button"
                disabled={pending || okCount === 0 || !dueDate}
                title={dueDate ? undefined : t("needDueDate")}
                onClick={() => {
                  const body = input();
                  if (!body) return;
                  start(async () => {
                    const r = await importVendorFile(body);
                    if (r.ok) {
                      toast.success(r.message);
                      router.refresh();
                      runPreview();
                    } else toast.error(r.message);
                  });
                }}
                className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
              >
                {t("commit", { count: okCount })}
              </button>
            }
          />
          <CardBody className="p-0">
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("line")}</th>
                    <th scope="col" className={tc.th}>{t("serialNo")}</th>
                    <th scope="col" className={tc.th}>{t("unit")}</th>
                    <th scope="col" className={tc.th}>{t("consumption")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("amount")}</th>
                    <th scope="col" className={tc.th}>{t("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line} className={tc.tr}>
                      <td className={tc.tdMuted}>{r.line}</td>
                      <td className={`${tc.td} font-mono text-xs`}>{r.serialNo}</td>
                      <td className={tc.td}>{r.unitLabel ?? "—"}</td>
                      <td className={tc.tdMuted}>{r.consumption ?? "—"}</td>
                      <td className={tc.tdNum}>{kurusToDisplay(r.amountMinor)} ₺</td>
                      <td className={tc.td}>
                        <Badge tone={TONE[r.status]}>{t(`state.${r.status}`)}</Badge>
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
  );
}
