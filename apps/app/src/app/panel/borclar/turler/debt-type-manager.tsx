"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import type { DebtTypeRow } from "@yonetim/contracts";
import {
  Badge,
  Card,
  CardBody,
  ConfirmDialog,
  Drawer,
  Input,
  Select,
  Switch,
  tableClasses as tc,
  useToast,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { deleteDebtType, saveDebtType } from "./actions";

const BASE_KINDS = [
  "dues",
  "utility",
  "extra",
  "rent",
  "deposit",
  "penalty",
  "admin_fine",
  "reservation",
  "legal_cost",
] as const;

/**
 * Borç türleri tablosu + düzenleme çekmecesi.
 *
 * Borçlu ve gecikme sütunları tablonun kendisinde: yöneticinin bu ekrana
 * gelme sebebi çoğunlukla "demirbaş kime yazılıyordu?" sorusu.
 */
export function DebtTypeManager({
  rows,
  siteLateFeeMonthlyPct,
  canWrite,
}: {
  rows: DebtTypeRow[];
  siteLateFeeMonthlyPct: number;
  canWrite: boolean;
}) {
  const t = useTranslations("app.debtTypes");
  const tEnum = useTranslations("enum");
  const tCommon = useTranslations("common");
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<DebtTypeRow | "new" | null>(null);
  const [removing, setRemoving] = useState<DebtTypeRow | null>(null);
  const [pending, startTransition] = useTransition();
  const current = editing && editing !== "new" ? editing : undefined;
  const [mode, setMode] = useState<string>("monthly");

  function open(row: DebtTypeRow | "new") {
    setMode(row === "new" ? "monthly" : row.lateFeeMode);
    setEditing(row);
  }

  function confirmRemove() {
    if (!removing) return;
    const target = removing;
    startTransition(async () => {
      const result = await deleteDebtType(target.id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setRemoving(null);
      // Sunucu eylemi `ActionForm` dışında: listeyi kendimiz tazeliyoruz.
      if (result.ok) router.refresh();
    });
  }

  const lateFeeText = (row: DebtTypeRow) =>
    row.lateFeeMode === "none"
      ? t("lateFee.none")
      : t(`lateFee.${row.lateFeeMode}`, {
          pct: (row.lateFeeMonthlyPct ?? siteLateFeeMonthlyPct).toLocaleString("tr-TR"),
        }) + (row.lateFeeMonthlyPct === null ? ` ${t("siteDefault")}` : "");

  return (
    <>
      {canWrite ? (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => open("new")}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            <Plus aria-hidden className="h-4 w-4" />
            {t("new")}
          </button>
        </div>
      ) : null}

      <Card>
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table}>
              <thead className={tc.thead}>
                <tr>
                  <th className={tc.th}>{t("col.name")}</th>
                  <th className={tc.th}>{t("col.debtor")}</th>
                  <th className={tc.th}>{t("col.lateFee")}</th>
                  <th className={tc.th}>{t("col.account")}</th>
                  <th className={`${tc.th} text-right`}>{t("col.debts")}</th>
                  {canWrite ? (
                    <th className={tc.th}>
                      <span className="sr-only">{t("col.actions")}</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={tc.tr}>
                    <td className={tc.td}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-fg">{row.name}</span>
                        {row.isActive ? null : <Badge tone="neutral">{t("inactive")}</Badge>}
                      </div>
                      <span className="text-xs text-fg-subtle">
                        {tEnum(`debtKind.${row.baseKind}`)}
                      </span>
                    </td>
                    <td className={tc.td}>
                      <Badge tone={row.debtor === "owner" ? "info" : "neutral"}>
                        {t(`debtor.${row.debtor}`)}
                      </Badge>
                    </td>
                    <td className={tc.td}>{lateFeeText(row)}</td>
                    <td className={tc.td}>
                      <span className="font-mono text-xs">
                        {row.accountCode ?? (row.baseKind === "dues" ? "600" : "602")}
                      </span>
                      {row.accountCode ? null : (
                        <span className="ml-1 text-xs text-fg-subtle">
                          ({t("accountDefault")})
                        </span>
                      )}
                    </td>
                    <td className={tc.tdNum}>{row.debtCount}</td>
                    {canWrite ? (
                      <td className={tc.td}>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => open(row)}
                            aria-label={t("edit", { name: row.name })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
                          >
                            <Pencil aria-hidden className="h-4 w-4" />
                          </button>
                          {row.debtCount === 0 ? (
                            <button
                              type="button"
                              onClick={() => setRemoving(row)}
                              aria-label={t("delete", { name: row.name })}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-danger-fg"
                            >
                              <Trash2 aria-hidden className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
      <p className="mt-3 text-xs text-fg-subtle">{t("footnote")}</p>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? t("editTitle") : t("new")}
        description={t("formHint")}
        closeLabel={tCommon("action.close")}
        padded={false}
      >
        <ActionForm
          key={current?.id ?? "new"}
          action={saveDebtType}
          submitLabel={tCommon("action.save")}
          onSuccess={() => setEditing(null)}
          layout="modal"
          onCancel={() => setEditing(null)}
        >
          {current ? <input type="hidden" name="id" value={current.id} /> : null}
          <div className="space-y-4">
            <FormField name="name" label={t("col.name")} required>
              <Input name="name" defaultValue={current?.name} required minLength={2} maxLength={60} />
            </FormField>
            <FormField name="baseKind" label={t("baseKind")} hint={t("baseKindHint")} required>
              <Select name="baseKind" defaultValue={current?.baseKind ?? "extra"} required>
                {BASE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {tEnum(`debtKind.${kind}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField name="debtor" label={t("col.debtor")} hint={t("debtorHint")} required>
              <Select name="debtor" defaultValue={current?.debtor ?? "occupant"} required>
                <option value="occupant">{t("debtor.occupant")}</option>
                <option value="owner">{t("debtor.owner")}</option>
              </Select>
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField name="lateFeeMode" label={t("col.lateFee")} required>
                <Select
                  name="lateFeeMode"
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  required
                >
                  <option value="monthly">{t("mode.monthly")}</option>
                  <option value="daily">{t("mode.daily")}</option>
                  <option value="none">{t("mode.none")}</option>
                </Select>
              </FormField>
              {mode === "none" ? null : (
                <FormField
                  name="lateFeeMonthlyPct"
                  label={t("pct")}
                  hint={t("pctHint", { pct: siteLateFeeMonthlyPct.toLocaleString("tr-TR") })}
                >
                  <Input
                    name="lateFeeMonthlyPct"
                    inputMode="decimal"
                    defaultValue={current?.lateFeeMonthlyPct ?? ""}
                    placeholder={String(siteLateFeeMonthlyPct)}
                  />
                </FormField>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField name="accountCode" label={t("col.account")} hint={t("accountHint")}>
                <Input
                  name="accountCode"
                  defaultValue={current?.accountCode ?? ""}
                  placeholder="602.10"
                  maxLength={20}
                />
              </FormField>
              <FormField name="sortOrder" label={t("sortOrder")}>
                <Input
                  name="sortOrder"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  defaultValue={current?.sortOrder ?? rows.length + 1}
                />
              </FormField>
            </div>
            <Switch
              name="isActive"
              label={t("active")}
              description={t("activeHint")}
              defaultChecked={current?.isActive ?? true}
            />
          </div>
        </ActionForm>
      </Drawer>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: removing?.name ?? "" })}
        confirmLabel={tCommon("action.delete")}
        cancelLabel={tCommon("action.cancel")}
        tone="danger"
        pending={pending}
      />
    </>
  );
}
