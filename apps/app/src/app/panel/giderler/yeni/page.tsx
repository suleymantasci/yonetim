import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { categoryTree as categoryTreeSchema } from "@yonetim/contracts";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { getBankAccountOptions } from "@/lib/bank-accounts";
import { requirePermission } from "@/lib/context";
import { ExpenseForm } from "../expense-form";

export const dynamic = "force-dynamic";

export default async function NewExpensePage() {
  const ctx = await requirePermission("expense:write");
  const t = await getTranslations("app.expenses");
  const tCommon = await getTranslations("common");

  /* Hesap listesi "para hangi hesaptan çıktı" seçimi için; boşsa sorulmaz. */
  const [{ roots: tree }, bankAccounts] = await Promise.all([
    apiGet("/v1/panel/expenses/categories", categoryTreeSchema),
    getBankAccountOptions(),
  ]);
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
        breadcrumb={[
          { label: t("title"), href: "/panel/giderler" },
          { label: t("newExpense") },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <ExpenseForm
            categories={categories}
            bankAccounts={bankAccounts}
            cancelHref="/panel/giderler"
            submitLabel={tCommon("action.create")}
            canApprove={hasPermission(ctx.roles, "expense:approve")}
          />
        </CardBody>
      </Card>
    </>
  );
}
