import { getTranslations } from "next-intl/server";

import { recurringExpenseList } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { RecurringManager } from "./recurring-manager";

export const dynamic = "force-dynamic";

/** Tekrarlayan faturalar — her ay kendiliğinden ödenecek gider kaydı açan tanımlar. */
export default async function RecurringPage() {
  const ctx = await requirePermission("expense:read");
  const t = await getTranslations("app.recurring");
  const tExp = await getTranslations("app.expenses");
  const f = await formatters();
  const data = await apiGet("/v1/panel/payables/recurring", recurringExpenseList);
  const thisPeriod = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 7);
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumb={[{ label: tExp("title"), href: "/panel/giderler" }, { label: t("title") }]}
      />
      <RecurringManager
        canWrite={can(ctx, "expense:write")}
        thisPeriod={thisPeriod}
        options={data.options}
        rows={data.rows.map((r) => ({
          ...r,
          amount: f.money(r.amountMinor),
          next: r.nextDate ? f.date(new Date(`${r.nextDate}T12:00:00`)) : null,
        }))}
      />
    </>
  );
}
