"use client";

import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { LawyerList } from "@yonetim/contracts";
import { Badge, Card, CardBody, Drawer, Input, Switch, tableClasses as tc } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import Link from "@/components/link";
import { saveLawyer } from "../actions";

type Row = LawyerList["rows"][number] & { collected: string };

export function LawyerManager({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  const t = useTranslations("app.legal");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const current = editing && editing !== "new" ? editing : undefined;

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
            {t("newLawyer")}
          </button>
        </div>
      ) : null}
      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-fg-subtle">{t("lawyersEmpty")}</p>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th className={tc.th}>{t("lawyerName")}</th>
                    <th className={tc.th}>{t("bar")}</th>
                    <th className={tc.th}>{t("contact")}</th>
                    <th className={`${tc.th} text-right`}>{t("commission")}</th>
                    <th className={`${tc.th} text-right`}>{t("openCasesCol")}</th>
                    <th className={`${tc.th} text-right`}>{t("collected")}</th>
                    {canWrite ? (
                      <th className={tc.th}>
                        <span className="sr-only">{t("edit")}</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={tc.tr}>
                      <td className={tc.td}>
                        <Link href={`/panel/hukuk?avukat=${r.id}`} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                        {r.isActive ? null : <Badge tone="neutral" className="ml-2">{t("inactive")}</Badge>}
                      </td>
                      <td className={tc.tdMuted}>{[r.barCity, r.barNo].filter(Boolean).join(" · ") || "—"}</td>
                      <td className={tc.tdMuted}>{[r.phone, r.email].filter(Boolean).join(" · ") || "—"}</td>
                      <td className={tc.tdNum}>%{r.commissionPct.toLocaleString("tr-TR")}</td>
                      <td className={tc.tdNum}>{r.openCases}</td>
                      <td className={tc.tdNum}>{r.collected}</td>
                      {canWrite ? (
                        <td className={tc.td}>
                          <button
                            type="button"
                            onClick={() => setEditing(r)}
                            aria-label={t("editLawyer", { name: r.name })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
                          >
                            <Pencil aria-hidden className="h-4 w-4" />
                          </button>
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

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? t("editLawyer", { name: current.name }) : t("newLawyer")}
        closeLabel={tCommon("action.close")}
        padded={false}
      >
        <ActionForm
          key={current?.id ?? "new"}
          action={saveLawyer}
          submitLabel={tCommon("action.save")}
          onSuccess={() => setEditing(null)}
          layout="modal"
          onCancel={() => setEditing(null)}
        >
          {current ? <input type="hidden" name="id" value={current.id} /> : null}
          <div className="space-y-4">
            <FormField name="name" label={t("lawyerName")} required>
              <Input name="name" defaultValue={current?.name} required minLength={3} maxLength={160} />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField name="barCity" label={t("barCity")}>
                <Input name="barCity" defaultValue={current?.barCity ?? ""} maxLength={60} />
              </FormField>
              <FormField name="barNo" label={t("barNo")}>
                <Input name="barNo" defaultValue={current?.barNo ?? ""} maxLength={40} />
              </FormField>
              <FormField name="phone" label={t("phone")}>
                <Input name="phone" type="tel" defaultValue={current?.phone ?? ""} maxLength={20} />
              </FormField>
              <FormField name="email" label={t("email")}>
                <Input name="email" type="email" defaultValue={current?.email ?? ""} maxLength={200} />
              </FormField>
              <FormField name="commissionPct" label={t("commission")} hint={t("commissionHint")}>
                <Input name="commissionPct" inputMode="decimal" defaultValue={String(current?.commissionPct ?? 10)} />
              </FormField>
            </div>
            <Switch name="isActive" label={t("lawyerActive")} defaultChecked={current?.isActive ?? true} />
          </div>
        </ActionForm>
      </Drawer>
    </>
  );
}
