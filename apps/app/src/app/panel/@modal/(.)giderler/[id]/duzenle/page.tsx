import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import {
  categoryTree as categoryTreeSchema,
  expenseDetail as expenseDetailSchema,
} from "@yonetim/contracts";
import { AppError } from "@yonetim/core";
import { Alert } from "@yonetim/ui";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { EditExpenseFlow } from "./edit-expense-flow";

export const dynamic = "force-dynamic";

/**
 * `/panel/giderler/[id]/duzenle` — çekmece sürümü.
 *
 * Gider **ekleme** çekmecesi zaten vardı, düzenleme yoktu: listeden bir
 * gideri düzeltmek tam sayfaya atlıyor ve filtreyi kaybettiriyordu. İki
 * akışın ritmi artık aynı.
 */
export default async function EditExpenseModal({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("expense:write");
  const t = await getTranslations("app.expenses");
  const tCommon = await getTranslations("common");

  const [detail, categoryData] = await Promise.all([
    apiGet(`/v1/panel/expenses/${id}`, expenseDetailSchema).catch(
      (error: unknown) => {
        if (error instanceof AppError && error.code === "not_found") notFound();
        throw error;
      },
    ),
    apiGet("/v1/panel/expenses/kategoriler", categoryTreeSchema),
  ]);
  if (!detail) notFound();

  const expense = detail.expense;

  return (
    <RouteDrawer
      title={t("editExpense")}
      description={expense.description}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      {/*
        Dağıtılmış gider düzenlenemez: karşılığında sakin borçları var ve
        tutarı değiştirmek o borçlarla çelişirdi. Tam sayfa sürümüyle aynı
        kural, aynı gerekçe.
      */}
      {expense.distributedAt ? (
        <div className="p-5 sm:p-6">
          <Alert tone="danger" title={t("alreadyDistributedEdit")}>
            {t("alreadyDistributedEditHint")}
          </Alert>
        </div>
      ) : (
        <EditExpenseFlow
          categories={categoryData.roots.flatMap((root) => [
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
          ])}
          canApprove={hasPermission(ctx.roles, "expense:approve")}
          submitLabel={tCommon("action.save")}
          defaults={{
            id: expense.id,
            categoryId: expense.categoryId,
            vendorName: expense.vendorName,
            description: expense.description,
            amountKurus: expense.amountMinor,
            vatRate: expense.vatRate ?? "",
            withholdingKurus: expense.withholdingMinor,
            invoiceNo: expense.invoiceNo,
            expenseDate: expense.expenseDate.toISOString().slice(0, 10),
            paidVia: expense.paidVia,
            isPaid: expense.paidAt !== null,
            attachmentUrl: expense.attachmentUrl,
            status: expense.status,
          }}
        />
      )}
    </RouteDrawer>
  );
}
