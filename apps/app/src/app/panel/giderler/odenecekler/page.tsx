import { getTranslations } from "next-intl/server";

import { payablesResponse } from "@yonetim/contracts";
import { Card, CardBody, CardHeader, Input, Select, Stat } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet, toQuery } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { PayablesTable } from "./payables-table";

export const dynamic = "force-dynamic";

const PARTIES = ["all", "expense", "vendor", "staff"] as const;
const STATES = ["pending", "paid", "all"] as const;

/** Ödenecekler — gider/firma/personel borçları, bekleyen ya da ödenmiş. */
export default async function PayablesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("expense:read");
  const t = await getTranslations("app.payables");
  const tExp = await getTranslations("app.expenses");
  const f = await formatters();
  const params = await searchParams;
  const party = (PARTIES as readonly string[]).includes(params.taraf ?? "") ? params.taraf! : "all";
  const state = (STATES as readonly string[]).includes(params.durum ?? "") ? params.durum! : "pending";
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
  const data = await apiGet(
    `/v1/panel/payables?${toQuery({ party, state, from: valid(params.from), to: valid(params.to) })}`,
    payablesResponse,
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumb={[{ label: tExp("title"), href: "/panel/giderler" }, { label: t("title") }]}
      />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label={t("pending")} value={f.money(data.totals.pendingMinor)} tone={data.totals.pendingMinor > 0 ? "warning" : "success"} />
        <Stat label={t("paid")} value={f.money(data.totals.paidMinor)} />
      </div>
      <Card>
        <CardHeader title={t("count", { count: data.rows.length })} />
        <CardBody className="border-b border-border">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-fg-subtle">
              {t("party")}
              <Select name="taraf" defaultValue={party} className="mt-0.5 h-9">
                {PARTIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`partyOption.${p}`)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-fg-subtle">
              {t("state")}
              <Select name="durum" defaultValue={state} className="mt-0.5 h-9">
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {t(`stateOption.${s}`)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-fg-subtle">
              {t("from")}
              <Input type="date" name="from" defaultValue={valid(params.from) ?? ""} className="mt-0.5 h-9" />
            </label>
            <label className="text-xs text-fg-subtle">
              {t("to")}
              <Input type="date" name="to" defaultValue={valid(params.to) ?? ""} className="mt-0.5 h-9" />
            </label>
            <button type="submit" className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover">
              {t("apply")}
            </button>
          </form>
        </CardBody>
        <CardBody className="p-0">
          <PayablesTable
            canPay={can(ctx, "expense:approve")}
            rows={data.rows.map((r) => ({
              id: r.id,
              date: f.date(r.date),
              party: t(`partyOption.${r.party}`),
              partyName: r.partyName,
              description: r.description,
              category: r.category,
              invoiceNo: r.invoiceNo,
              amount: f.money(r.amountMinor),
              paid: r.paid,
              paidAt: r.paidAt ? f.date(r.paidAt) : null,
              recurring: r.recurring,
            }))}
          />
        </CardBody>
      </Card>
    </>
  );
}
