"use client";

import { FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import type { ExpenseImportPreview } from "@yonetim/contracts";
import { Alert, Badge, Card, CardBody, CardHeader, Spinner, Switch, kurusToDisplay, tableClasses as tc, useToast } from "@yonetim/ui";

import { runExpenseImport } from "./actions";

const TONE = { ok: "success", bad_date: "danger", bad_amount: "danger", no_description: "danger", duplicate: "info", locked: "warning" } as const;

export function ExpenseImporter() {
  const t = useTranslations("app.expenseImport");
  const toast = useToast();
  const router = useRouter();
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [createCategories, setCreateCategories] = useState(true);
  const [defaultPaid, setDefaultPaid] = useState(false);
  const [preview, setPreview] = useState<ExpenseImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (f: { name: string; base64: string } | null, opts = { createCategories, defaultPaid }, commit = false) => {
    if (!f) return;
    start(async () => {
      const r = await runExpenseImport({ fileBase64: f.base64, ...opts }, commit);
      if (!r.ok) {
        setError(r.message);
        if (commit) toast.error(r.message);
        return;
      }
      setError(null);
      if (commit) {
        toast.success(t("created", { count: r.data.created }));
        router.push("/panel/giderler");
        return;
      }
      setPreview(r.data);
    });
  };
  const okCount = preview?.rows.filter((r) => r.status === "ok").length ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("step1")} description={t("step1Hint")} />
        <CardBody className="space-y-3">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border-strong p-4 text-sm hover:bg-hover">
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
                  run(next);
                };
                reader.readAsDataURL(picked);
              }}
            />
          </label>
          <Switch
            label={t("createCategories")}
            description={t("createCategoriesHint")}
            checked={createCategories}
            onCheckedChange={(v) => {
              setCreateCategories(v);
              run(file, { createCategories: v, defaultPaid });
            }}
          />
          <Switch
            label={t("defaultPaid")}
            description={t("defaultPaidHint")}
            checked={defaultPaid}
            onCheckedChange={(v) => {
              setDefaultPaid(v);
              run(file, { createCategories, defaultPaid: v });
            }}
          />
          {pending ? <Spinner label={t("checking")} /> : null}
        </CardBody>
      </Card>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {preview && preview.missing.length > 0 ? (
        <Alert tone="warning" title={t("missingTitle")}>
          {preview.missing.map((m) => t(`missing.${m}`)).join(" · ")}
        </Alert>
      ) : null}
      {preview && preview.newCategories.length > 0 ? (
        <Alert tone={createCategories ? "info" : "warning"}>
          {t(createCategories ? "newCategories" : "unknownCategories", { names: preview.newCategories.join(", ") })}
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
                disabled={pending || okCount === 0}
                onClick={() => run(file, { createCategories, defaultPaid }, true)}
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
                    <th scope="col" className={tc.th}>{t("date")}</th>
                    <th scope="col" className={tc.th}>{t("descriptionCol")}</th>
                    <th scope="col" className={tc.th}>{t("category")}</th>
                    <th scope="col" className={tc.th}>{t("vendor")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("amount")}</th>
                    <th scope="col" className={tc.th}>{t("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line} className={tc.tr}>
                      <td className={tc.tdMuted}>{r.line}</td>
                      <td className={`${tc.td} whitespace-nowrap`}>{r.date ? r.date.split("-").reverse().join(".") : "—"}</td>
                      <td className={tc.td}>
                        {r.description || "—"}
                        {r.invoiceNo ? <span className="block text-xs text-fg-subtle">{r.invoiceNo}</span> : null}
                      </td>
                      <td className={tc.td}>
                        {r.category ?? "—"}
                        {r.category && !r.categoryMatched ? <span className="block text-xs text-warning-fg">{t("newBadge")}</span> : null}
                      </td>
                      <td className={tc.td}>
                        {r.vendor ?? "—"}
                        {r.vendor && !r.vendorMatched ? <span className="block text-xs text-fg-subtle">{t("freeText")}</span> : null}
                      </td>
                      <td className={tc.tdNum}>{kurusToDisplay(r.amountMinor)} ₺</td>
                      <td className={tc.td}>
                        <Badge tone={TONE[r.status]}>{t(`state.${r.status}`)}</Badge>
                        <span className="block text-xs text-fg-subtle">{r.paid ? t("paid") : t("unpaid")}</span>
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
