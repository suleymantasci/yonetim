"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { MIGRATION_SOURCES, type MigrationSource } from "@yonetim/core";
import { Alert, Card, CardBody, CardFooter, CardHeader, Field, Select } from "@yonetim/ui";

import { commitMigration, previewMigration, type MigrationState } from "@/app/panel/gecis/actions";
import { useFormat } from "@/lib/use-format";

const INITIAL: MigrationState = { ok: false };

/** Veri aktarım sihirbazı — SPEC Bölüm 3.11 (önce önizleme, sonra onay). */
export function MigrationWizard() {
  const t = useTranslations("app.migration");
  const tEnum = useTranslations("enum");
  const f = useFormat();

  const [previewState, previewAction, previewing] = useActionState(previewMigration, INITIAL);
  const [commitState, commitAction, committing] = useActionState(commitMigration, INITIAL);
  const [source, setSource] = useState<MigrationSource>("excel");

  const preview = previewState.preview;
  const committed = commitState.imported;

  return (
    <Card>
      <CardHeader title={t("uploadTitle")} description={t("uploadDescription")} />
      <form action={previewAction}>
        <CardBody className="space-y-4">
          <Field label={t("sourceLabel")} required>
            <Select
              name="source"
              value={source}
              onChange={(e) => setSource(e.target.value as MigrationSource)}
            >
              {MIGRATION_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {tEnum(`migrationSource.${s}`)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t("fileLabel")} required hint={t("fileHint")}>
            <input
              type="file"
              name="file"
              accept=".csv,text/csv,text/plain"
              required
              className="w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </Field>

          {previewState.message ? (
            <Alert tone={previewState.ok ? "success" : "danger"}>{previewState.message}</Alert>
          ) : null}

          {preview ? (
            <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
              <div className="font-semibold text-fg">{t("previewTitle")}</div>
              <dl className="grid grid-cols-2 gap-1">
                <Row label={t("totalRows")} value={String(preview.summary.totalRows)} />
                <Row label={t("importable")} value={String(preview.summary.importable)} />
                <Row label={t("skippable")} value={String(preview.summary.skipped)} />
                <Row label={t("blockCount")} value={String(preview.summary.blocks.length)} />
                <Row
                  label={t("openingBalance")}
                  value={f.money(preview.summary.totalOpeningBalanceKurus)}
                />
              </dl>

              {Object.keys(preview.detectedColumns).length > 0 ? (
                <div>
                  <div className="text-xs font-semibold uppercase text-fg-subtle">
                    {t("detectedColumns")}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-fg-muted">
                    {Object.entries(preview.detectedColumns).map(([field, header]) => (
                      <li key={field}>
                        {field} ← “{header}”
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.sample.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-fg-subtle">
                      <tr>
                        <th scope="col" className="py-1">{t("sampleUnit")}</th>
                        <th scope="col" className="py-1">{t("sampleBlock")}</th>
                        <th scope="col" className="py-1">{t("sampleArea")}</th>
                        <th scope="col" className="py-1">{t("sampleLandShare")}</th>
                        <th scope="col" className="py-1 text-right">{t("sampleBalance")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((u) => (
                        <tr key={u.rowIndex} className="border-t border-border">
                          <td className="py-1">{u.number}</td>
                          <td className="py-1">{u.blockName ?? "—"}</td>
                          <td className="py-1">{u.areaM2 ?? "—"}</td>
                          <td className="py-1">{u.landShare ?? "—"}</td>
                          <td className="py-1 text-right tabular-nums">
                            {u.openingBalanceKurus ? f.money(u.openingBalanceKurus) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {preview.issues.length > 0 ? (
                <ul className="space-y-1 text-xs text-warning-fg">
                  {preview.issues.map((issue, idx) => (
                    <li key={`${issue.rowIndex}-${idx}`}>
                      {t("rowIssue", {
                        row: issue.rowIndex,
                        message: t(`issue.${issue.code}`, issue.params ?? {}),
                      })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardBody>

        <CardFooter className="flex flex-wrap gap-2">
          <button
            disabled={previewing}
            className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-fg hover:bg-hover disabled:opacity-50"
          >
            {previewing ? t("analyzing") : t("analyze")}
          </button>
        </CardFooter>
      </form>

      {previewState.ok && preview ? (
        <form action={commitAction} className="border-t border-border p-4">
          <input type="hidden" name="source" value={source} />
          <Field label={t("confirmFileLabel")} required>
            <input
              type="file"
              name="file"
              accept=".csv,text/csv,text/plain"
              required
              className="w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </Field>
          {commitState.message ? (
            <div className="mt-3">
              <Alert tone={commitState.ok ? "success" : "danger"}>{commitState.message}</Alert>
            </div>
          ) : null}
          {committed ? (
            <p className="mt-2 text-xs text-fg-subtle">{t("afterImportHint")}</p>
          ) : null}
          <button
            disabled={committing}
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
          >
            {committing ? t("committing") : t("commit")}
          </button>
        </form>
      ) : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-fg">{value}</dd>
    </>
  );
}
