"use client";

import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import type { RecurringExpenseList } from "@yonetim/contracts";
import { Badge, Card, CardBody, Drawer, Input, MoneyInput, Select, Switch, tableClasses as tc, useToast } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { deleteRecurring, runRecurring, saveRecurring } from "./actions";

type Row = RecurringExpenseList["rows"][number] & { amount: string; next: string | null };

export function RecurringManager({
  rows,
  options,
  canWrite,
  thisPeriod,
}: {
  rows: Row[];
  options: RecurringExpenseList["options"];
  canWrite: boolean;
  thisPeriod: string;
}) {
  const t = useTranslations("app.recurring");
  const tCommon = useTranslations("common");
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [pending, start] = useTransition();
  const current = editing && editing !== "new" ? editing : undefined;

  const act = (task: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await task();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      router.refresh();
    });

  return (
    <>
      {canWrite ? (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            <Plus aria-hidden className="h-4 w-4" />
            {t("new")}
          </button>
        </div>
      ) : null}
      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-fg-subtle">{t("empty")}</p>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th className={tc.th}>{t("descriptionCol")}</th>
                    <th className={tc.th}>{t("payee")}</th>
                    <th className={`${tc.th} text-right`}>{t("amount")}</th>
                    <th className={tc.th}>{t("schedule")}</th>
                    <th className={tc.th}>{t("next")}</th>
                    <th className={`${tc.th} text-right`}>{t("generated")}</th>
                    {canWrite ? (
                      <th className={tc.th}>
                        <span className="sr-only">{t("actions")}</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={tc.tr}>
                      <td className={tc.td}>
                        <span className="font-medium">{r.description}</span>
                        {r.isActive ? null : <Badge tone="neutral" className="ml-2">{t("inactive")}</Badge>}
                        {r.categoryName ? <span className="block text-xs text-fg-subtle">{r.categoryName}</span> : null}
                      </td>
                      <td className={tc.tdMuted}>{r.vendorName ?? r.staffName ?? "—"}</td>
                      <td className={tc.tdNum}>{r.amount}</td>
                      <td className={tc.td}>
                        {t("everyMonth", { day: r.dayOfMonth })}
                        <span className="block text-xs text-fg-subtle">
                          {r.startPeriod} → {r.endPeriod ?? t("open")}
                        </span>
                      </td>
                      <td className={tc.td}>{r.next ?? "—"}</td>
                      <td className={tc.tdNum}>{r.generated}</td>
                      {canWrite ? (
                        <td className={tc.td}>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              disabled={pending || !r.isActive}
                              onClick={() => act(() => runRecurring(r.id))}
                              aria-label={t("runNow", { name: r.description })}
                              title={t("runNow", { name: r.description })}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-40"
                            >
                              <Play aria-hidden className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing(r)}
                              aria-label={t("edit", { name: r.description })}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
                            >
                              <Pencil aria-hidden className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => act(() => deleteRecurring(r.id))}
                              aria-label={t("delete", { name: r.description })}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-danger-fg"
                            >
                              <Trash2 aria-hidden className="h-4 w-4" />
                            </button>
                          </div>
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
          action={saveRecurring}
          submitLabel={tCommon("action.save")}
          onSuccess={() => setEditing(null)}
          layout="modal"
          onCancel={() => setEditing(null)}
        >
          {current ? <input type="hidden" name="id" value={current.id} /> : null}
          <div className="space-y-4">
            <FormField name="description" label={t("descriptionCol")} required>
              <Input name="description" defaultValue={current?.description} required minLength={3} maxLength={240} placeholder={t("descriptionPlaceholder")} />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField name="categoryId" label={t("category")}>
                <Select name="categoryId" defaultValue={current?.categoryId ?? ""}>
                  <option value="">{t("noCategory")}</option>
                  {options.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField name="payee" label={t("payee")}>
                <Select
                  name="payee"
                  defaultValue={current?.vendorId ? `v:${current.vendorId}` : current?.staffId ? `s:${current.staffId}` : ""}
                >
                  <option value="">{t("noPayee")}</option>
                  {options.vendors.length > 0 ? (
                    <optgroup label={t("vendors")}>
                      {options.vendors.map((v) => (
                        <option key={v.id} value={`v:${v.id}`}>
                          {v.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {options.staff.length > 0 ? (
                    <optgroup label={t("staff")}>
                      {options.staff.map((s) => (
                        <option key={s.id} value={`s:${s.id}`}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </Select>
              </FormField>
              <FormField name="amountKurus" label={t("amount")} required hint={t("amountHint")}>
                <MoneyInput name="amountKurus" defaultKurus={current?.amountMinor ?? 0} required />
              </FormField>
              <FormField name="vatRate" label={t("vatRate")}>
                <Select name="vatRate" defaultValue={String(current?.vatRate ?? 0.2)}>
                  {[0, 0.01, 0.1, 0.2].map((v) => (
                    <option key={v} value={String(v)}>
                      %{Math.round(v * 100)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField name="dayOfMonth" label={t("dayOfMonth")} required>
                <Input name="dayOfMonth" type="number" min={1} max={28} defaultValue={String(current?.dayOfMonth ?? 1)} />
              </FormField>
              <FormField name="startPeriod" label={t("startPeriod")} required>
                <Input name="startPeriod" type="month" defaultValue={current?.startPeriod ?? thisPeriod} required />
              </FormField>
              <FormField name="endPeriod" label={t("endPeriod")} hint={t("endPeriodHint")}>
                <Input name="endPeriod" type="month" defaultValue={current?.endPeriod ?? ""} />
              </FormField>
            </div>
            <Switch name="isActive" label={t("active")} defaultChecked={current?.isActive ?? true} />
          </div>
        </ActionForm>
      </Drawer>
    </>
  );
}
