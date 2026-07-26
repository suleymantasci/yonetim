import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth";
import { Alert, Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { getCategoryTree } from "@/lib/queries/expenses";
import { ExpenseForm } from "../expense-form";

export const dynamic = "force-dynamic";

export default async function NewExpensePage() {
  const ctx = await requirePermission("expense:write");
  const t = await getTranslations("app.expenses");
  const tCommon = await getTranslations("common");

  const tree = await getCategoryTree(ctx);
  // Ağacı düzleştir: form tek seviyeli `<select>` kullanıyor, girinti ile hiyerarşi verilir.
  const categories = tree.flatMap((root) => [
    {
      id: root.id,
      name: root.name,
      depth: 0,
      distribution: root.distribution,
      defaultVatRate: root.defaultVatRate,
    },
    ...root.children.map((child) => ({
      id: child.id,
      name: child.name,
      depth: 1,
      distribution: child.distribution,
      defaultVatRate: child.defaultVatRate,
    })),
  ]);

  return (
    <>
      <PageHeader
        title={t("newExpense")}
        description={t("newExpenseDescription")}
        breadcrumb={[{ label: t("title"), href: "/panel/giderler" }, { label: t("newExpense") }]}
      />

      {categories.length === 0 ? (
        <div className="mb-4 max-w-3xl">
          <Alert tone="warning" title={t("noCategoriesTitle")}>
            {t("noCategoriesBody")}
          </Alert>
        </div>
      ) : null}

      <Card className="max-w-3xl">
        <CardBody>
          <ExpenseForm
            categories={categories}
            cancelHref="/panel/giderler"
            submitLabel={tCommon("action.create")}
            canApprove={hasPermission(ctx.roles, "expense:approve")}
          />
        </CardBody>
      </Card>
    </>
  );
}
