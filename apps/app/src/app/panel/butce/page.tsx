import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { budgetListResponse } from "@yonetim/contracts";
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import Link from "@/components/link";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

/** İşletme projeleri (KMK 37) — dönem bütçeleri, plan/gerçekleşen. */
export default async function BudgetsPage() {
  const ctx = await requirePermission("report:read");
  const t = await getTranslations("app.budget");
  const f = await formatters();
  const { rows } = await apiGet("/v1/panel/budgets", budgetListResponse);
  const canWrite = hasPermission(ctx.roles, "dues:write");

  const newButton = canWrite ? (
    <Link
      href="/panel/butce/yeni"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
    >
      <Plus aria-hidden className="h-4 w-4" />
      {t("newBudget")}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={newButton}
      />
      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
                action={newButton}
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>
                      {t("name")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("periodColumn")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("status")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("grandTotal")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("monthlyShort")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("actual")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id} className={tc.tr}>
                      <td className={tc.td}>
                        <Link
                          href={`/panel/butce/${b.id}`}
                          className="font-medium text-fg underline-offset-2 hover:underline"
                        >
                          {b.name}
                        </Link>
                      </td>
                      <td className={tc.tdMuted}>
                        {f.period(b.startPeriod)} – {f.period(b.endPeriod)}
                      </td>
                      <td className={tc.td}>
                        <Badge
                          tone={b.status === "approved" ? "success" : "neutral"}
                        >
                          {t(`statusOption.${b.status}`)}
                        </Badge>
                      </td>
                      <td className={tc.tdNum}>{f.money(b.totalMinor)}</td>
                      <td className={tc.tdNum}>{f.money(b.monthlyMinor)}</td>
                      <td className={tc.tdNum}>{f.money(b.actualMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
