"use client";

import { Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Badge, tableClasses as tc, useToast } from "@yonetim/ui";

import Link from "@/components/link";
import { setExpenseStatus } from "../actions";

export interface PayableView {
  id: string;
  date: string;
  party: string;
  partyName: string | null;
  description: string;
  category: string | null;
  invoiceNo: string | null;
  amount: string;
  paid: boolean;
  paidAt: string | null;
  recurring: boolean;
}

/** Ödenecekler tablosu — seçilenleri "ödendi" işaretle. */
export function PayablesTable({ rows, canPay }: { rows: PayableView[]; canPay: boolean }) {
  const t = useTranslations("app.payables");
  const toast = useToast();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const open = rows.filter((r) => !r.paid);

  if (rows.length === 0) return <p className="p-6 text-sm text-fg-subtle">{t("empty")}</p>;

  return (
    <>
      {canPay && open.length > 0 ? (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <span className="text-sm text-fg-subtle">{t("selected", { count: selected.size })}</span>
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={() =>
              start(async () => {
                const r = await setExpenseStatus([...selected], "paid");
                if (r.ok) toast.success(r.message);
                else toast.error(r.message);
                setSelected(new Set());
                router.refresh();
              })
            }
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
          >
            {t("markPaid")}
          </button>
        </div>
      ) : null}
      <div className={tc.wrapper}>
        <table className={tc.table}>
          <thead className={tc.thead}>
            <tr>
              {canPay ? (
                <th className={tc.th}>
                  <span className="sr-only">{t("select")}</span>
                </th>
              ) : null}
              <th className={tc.th}>{t("date")}</th>
              <th className={tc.th}>{t("party")}</th>
              <th className={tc.th}>{t("descriptionCol")}</th>
              <th className={tc.th}>{t("invoiceNo")}</th>
              <th className={`${tc.th} text-right`}>{t("amount")}</th>
              <th className={tc.th}>{t("state")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={tc.tr}>
                {canPay ? (
                  <td className={tc.td}>
                    {r.paid ? null : (
                      <input
                        type="checkbox"
                        aria-label={t("selectRow", { description: r.description })}
                        checked={selected.has(r.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(r.id);
                          else next.delete(r.id);
                          setSelected(next);
                        }}
                        className="h-4 w-4"
                      />
                    )}
                  </td>
                ) : null}
                <td className={`${tc.td} whitespace-nowrap`}>{r.date}</td>
                <td className={tc.td}>
                  <span className="block text-xs text-fg-subtle">{r.party}</span>
                  {r.partyName ?? "—"}
                </td>
                <td className={tc.td}>
                  <Link href={`/panel/giderler/${r.id}`} className="hover:underline">
                    {r.description}
                  </Link>
                  {r.recurring ? <Repeat aria-label={t("recurringBadge")} className="ml-1 inline h-3.5 w-3.5 text-fg-subtle" /> : null}
                  {r.category ? <span className="block text-xs text-fg-subtle">{r.category}</span> : null}
                </td>
                <td className={tc.tdMuted}>{r.invoiceNo ?? "—"}</td>
                <td className={tc.tdNum}>{r.amount}</td>
                <td className={tc.td}>
                  {r.paid ? <Badge tone="success">{t("paidOn", { date: r.paidAt ?? "" })}</Badge> : <Badge tone="warning">{t("waiting")}</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
