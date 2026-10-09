"use client";

import { Plus, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { TEAM_ROLES, type TeamList } from "@yonetim/contracts";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  ConfirmDialog,
  Drawer,
  Input,
  Select,
  tableClasses as tc,
  useToast,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { changeMemberRole, inviteMember, removeMember } from "./actions";

type Row = TeamList["rows"][number] & { lastLogin: string | null };

export function TeamManager({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  const t = useTranslations("app.team");
  const tEnum = useTranslations("enum");
  const tCommon = useTranslations("common");
  const toast = useToast();
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await task();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <>
      {canWrite ? (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            <Plus aria-hidden className="h-4 w-4" />
            {t("invite")}
          </button>
        </div>
      ) : null}

      <Card>
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table}>
              <thead className={tc.thead}>
                <tr>
                  <th className={tc.th}>{t("name")}</th>
                  <th className={tc.th}>{t("contact")}</th>
                  <th className={tc.th}>{t("role")}</th>
                  <th className={tc.th}>{t("lastLogin")}</th>
                  {canWrite ? (
                    <th className={tc.th}>
                      <span className="sr-only">{t("actions")}</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.membershipId} className={tc.tr}>
                    <td className={tc.td}>
                      <span className="font-medium">{r.name}</span>
                      {r.isSelf ? <Badge tone="info" className="ml-2">{t("you")}</Badge> : null}
                    </td>
                    <td className={tc.tdMuted}>
                      {[r.phoneMasked, r.email].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className={tc.td}>
                      {canWrite && r.editable ? (
                        <Select
                          aria-label={t("roleOf", { name: r.name })}
                          value={r.role}
                          disabled={pending}
                          onChange={(e) =>
                            run(() => changeMemberRole(r.membershipId, e.target.value as (typeof TEAM_ROLES)[number]))
                          }
                          className="h-9 w-44"
                        >
                          {TEAM_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {tEnum(`role.${role}`)}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        tEnum(`role.${r.role}` as "role.manager")
                      )}
                    </td>
                    <td className={tc.tdMuted}>{r.lastLogin ?? t("neverLoggedIn")}</td>
                    {canWrite ? (
                      <td className={tc.td}>
                        {r.editable ? (
                          <button
                            type="button"
                            onClick={() => setRemoving(r)}
                            aria-label={t("removeOf", { name: r.name })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-danger-fg"
                          >
                            <UserMinus aria-hidden className="h-4 w-4" />
                          </button>
                        ) : null}
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
        open={inviting}
        onClose={() => setInviting(false)}
        title={t("invite")}
        description={t("inviteHint")}
        closeLabel={tCommon("action.close")}
        padded={false}
      >
        <ActionForm
          action={inviteMember}
          submitLabel={t("inviteSubmit")}
          onSuccess={() => setInviting(false)}
          layout="modal"
          onCancel={() => setInviting(false)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField name="firstName" label={t("firstName")} required>
                <Input name="firstName" required maxLength={80} />
              </FormField>
              <FormField name="lastName" label={t("lastName")} required>
                <Input name="lastName" required maxLength={80} />
              </FormField>
            </div>
            <FormField name="phone" label={t("phone")} hint={t("contactHint")}>
              <Input name="phone" type="tel" inputMode="tel" maxLength={30} placeholder="05xx xxx xx xx" />
            </FormField>
            <FormField name="email" label={t("email")}>
              <Input name="email" type="email" maxLength={200} />
            </FormField>
            <FormField name="role" label={t("role")} required>
              <Select name="role" defaultValue="accountant" required>
                {TEAM_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {tEnum(`role.${role}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <Alert tone="info">{t("roleHelp")}</Alert>
          </div>
        </ActionForm>
      </Drawer>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && run(() => removeMember(removing.membershipId))}
        title={t("removeTitle")}
        description={t("removeDescription", { name: removing?.name ?? "" })}
        confirmLabel={t("remove")}
        cancelLabel={tCommon("action.cancel")}
        tone="danger"
        pending={pending}
      />
    </>
  );
}
