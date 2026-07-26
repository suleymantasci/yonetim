import { desc, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { expenseCategories, expenses, withTenant } from "@yonetim/db";
import {
  Card, CardBody, CardHeader, EmptyState, ProgressBar, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

const LIMIT = 200;

export default async function ExpensesPage() {
  const ctx = await requirePermission("expense:read");
  const t = await getTranslations("app.expenses");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const data = await withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(expenses)
      .where(isNull(expenses.deletedAt))
      .orderBy(desc(expenses.expenseDate))
      .limit(LIMIT);
    const cats = await tx
      .select()
      .from(expenseCategories)
      .where(isNull(expenseCategories.deletedAt));
    return { rows, cats };
  });

  if (data.rows.length === 0) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
        />
      </>
    );
  }

  const total = data.rows.reduce((a, e) => a + e.amountKurus, 0);
  const vat = data.rows.reduce((a, e) => a + e.vatKurus, 0);

  const byCategory = new Map<string, number>();
  for (const e of data.rows) {
    const name = data.cats.find((c) => c.id === e.categoryId)?.name ?? "—";
    byCategory.set(name, (byCategory.get(name) ?? 0) + e.amountKurus);
  }
  const topCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <>
      <PageHeader title={t("title")} description={t("description", { count: LIMIT })} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("total")} value={f.money(total)} />
        <Stat label={t("vat")} value={f.money(vat)} hint={t("vatHint")} />
        <Stat label={t("count")} value={String(data.rows.length)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("listTitle")} />
          <CardBody className="p-0">
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 640 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("date")}</th>
                    <th scope="col" className={tc.th}>{t("descriptionColumn")}</th>
                    <th scope="col" className={tc.th}>{t("category")}</th>
                    <th scope="col" className={tc.th}>{t("status")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((e) => (
                    <tr key={e.id} className={tc.tr}>
                      <td className={tc.tdMuted}>{f.date(e.expenseDate)}</td>
                      <td className={tc.td}>{e.description}</td>
                      <td className={tc.tdMuted}>
                        {data.cats.find((c) => c.id === e.categoryId)?.name ?? "—"}
                      </td>
                      <td className={tc.td}>{tEnum(`expenseStatus.${e.status}`)}</td>
                      <td className={tc.tdNum}>{f.money(e.amountKurus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("categoryBreakdown")} />
          <CardBody className="space-y-3">
            {topCategories.map(([name, amount]) => (
              <div key={name}>
                <div className="flex justify-between text-sm text-fg">
                  <span>{name}</span>
                  <span className="tabular-nums">{f.money(amount)}</span>
                </div>
                <ProgressBar value={amount} max={total} label={name} className="mt-1" />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
