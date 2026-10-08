"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { UNIT_IMPORT_FIELDS, type MigrationPreview, type UnitImportFieldName } from "@yonetim/contracts";
import { Alert, Badge, Card, CardBody, CardHeader, Select, Spinner, cn, tableClasses as tc, useToast } from "@yonetim/ui";

import { commitMigration, previewMigration } from "@/app/panel/gecis/actions";

const MAX_BYTES = 4 * 1024 * 1024;
/** Bir dosyada yalnız bir sütuna bağlanabilen alanlar; borç kalemleri çoklu. */
const UNIQUE: UnitImportFieldName[] = [
  "block", "unit", "floor", "area", "landShare", "ownerName", "ownerPhone", "tenantName", "tenantPhone", "total",
];
const KINDS = ["dues", "utility", "late_fee", "extra"] as const;

type FileRef = { name: string; base64: string };

/**
 * Veri aktarım sihirbazı: dosya → başlık/sütun eşleştirme → önizleme → aktar.
 *
 * Hiçbir programın dışa aktarım biçimine güvenilmiyor: sütun anlamı başlıktan
 * tahmin ediliyor, yönetici her sütunu kendisi düzeltebiliyor. Eşleştirme her
 * değiştiğinde aynı dosya yeniden önizleniyor (sunucu durumsuz). Okuma ve
 * tahmin sunucuda, tek yerde (`@yonetim/bank` unit-import).
 */
export function MigrationWizard() {
  const t = useTranslations("app.migration");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [file, setFile] = useState<FileRef | null>(null);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, UnitImportFieldName>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [importing, startImport] = useTransition();
  const [showRows, setShowRows] = useState(false);
  // Aktarımdan sonra dosya alanını sıfırlamak için (aynı dosya yeniden seçilebilsin).
  const [inputKey, setInputKey] = useState(0);

  const money = (minor: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "TRY" }).format(minor / 100);

  const run = (next: { file?: FileRef; headerRow?: number; mapping?: Record<string, UnitImportFieldName> } = {}) => {
    const f = next.file ?? file;
    if (!f) return;
    start(async () => {
      const result = await previewMigration({
        fileName: f.name,
        fileBase64: f.base64,
        ...(next.headerRow !== undefined ? { headerRow: next.headerRow } : {}),
        ...(next.mapping ? { mapping: next.mapping } : {}),
      });
      if (!result.ok) {
        setError(result.message);
        setPreview(null);
        return;
      }
      setError(null);
      setPreview(result.data);
      setMapping(Object.fromEntries(result.data.columns.map((c) => [String(c.index), c.field])));
    });
  };

  const onFile = (picked: File | undefined) => {
    setPreview(null);
    setError(null);
    setDone(null);
    if (!picked) return setFile(null);
    if (picked.size > MAX_BYTES) {
      setFile(null);
      setError(t("error.migration_file_too_large"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] ?? "";
      const next = { name: picked.name, base64 };
      setFile(next);
      run({ file: next });
    };
    reader.readAsDataURL(picked);
  };

  const changeField = (index: number, field: UnitImportFieldName) => {
    const next: Record<string, UnitImportFieldName> = { ...mapping, [String(index)]: field };
    // Tekil alan iki sütunda olamaz: eskisini "kullanma"ya çevir.
    if (UNIQUE.includes(field)) {
      for (const [key, value] of Object.entries(next)) if (key !== String(index) && value === field) next[key] = "ignore";
    }
    setMapping(next);
    run({ headerRow: preview?.headerRow, mapping: next });
  };

  const doImport = () => {
    if (!file || !preview) return;
    startImport(async () => {
      const result = await commitMigration({
        fileName: file.name,
        fileBase64: file.base64,
        headerRow: preview.headerRow,
        mapping,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setDone(result.message ?? null);
      setPreview(null);
      setFile(null);
      setInputKey((k) => k + 1);
      router.refresh();
    });
  };

  const issueText = (i: MigrationPreview["issues"][number]) =>
    t(`issue.${i.code}`, {
      unit: i.unit ?? "",
      column: i.column ?? "",
      value: i.value ?? "",
      expected: money(i.expectedMinor ?? 0),
      actual: money(i.actualMinor ?? 0),
    });

  const unusedMoney = preview?.columns.filter((c) => c.unusedMoney && (mapping[String(c.index)] ?? "ignore") === "ignore") ?? [];
  const blocked =
    !preview || preview.problems.length > 0 || preview.totals.errors > 0 || preview.totals.units === 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("stepFile")} description={t("stepFileHint")} />
        <CardBody>
          <label className="block text-sm font-medium text-fg">
            {t("fileLabel")}
            <input
              key={inputKey}
              type="file"
              accept=".xlsx,.xls,.csv,.txt,.htm,.html,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="mt-1 block w-full text-sm text-fg file:mr-3 file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3 file:py-2 file:text-sm file:font-semibold file:text-fg hover:file:bg-hover"
            />
            <span className="mt-1 block text-xs font-normal text-fg-subtle">{t("fileHint")}</span>
          </label>
        </CardBody>
      </Card>

      {pending ? (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner className="h-4 w-4" />
          {t("analyzing")}
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {done ? <Alert tone="success">{done} {t("afterImportHint")}</Alert> : null}

      {preview ? (
        <>
          <Card>
            <CardHeader
              title={t("stepMapping")}
              description={preview.headerFound ? t("mappingGuessed") : t("mappingNoHeader")}
              action={
                <Badge tone="neutral">
                  <FileSpreadsheet aria-hidden className="mr-1 h-3.5 w-3.5" />
                  {preview.format.toUpperCase()}
                </Badge>
              }
            />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm font-medium text-fg">
                  {t("headerRow")}
                  <Select
                    className="mt-1 w-72 max-w-full"
                    value={String(preview.headerRow)}
                    onChange={(e) => run({ headerRow: Number(e.target.value) })}
                  >
                    {preview.topRows.map((row, i) => (
                      <option key={i} value={i}>
                        {t("rowOption", { line: i + 1, text: row.filter(Boolean).slice(0, 4).join(" · ").slice(0, 60) || "—" })}
                      </option>
                    ))}
                  </Select>
                </label>
                <button
                  type="button"
                  onClick={() => setShowRows((v) => !v)}
                  className="h-9 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
                >
                  {showRows ? t("hideTopRows") : t("showTopRows")}
                </button>
              </div>

              {showRows ? (
                <div className={tc.wrapper}>
                  <table className={tc.table}>
                    <tbody>
                      {preview.topRows.map((row, i) => (
                        <tr key={i} className={cn(tc.tr, i === preview.headerRow && "bg-primary-soft font-semibold")}>
                          <td className={`${tc.tdMuted} w-10 tabular-nums`}>{i + 1}</td>
                          {row.map((cell, j) => (
                            <td key={j} className={`${tc.td} whitespace-nowrap text-xs`}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <p className="text-xs text-fg-subtle">{t("debtMappingHint")}</p>

              {preview.problems.length > 0 ? (
                <Alert tone="warning">{preview.problems.map((p) => t(`problem.${p}`)).join(" ")}</Alert>
              ) : null}
              {unusedMoney.length > 0 ? (
                <Alert tone="warning">
                  {t("unusedMoney", { columns: unusedMoney.map((c) => c.header || String(c.index + 1)).join(", ") })}
                </Alert>
              ) : null}

              <div className={tc.wrapper}>
                <table className={tc.table}>
                  <thead className={tc.thead}>
                    <tr>
                      {preview.columns.map((c) => {
                        const field = mapping[String(c.index)] ?? "ignore";
                        return (
                          <th key={c.index} scope="col" className={`${tc.th} min-w-40 align-top`}>
                            <label className="sr-only" htmlFor={`mcol-${c.index}`}>
                              {t("columnMeaning", { column: c.header || String(c.index + 1) })}
                            </label>
                            <Select
                              id={`mcol-${c.index}`}
                              value={field}
                              onChange={(e) => changeField(c.index, e.target.value as UnitImportFieldName)}
                              className={cn(
                                "h-9 text-xs normal-case",
                                field === "ignore" && "text-fg-subtle",
                                field === "ignore" && c.unusedMoney && "border-warning text-warning-fg",
                              )}
                            >
                              {UNIT_IMPORT_FIELDS.map((f) => (
                                <option key={f} value={f}>
                                  {t(`field.${f}`)}
                                </option>
                              ))}
                            </Select>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={tc.tr}>
                      {preview.columns.map((c) => (
                        <td key={c.index} className={`${tc.td} text-xs font-semibold`}>
                          {c.header || <span className="text-fg-subtle">{t("noHeader")}</span>}
                        </td>
                      ))}
                    </tr>
                    {[0, 1, 2].map((r) => (
                      <tr key={r} className={tc.tr}>
                        {preview.columns.map((c) => (
                          <td key={c.index} className={`${tc.tdMuted} max-w-56 truncate text-xs`}>
                            {c.samples[r] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("previewTitle")} />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Summary label={t("sumUnits")} value={t("sumUnitsValue", { total: preview.totals.units, created: preview.totals.newUnits })} />
                <Summary label={t("sumBlocks")} value={t("sumBlocksValue", { total: preview.totals.blocks, created: preview.totals.newBlocks })} />
                <Summary label={t("sumDebt")} value={money(preview.totals.debtMinor)} />
                <Summary
                  label={t("sumErrors")}
                  value={`${preview.totals.errors} · ${preview.totals.warnings}`}
                  tone={preview.totals.errors ? "danger" : undefined}
                />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {KINDS.filter((k) => preview.totals.byKind[k] > 0).map((k) => (
                  <Badge key={k} tone="neutral">
                    {t(`kind.${k}`)}: {money(preview.totals.byKind[k])}
                  </Badge>
                ))}
              </div>
              {preview.totals.withBalance > 0 ? (
                <Alert tone="warning">{t("withBalanceNote", { count: preview.totals.withBalance })}</Alert>
              ) : null}

              {preview.issues.length > 0 ? (
                <div>
                  <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-fg">
                    <AlertTriangle aria-hidden className="h-4 w-4" />
                    {t("issuesTitle")}
                  </h3>
                  <ul className="space-y-1 text-xs">
                    {preview.issues.map((i, idx) => (
                      <li
                        key={`${i.line}-${idx}`}
                        className={cn(
                          "rounded px-2 py-1",
                          i.severity === "error" ? "bg-danger-soft text-danger-fg" : "bg-warning-soft text-warning-fg",
                        )}
                      >
                        {t("rowIssue", { row: i.line, message: issueText(i) })}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.rows.length > 0 ? (
                <div className={tc.wrapper}>
                  <table className={tc.table} style={{ minWidth: 640 }}>
                    <thead className={tc.thead}>
                      <tr>
                        <th scope="col" className={tc.th}>{t("sampleBlock")}</th>
                        <th scope="col" className={tc.th}>{t("sampleUnit")}</th>
                        <th scope="col" className={tc.th}>{t("sampleOwner")}</th>
                        <th scope="col" className={tc.th}>{t("sampleDebts")}</th>
                        <th scope="col" className={tc.th}>{t("sampleStatus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r) => (
                        <tr key={r.line} className={tc.tr}>
                          <td className={`${tc.tdMuted} whitespace-nowrap text-xs`}>{r.blockName ?? "—"}</td>
                          <td className={`${tc.td} whitespace-nowrap text-xs font-semibold`}>{r.number}</td>
                          <td className={`${tc.td} text-xs`}>
                            {r.ownerName ?? "—"}
                            {r.tenantName ? <div className="text-[11px] text-fg-subtle">{t("tenantShort", { name: r.tenantName })}</div> : null}
                          </td>
                          <td className={`${tc.td} text-xs`}>
                            {r.debts.length === 0 ? (
                              <span className="text-fg-subtle">—</span>
                            ) : (
                              r.debts.map((d) => (
                                <div key={d.kind} className="whitespace-nowrap">
                                  <span className="tabular-nums font-medium">{money(d.amountMinor)}</span>{" "}
                                  <span className="text-fg-subtle">
                                    {t(`kind.${d.kind}`)} ({d.columns.join(" + ")})
                                  </span>
                                </div>
                              ))
                            )}
                          </td>
                          <td className={`${tc.td} whitespace-nowrap text-xs`}>
                            <Badge tone={r.status === "new" ? "success" : r.status === "existing" ? "neutral" : "warning"}>
                              {t(`status.${r.status}`)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.totals.units > preview.rows.length ? (
                    <p className="px-3 py-2 text-xs text-fg-subtle">
                      {t("previewMore", { count: preview.totals.units - preview.rows.length })}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={blocked || importing || pending}
                  onClick={doImport}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
                >
                  {importing ? <Spinner className="h-4 w-4" /> : <CheckCircle2 aria-hidden className="h-4 w-4" />}
                  {t("commit", { count: preview.totals.units })}
                </button>
                <span className="text-xs text-fg-subtle">
                  {preview.totals.errors > 0 ? t("fixErrorsFirst") : t("commitHint")}
                </span>
              </div>
            </CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-fg-subtle">{label}</div>
      <div className={cn("mt-0.5 font-semibold tabular-nums text-fg", tone === "danger" && "text-danger-fg")}>{value}</div>
    </div>
  );
}
