"use client";

import { CheckCheck, Receipt } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import type { BankQueueRow } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader, EmptyState, Select, Spinner, cn, tableClasses as tc, useToast } from "@yonetim/ui";

import { confirmBankTransactions, recordBankExpense } from "../actions";
import { TransactionActions } from "../transaction-actions";

type Row = Omit<BankQueueRow, "transactionAt"> & { transactionAt: string };

/**
 * Eşleştirme kuyruğu (istemci). Daire seçimi satırda tutuluyor; öneri varsa
 * hazır gelir. Toplu tahsilat seçili ve dairesi belli satırları gönderir;
 * sonuç satır satır döner, başarısız olan kuyrukta kalır.
 */
export function MatchQueue({
  incoming,
  outgoing,
  units,
  categories,
  vendors,
  canCollect,
  canExpense,
}: {
  incoming: Row[];
  outgoing: Row[];
  units: Array<{ id: string; label: string }>;
  categories: Array<{ id: string; name: string; depth: number }>;
  vendors: Array<{ id: string; name: string }>;
  canCollect: boolean;
  canExpense: boolean;
}) {
  const t = useTranslations("app.bank");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [unitOf, setUnitOf] = useState<Record<string, string>>(() =>
    Object.fromEntries(incoming.map((r) => [r.id, r.suggestedUnitId ?? ""])),
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(incoming.filter((r) => r.suggestedUnitId && (r.confidence ?? 0) >= 0.8).map((r) => r.id)),
  );
  const [categoryOf, setCategoryOf] = useState<Record<string, string>>({});
  const [vendorOf, setVendorOf] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});

  const money = (minor: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "TRY" }).format(minor / 100);
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale);

  const collect = (ids: string[]) => {
    const items = ids.filter((id) => unitOf[id]).map((id) => ({ id, unitId: unitOf[id]! }));
    if (items.length === 0) return toast.error(t("unitRequired"));
    start(async () => {
      const result = await confirmBankTransactions(items);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setFailed(Object.fromEntries(result.data.failed.map((f) => [f.id, f.message])));
      setSelected(new Set());
      if (result.data.failed.length) toast.error(result.message ?? "");
      else toast.success(result.message ?? "");
      router.refresh();
    });
  };

  const expense = (id: string) =>
    start(async () => {
      const result = await recordBankExpense(id, { categoryId: categoryOf[id] ?? "", vendorId: vendorOf[id] || null });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message ?? "");
      router.refresh();
    });

  const selectable = incoming.filter((r) => unitOf[r.id]);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t("queueIncoming", { count: incoming.length })}
          description={t("queueIncomingHint")}
          action={
            canCollect && incoming.length > 0 ? (
              <button
                type="button"
                disabled={pending || selected.size === 0}
                onClick={() => collect([...selected])}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
              >
                {pending ? <Spinner className="h-4 w-4" /> : <CheckCheck aria-hidden className="h-4 w-4" />}
                {t("collectSelected", { count: selected.size })}
              </button>
            ) : null
          }
        />
        <CardBody className="p-0">
          {incoming.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t("queueIncomingEmpty")} description={t("queueEmptyHint")} />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 820 }}>
                <thead className={tc.thead}>
                  <tr>
                    {canCollect ? (
                      <th scope="col" className={`${tc.th} w-10`}>
                        <input
                          type="checkbox"
                          aria-label={t("selectAll")}
                          checked={allSelected}
                          onChange={(e) =>
                            setSelected(e.target.checked ? new Set(selectable.map((r) => r.id)) : new Set())
                          }
                          className="h-4 w-4"
                        />
                      </th>
                    ) : null}
                    <th scope="col" className={tc.th}>{t("date")}</th>
                    <th scope="col" className={tc.th}>{t("senderAndDescription")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("amount")}</th>
                    <th scope="col" className={tc.th}>{t("unitColumn")}</th>
                    <th scope="col" className={tc.th}><span className="sr-only">{t("actionsColumn")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {incoming.map((r) => {
                    const unit = unitOf[r.id] ?? "";
                    return (
                      <tr key={r.id} className={cn(tc.tr, failed[r.id] && "bg-danger-soft")}>
                        {canCollect ? (
                          <td className={tc.td}>
                            <input
                              type="checkbox"
                              aria-label={t("selectRow")}
                              disabled={!unit}
                              checked={selected.has(r.id)}
                              onChange={(e) => {
                                const next = new Set(selected);
                                if (e.target.checked) next.add(r.id);
                                else next.delete(r.id);
                                setSelected(next);
                              }}
                              className="h-4 w-4"
                            />
                          </td>
                        ) : null}
                        <td className={`${tc.tdMuted} whitespace-nowrap text-xs`}>{date(r.transactionAt)}</td>
                        <td className={`${tc.td} max-w-md text-xs`}>
                          {r.counterparty ? <div className="font-semibold text-fg">{r.counterparty}</div> : null}
                          <div className="text-fg-muted">{r.description ?? "—"}</div>
                          {r.accountLabel ? <div className="mt-0.5 text-[11px] text-fg-subtle">{r.accountLabel}</div> : null}
                          {failed[r.id] ? <div className="mt-1 font-semibold text-danger-fg">{failed[r.id]}</div> : null}
                        </td>
                        <td className={`${tc.tdNum} whitespace-nowrap text-success-fg`}>+{money(r.amountMinor)}</td>
                        <td className={tc.td}>
                          <div className="flex items-center gap-1.5">
                            <label className="sr-only" htmlFor={`unit-${r.id}`}>{t("unitColumn")}</label>
                            <Select
                              id={`unit-${r.id}`}
                              value={unit}
                              disabled={!canCollect}
                              onChange={(e) => {
                                setUnitOf({ ...unitOf, [r.id]: e.target.value });
                                const next = new Set(selected);
                                if (e.target.value) next.add(r.id);
                                else next.delete(r.id);
                                setSelected(next);
                              }}
                              className="h-9 w-40 text-xs"
                            >
                              <option value="">{t("chooseUnit")}</option>
                              {units.map((u) => (
                                <option key={u.id} value={u.id}>{u.label}</option>
                              ))}
                            </Select>
                            {r.suggestedUnitId && unit === r.suggestedUnitId && r.confidence !== null ? (
                              <Badge tone={r.confidence >= 0.8 ? "success" : "warning"}>
                                {t("suggestionPct", { pct: Math.round(r.confidence * 100) })}
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className={tc.td}>
                          <div className="flex items-center justify-end gap-1.5">
                            {canCollect ? (
                              <button
                                type="button"
                                disabled={pending || !unit}
                                onClick={() => collect([r.id])}
                                className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
                              >
                                {t("collect")}
                              </button>
                            ) : null}
                            <TransactionActions id={r.id} canConfirm={false} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("queueOutgoing", { count: outgoing.length })} description={t("queueOutgoingHint")} />
        <CardBody className="p-0">
          {outgoing.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t("queueOutgoingEmpty")} description={t("queueEmptyHint")} />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 860 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("date")}</th>
                    <th scope="col" className={tc.th}>{t("descriptionColumn")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("amount")}</th>
                    <th scope="col" className={tc.th}>{t("expenseCategory")}</th>
                    <th scope="col" className={tc.th}>{t("vendor")}</th>
                    <th scope="col" className={tc.th}><span className="sr-only">{t("actionsColumn")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {outgoing.map((r) => (
                    <tr key={r.id} className={tc.tr}>
                      <td className={`${tc.tdMuted} whitespace-nowrap text-xs`}>{date(r.transactionAt)}</td>
                      <td className={`${tc.td} max-w-sm text-xs`}>
                        {r.counterparty ? <div className="font-semibold text-fg">{r.counterparty}</div> : null}
                        <div className="text-fg-muted">{r.description ?? "—"}</div>
                      </td>
                      <td className={`${tc.tdNum} whitespace-nowrap`}>−{money(r.amountMinor)}</td>
                      <td className={tc.td}>
                        <label className="sr-only" htmlFor={`cat-${r.id}`}>{t("expenseCategory")}</label>
                        <Select
                          id={`cat-${r.id}`}
                          value={categoryOf[r.id] ?? ""}
                          disabled={!canExpense}
                          onChange={(e) => setCategoryOf({ ...categoryOf, [r.id]: e.target.value })}
                          className="h-9 w-44 text-xs"
                        >
                          <option value="">{t("chooseCategory")}</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.depth > 0 ? `— ${c.name}` : c.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className={tc.td}>
                        <label className="sr-only" htmlFor={`vendor-${r.id}`}>{t("vendor")}</label>
                        <Select
                          id={`vendor-${r.id}`}
                          value={vendorOf[r.id] ?? ""}
                          disabled={!canExpense}
                          onChange={(e) => setVendorOf({ ...vendorOf, [r.id]: e.target.value })}
                          className="h-9 w-40 text-xs"
                        >
                          <option value="">{t("vendorNone")}</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </Select>
                      </td>
                      <td className={tc.td}>
                        <div className="flex items-center justify-end gap-1.5">
                          {canExpense ? (
                            <button
                              type="button"
                              disabled={pending || !categoryOf[r.id]}
                              onClick={() => expense(r.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
                            >
                              <Receipt aria-hidden className="h-3.5 w-3.5" />
                              {t("recordExpense")}
                            </button>
                          ) : null}
                          <TransactionActions id={r.id} canConfirm={false} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
