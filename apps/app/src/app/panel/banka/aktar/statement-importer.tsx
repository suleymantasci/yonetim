"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useState, useTransition } from "react";

import { STATEMENT_FIELDS, type BankStatementPreview, type StatementFieldName } from "@yonetim/contracts";
import { Alert, Badge, Card, CardBody, CardHeader, Select, Spinner, cn, tableClasses as tc, useToast } from "@yonetim/ui";

import { importStatementFile, previewStatement } from "../actions";

const MAX_BYTES = 4 * 1024 * 1024;
/** Bir dökümde yalnız bir kez olabilecek alanlar (ek açıklama birden çok sütun alabilir). */
const UNIQUE: StatementFieldName[] = [
  "date", "time", "description", "amount", "debit", "credit", "direction", "balance", "reference", "counterparty", "iban",
];

/**
 * Döküm aktarma sihirbazı: dosya → önizleme/eşleştirme → içe aktar.
 *
 * Dosya tarayıcıda base64'e çevrilip server action ile API'ye gidiyor;
 * eşleştirme her değiştiğinde aynı dosya yeniden önizleniyor (sunucu
 * durumsuz — yarım kalmış yükleme diye bir şey yok). Okuma ve tahmin
 * sunucuda, tek yerde (`@yonetim/bank`).
 */
export function StatementImporter({ accounts }: { accounts: Array<{ id: string; label: string }> }) {
  const t = useTranslations("app.bank");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [preview, setPreview] = useState<BankStatementPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, StatementFieldName>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [importing, startImport] = useTransition();
  const [showRows, setShowRows] = useState(false);

  const money = (minor: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "TRY" }).format(minor / 100);

  const run = (
    next: { accountId?: string; file?: { name: string; base64: string }; headerRow?: number; mapping?: Record<string, StatementFieldName> } = {},
  ) => {
    const f = next.file ?? file;
    if (!f) return;
    start(async () => {
      const result = await previewStatement({
        accountId: next.accountId ?? accountId,
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
    if (!picked) return setFile(null);
    if (picked.size > MAX_BYTES) {
      setFile(null);
      setError(t("fileError.statement_too_large"));
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

  const changeField = (index: number, field: StatementFieldName) => {
    const next: Record<string, StatementFieldName> = { ...mapping, [String(index)]: field };
    // Aynı alan iki sütunda olamaz: eskisini "kullanma"ya çevir.
    if (UNIQUE.includes(field)) {
      for (const [key, value] of Object.entries(next)) if (key !== String(index) && value === field) next[key] = "ignore";
    }
    setMapping(next);
    run({ headerRow: preview?.headerRow, mapping: next });
  };

  const doImport = () => {
    if (!file || !preview) return;
    startImport(async () => {
      const result = await importStatementFile({
        accountId,
        fileName: file.name,
        fileBase64: file.base64,
        headerRow: preview.headerRow,
        mapping,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (result.message) toast.success(result.message);
      router.push("/panel/banka/eslestir");
    });
  };

  const fieldLabel = (f: StatementFieldName) => t(`field.${f}`);
  const blocked = !preview || preview.problems.length > 0 || preview.totals.rows === 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("stepFile")} description={t("stepFileHint")} />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-fg">
            {t("statementAccount")}
            <Select
              className="mt-1"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                run({ accountId: e.target.value });
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium text-fg">
            {t("statementFile")}
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt,.htm,.html,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="mt-1 block w-full text-sm text-fg file:mr-3 file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3 file:py-2 file:text-sm file:font-semibold file:text-fg hover:file:bg-hover"
            />
            <span className="mt-1 block text-xs font-normal text-fg-subtle">{t("statementFormats")}</span>
          </label>
        </CardBody>
      </Card>

      {pending ? (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner className="h-4 w-4" />
          {t("previewing")}
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {preview ? (
        <>
          <Card>
            <CardHeader
              title={t("stepMapping")}
              description={
                preview.mappingSource === "profile"
                  ? t("mappingFromProfile")
                  : preview.headerFound
                    ? t("mappingGuessed")
                    : t("mappingNoHeader")
              }
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
                        <tr
                          key={i}
                          className={cn(tc.tr, i === preview.headerRow && "bg-primary-soft font-semibold")}
                        >
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

              {preview.problems.length > 0 ? (
                <Alert tone="warning">
                  {preview.problems.map((p) => t(`problem.${p}`)).join(" ")}
                </Alert>
              ) : null}

              <div className={tc.wrapper}>
                <table className={tc.table}>
                  <thead className={tc.thead}>
                    <tr>
                      {preview.columns.map((c) => (
                        <th key={c.index} scope="col" className={`${tc.th} min-w-40 align-top`}>
                          <label className="sr-only" htmlFor={`col-${c.index}`}>
                            {t("columnMeaning", { column: c.header || String(c.index + 1) })}
                          </label>
                          <Select
                            id={`col-${c.index}`}
                            value={mapping[String(c.index)] ?? "ignore"}
                            onChange={(e) => changeField(c.index, e.target.value as StatementFieldName)}
                            className={cn(
                              "h-9 text-xs normal-case",
                              (mapping[String(c.index)] ?? "ignore") === "ignore" && "text-fg-subtle",
                            )}
                          >
                            {STATEMENT_FIELDS.map((f) => (
                              <option key={f} value={f}>
                                {fieldLabel(f)}
                              </option>
                            ))}
                          </Select>
                        </th>
                      ))}
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
            <CardHeader title={t("stepPreview")} />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Summary label={t("previewRows")} value={String(preview.totals.rows)} />
                <Summary
                  label={t("previewIncoming")}
                  value={`${preview.totals.incoming} · ${money(preview.totals.incomingMinor)}`}
                  tone="success"
                />
                <Summary
                  label={t("previewOutgoing")}
                  value={`${preview.totals.outgoing} · ${money(preview.totals.outgoingMinor)}`}
                />
                <Summary
                  label={t("previewErrors")}
                  value={String(preview.totals.errors)}
                  tone={preview.totals.errors ? "danger" : undefined}
                />
              </div>

              {preview.errors.length > 0 ? (
                <div>
                  <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-danger-fg">
                    <AlertTriangle aria-hidden className="h-4 w-4" />
                    {t("errorRowsTitle")}
                  </h3>
                  <p className="mb-2 text-xs text-fg-subtle">{t("errorRowsHint")}</p>
                  <div className={tc.wrapper}>
                    <table className={tc.table}>
                      <tbody>
                        {preview.errors.map((e) => (
                          <tr key={e.line} className={cn(tc.tr, "bg-danger-soft")}>
                            <td className={`${tc.td} w-24 whitespace-nowrap text-xs font-semibold`}>
                              {t("lineN", { line: e.line })}
                            </td>
                            <td className={`${tc.td} whitespace-nowrap text-xs`}>{t(`rowReason.${e.reason}`)}</td>
                            <td className={`${tc.tdMuted} text-xs`}>{e.cells.filter(Boolean).join(" · ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {preview.rows.length > 0 ? (
                <div className={tc.wrapper}>
                  <table className={tc.table} style={{ minWidth: 760 }}>
                    <thead className={tc.thead}>
                      <tr>
                        <th scope="col" className={tc.th}>{t("date")}</th>
                        <th scope="col" className={tc.th}>{t("sender")}</th>
                        <th scope="col" className={tc.th}>{t("payerNote")}</th>
                        <th scope="col" className={`${tc.th} text-right`}>{t("amount")}</th>
                        <th scope="col" className={tc.th}>{t("suggestedUnitColumn")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r) => (
                        <tr key={r.line} className={tc.tr}>
                          <td className={`${tc.tdMuted} whitespace-nowrap text-xs`}>
                            {new Date(`${r.date}T12:00:00`).toLocaleDateString(locale)}
                          </td>
                          <td className={`${tc.td} text-xs font-semibold`}>{r.counterparty ?? "—"}</td>
                          <td className={`${tc.td} max-w-sm text-xs`}>
                            <div>{r.note ?? (r.counterparty ? "—" : (r.description ?? "—"))}</div>
                            {r.counterparty && r.description ? (
                              <div className="mt-0.5 text-[11px] text-fg-subtle">{r.description}</div>
                            ) : null}
                          </td>
                          <td className={`${tc.tdNum} whitespace-nowrap ${r.direction === "in" ? "text-success-fg" : ""}`}>
                            {r.direction === "in" ? "+" : "−"}
                            {money(r.amountMinor)}
                          </td>
                          <td className={`${tc.td} whitespace-nowrap text-xs`}>
                            {r.direction === "out" ? (
                              <span className="text-fg-subtle">{t("outgoingShort")}</span>
                            ) : r.suggestedUnitLabel ? (
                              <Badge tone="success">{r.suggestedUnitLabel}</Badge>
                            ) : (
                              <span className="text-fg-subtle">{t("noSuggestion")}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.totals.rows > preview.rows.length ? (
                    <p className="px-3 py-2 text-xs text-fg-subtle">
                      {t("previewMore", { count: preview.totals.rows - preview.rows.length })}
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
                  {t("importButton", { count: preview.totals.rows })}
                </button>
                <span className="text-xs text-fg-subtle">{t("importHint")}</span>
              </div>
            </CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-fg-subtle">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-semibold tabular-nums text-fg",
          tone === "success" && "text-success-fg",
          tone === "danger" && "text-danger-fg",
        )}
      >
        {value}
      </div>
    </div>
  );
}
