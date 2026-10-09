import { ArrowLeftRight, FileSignature, HandCoins, Pencil, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { z } from "zod";

import { hasPermission } from "@yonetim/auth/guard";
import { cashHandoverList, cashOverview } from "@yonetim/contracts";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Stat,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ActionDrawerButton } from "@/components/form/action-drawer-button";
import Link from "@/components/link";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import {
  createHandover,
  saveIncome,
  saveIncomeGroup,
  saveTransfer,
  voidMovement,
} from "./actions";
import {
  HandoverFields,
  IncomeFields,
  IncomeGroupFields,
  TransferFields,
  VoidFields,
} from "./fields";
import { LockCard } from "./lock-card";

export const dynamic = "force-dynamic";

/**
 * Kasa işlemleri — kasa ve banka bakiyeleri, virman, harici tahsilat, kasa
 * devir tutanağı. Bakiyeler fiş listesinden: mizandaki 100 / 102.xx ile aynı.
 */
export default async function CashPage() {
  const ctx = await requirePermission("bank:read");
  const t = await getTranslations("app.cash");
  const tCommon = await getTranslations("common");
  const f = await formatters();
  const [data, handovers, lock] = await Promise.all([
    apiGet("/v1/panel/cash", cashOverview),
    apiGet("/v1/panel/cash/handovers", cashHandoverList),
    apiGet("/v1/panel/cash/lock", z.object({ until: z.string().nullable() })).catch(() => ({ until: null })),
  ]);
  const canWrite = hasPermission(ctx.roles, "bank:write");
  const tIns = await getTranslations("app.instruction");

  const actions = canWrite ? (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/panel/kasa/talimat"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
      >
        <FileSignature aria-hidden className="h-4 w-4" />
        {tIns("title")}
      </Link>
      <ActionDrawerButton
        action={saveIncome}
        hidden={{}}
        icon={<HandCoins />}
        tone="primary"
        label={t("newIncome")}
        title={t("newIncome")}
        description={t("newIncomeHint")}
        submitLabel={tCommon("action.save")}
      >
        <IncomeFields
          banks={data.bankOptions}
          groups={data.incomeGroups.filter((g) => g.isActive)}
        />
      </ActionDrawerButton>
      {data.bankOptions.length > 0 ? (
        <ActionDrawerButton
          action={saveTransfer}
          hidden={{}}
          icon={<ArrowLeftRight />}
          label={t("newTransfer")}
          title={t("newTransfer")}
          description={t("newTransferHint")}
          submitLabel={tCommon("action.save")}
        >
          <TransferFields banks={data.bankOptions} />
        </ActionDrawerButton>
      ) : null}
      <ActionDrawerButton
        action={createHandover}
        hidden={{}}
        icon={<FileSignature />}
        label={t("newHandover")}
        title={t("newHandover")}
        description={t("newHandoverHint")}
        submitLabel={t("handoverSubmit")}
      >
        <HandoverFields />
      </ActionDrawerButton>
    </div>
  ) : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={actions}
      />

      <LockCard
        until={lock.until}
        untilLabel={lock.until ? f.date(new Date(`${lock.until}T12:00:00`)) : null}
        canWrite={hasPermission(ctx.roles, "settings:write")}
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("total")}
          value={f.money(data.totalMinor)}
          tone={data.totalMinor < 0 ? "danger" : "neutral"}
        />
        {data.accounts.map((a) => (
          <Stat
            key={a.code}
            label={`${a.code} · ${a.label}`}
            value={f.money(a.balanceMinor)}
            tone={a.balanceMinor < 0 ? "danger" : "neutral"}
            hint={t("flow30", {
              in: f.money(a.inMinor),
              out: f.money(a.outMinor),
            })}
          />
        ))}
      </div>

      <Card className="mb-4">
        <CardHeader
          title={t("movementsTitle")}
          description={t("movementsHint")}
        />
        <CardBody className="p-0">
          {data.movements.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>
                      {t("date")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("kind")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("detail")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("amount")}
                    </th>
                    {canWrite ? (
                      <th scope="col" className={tc.th}>
                        <span className="sr-only">{t("actions")}</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {data.movements.map((m) => (
                    <tr
                      key={m.id}
                      className={`${tc.tr} ${m.voidedAt ? "opacity-60" : ""}`}
                    >
                      <td className={tc.td}>{f.date(m.date)}</td>
                      <td className={tc.td}>
                        <Badge tone={m.kind === "income" ? "success" : "info"}>
                          {m.kind === "income"
                            ? (m.incomeGroupName ??
                              t(
                                `incomeCategory.${m.category ?? "other"}` as "incomeCategory.other",
                              ))
                            : t("transfer")}
                        </Badge>
                        {m.voidedAt ? (
                          <Badge tone="danger" className="ml-1">
                            {t("voidedBadge")}
                          </Badge>
                        ) : null}
                      </td>
                      <td className={tc.td}>
                        <div className="text-fg">
                          {m.kind === "income"
                            ? `${m.payerName ?? ""} → ${m.toLabel}`
                            : `${m.fromLabel ?? ""} → ${m.toLabel}`}
                        </div>
                        {m.description || m.documentNo ? (
                          <div className="text-xs text-fg-subtle">
                            {[
                              m.documentNo
                                ? `${t("documentNo")}: ${m.documentNo}`
                                : null,
                              m.description,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        ) : null}
                        {m.voidReason ? (
                          <div className="text-xs text-danger-fg">
                            {m.voidReason}
                          </div>
                        ) : null}
                      </td>
                      <td className={tc.tdNum}>{f.money(m.amountMinor)}</td>
                      {canWrite ? (
                        <td className={tc.td}>
                          {m.voidedAt ? null : (
                            <ActionDrawerButton
                              action={voidMovement}
                              hidden={{ id: m.id }}
                              tone="danger"
                              label={t("void")}
                              title={t("voidTitle")}
                              warning={t("voidWarning")}
                              submitLabel={t("void")}
                            >
                              <VoidFields />
                            </ActionDrawerButton>
                          )}
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

      <Card className="mb-4">
        <CardHeader
          title={t("groupsTitle")}
          description={t("groupsHint")}
          action={
            canWrite ? (
              <ActionDrawerButton
                action={saveIncomeGroup}
                hidden={{}}
                icon={<Plus />}
                label={t("newGroup")}
                title={t("newGroup")}
                description={t("groupsHint")}
                submitLabel={tCommon("action.save")}
              >
                <IncomeGroupFields />
              </ActionDrawerButton>
            ) : null
          }
        />
        <CardBody className="p-0">
          {data.incomeGroups.length === 0 ? (
            <p className="p-4 text-sm text-fg-subtle">{t("groupsEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.incomeGroups.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 font-medium">{g.name}</span>
                  <span className="font-mono text-xs text-fg-subtle">{g.accountCode}</span>
                  <span className="text-xs text-fg-subtle">{t("groupUsage", { count: g.usage })}</span>
                  {g.isActive ? null : <Badge tone="neutral">{t("groupInactive")}</Badge>}
                  {canWrite ? (
                    <ActionDrawerButton
                      action={saveIncomeGroup}
                      hidden={{}}
                      icon={<Pencil />}
                      label={t("editGroup", { name: g.name })}
                      title={t("editGroup", { name: g.name })}
                      submitLabel={tCommon("action.save")}
                    >
                      <IncomeGroupFields group={g} />
                    </ActionDrawerButton>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("handoversTitle")}
          description={t("handoversHint")}
        />
        <CardBody className="p-0">
          {handovers.rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-fg-subtle">
              {t("handoversEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {handovers.rows.map((h) => (
                <li key={h.id}>
                  <Link
                    href={`/panel/kasa/devir/${h.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-hover"
                  >
                    <span className="font-medium text-fg">
                      {f.date(h.date)} · {h.fromName} → {h.toName}
                    </span>
                    <span className="tabular-nums text-fg-muted">
                      {f.money(h.snapshot.cashTotalMinor)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
