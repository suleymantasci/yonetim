import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { budgetDetail } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { BudgetForm } from "../../budget-form";

export const dynamic = "force-dynamic";

export default async function EditBudgetPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("dues:write");
  const t = await getTranslations("app.budget");
  const data = await apiGet(`/v1/panel/budgets/${id}`, budgetDetail).catch(
    () => null,
  );
  if (!data) notFound();
  // Onaylı proje genel kurul kararı: düzenlenmez, kopyası alınır.
  if (data.budget.status === "approved") redirect(`/panel/butce/${id}`);
  const b = data.budget;

  return (
    <>
      <PageHeader title={t("editBudget")} description={b.name} />
      <BudgetForm
        categories={data.categories}
        submitLabel={t("saveDraft")}
        cancelHref={`/panel/butce/${id}`}
        defaults={{
          id: b.id,
          name: b.name,
          startPeriod: b.startPeriod,
          endPeriod: b.endPeriod,
          formula: b.formula,
          mixEqualPct: b.mixEqualPct,
          reservePct: b.reservePct,
          notes: b.notes,
          lines: data.lines.map((l, i) => ({
            key: `e${i}`,
            label: l.label,
            source: l.isStaff ? "staff" : (l.categoryId ?? ""),
            plannedMinor: l.plannedMinor,
          })),
        }}
      />
    </>
  );
}
