import { getTranslations } from "next-intl/server";

import { budgetDetail, budgetOptions } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { BudgetForm } from "../budget-form";
import { defaultPeriods, suggestedLines } from "../defaults";

export const dynamic = "force-dynamic";

export default async function NewBudgetPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("dues:write");
  const t = await getTranslations("app.budget");
  const params = await searchParams;
  const { categories } = await apiGet(
    "/v1/panel/budgets/options",
    budgetOptions,
  );

  // "Önceki projeden kopyala": kalemler ve tutarlar aynen, dönem bir sonraki.
  const copy = params.copy
    ? await apiGet(`/v1/panel/budgets/${params.copy}`, budgetDetail).catch(
        () => null,
      )
    : null;
  const periods = defaultPeriods();

  return (
    <>
      <PageHeader title={t("newBudget")} description={t("newBudgetHint")} />
      <BudgetForm
        categories={categories}
        submitLabel={t("saveDraft")}
        cancelHref="/panel/butce"
        defaults={{
          name: copy
            ? `${copy.budget.name} (${t("copySuffix")})`
            : t("defaultName", { year: periods.start.slice(0, 4) }),
          startPeriod: periods.start,
          endPeriod: periods.end,
          formula: copy?.budget.formula ?? "land_share",
          mixEqualPct: copy?.budget.mixEqualPct ?? 50,
          reservePct: copy?.budget.reservePct ?? 5,
          notes: null,
          lines: copy
            ? copy.lines.map((l, i) => ({
                key: `c${i}`,
                label: l.label,
                source: l.isStaff ? "staff" : (l.categoryId ?? ""),
                plannedMinor: l.plannedMinor,
              }))
            : suggestedLines(categories),
        }}
      />
    </>
  );
}
