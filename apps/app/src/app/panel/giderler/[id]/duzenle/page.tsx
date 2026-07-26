import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth";
import { Alert, Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { getCategoryTree, getExpenseDetail } from "@/lib/queries/expenses";
import { ExpenseForm } from "../../expense-form";

export const dynamic = "force-dynamic";

export default async function EditExpensePage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("expense:write");
  const t = await getTranslations("app.expenses");
  const tCommon = await getTranslations("common");

  const [detail, tree] = await Promise.all([getExpenseDetail(ctx, id), getCategoryTree(ctx)]);
  if (!detail) notFound();

  const expense = detail.expense;

  // Dağıtılmış gider düzenlenemez: karşılığında sakin borçları var.
  if (expense.distributedAt) {
    return (
      <>
        <PageHeader
          title={t("editExpense")}
          breadcrumb={[
            { label: t("title"), href: "/panel/giderler" },
            { label: expense.description, href: `/panel/giderler/${id}` },
            { label: tCommon("action.edit") },
          ]}
        />
        <div className="max-w-3xl">
          <Alert tone="danger" title={t("alreadyDistributedEdit")}>
            {t("alreadyDistributedEditHint")}
          </Alert>
        </div>
      </>
    );
  }

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
        title={t("editExpense")}
        breadcrumb={[
          { label: t("title"), href: "/panel/giderler" },
          { label: expense.description, href: `/panel/giderler/${id}` },
          { label: tCommon("action.edit") },
        ]}
      />
      <Card className="max-w-3xl">
        <CardBody>
          <ExpenseForm
            categories={categories}
            cancelHref={`/panel/giderler/${id}`}
            submitLabel={tCommon("action.save")}
            canApprove={hasPermission(ctx.roles, "expense:approve")}
            defaults={{
              id: expense.id,
              categoryId: expense.categoryId,
              vendorName: expense.vendorName,
              description: expense.description,
              amountKurus: expense.amountKurus,
              vatRate: expense.vatRate,
              withholdingKurus: expense.withholdingKurus,
              invoiceNo: expense.invoiceNo,
              expenseDate: expense.expenseDate.toISOString().slice(0, 10),
              paidVia: expense.paidVia,
              isPaid: expense.paidAt !== null,
              attachmentUrl: expense.attachmentUrl,
              status: expense.status,
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
