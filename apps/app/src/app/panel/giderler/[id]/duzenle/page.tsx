import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import {
  categoryTree as categoryTreeSchema,
  expenseDetail as expenseDetailSchema,
} from "@yonetim/contracts";
import { AppError } from "@yonetim/core";
import { Alert, Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { getBankAccountOptions } from "@/lib/bank-accounts";
import { requirePermission } from "@/lib/context";
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

  const [detail, categoryData] = await Promise.all([
    apiGet(`/v1/panel/expenses/${id}`, expenseDetailSchema).catch(
      (error: unknown) => {
        if (error instanceof AppError && error.code === "not_found") notFound();
        throw error;
      },
    ),
    apiGet("/v1/panel/expenses/categories", categoryTreeSchema),
  ]);
  const tree = categoryData.roots;
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

  /*
   * Kapatılmış hesap listede yok ama kayıt o hesaba bağlıysa seçenek
   * kalmalı: aksi hâlde form sessizce "nakit"e düşer ve düzenleme,
   * dokunulmamış bir alanı bozardı.
   */
  const bankAccounts = await getBankAccountOptions(expense.bankAccountId);

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
            bankAccounts={bankAccounts}
            cancelHref={`/panel/giderler/${id}`}
            submitLabel={tCommon("action.save")}
            canApprove={hasPermission(ctx.roles, "expense:approve")}
            defaults={{
              id: expense.id,
              categoryId: expense.categoryId,
              vendorName: expense.vendorName,
              description: expense.description,
              amountKurus: expense.amountMinor,
              // Sözleşmede numeric alanlar metin olarak taşınıyor (kesir
              // hassasiyeti korunsun diye); form boş değeri kabul ediyor.
              vatRate: expense.vatRate ?? "",
              withholdingKurus: expense.withholdingMinor,
              invoiceNo: expense.invoiceNo,
              expenseDate: expense.expenseDate.toISOString().slice(0, 10),
              paidVia: expense.paidVia,
              bankAccountId: expense.bankAccountId,
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
