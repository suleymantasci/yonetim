import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { categoryTree as categoryTreeSchema } from "@yonetim/contracts";
import { Alert } from "@yonetim/ui";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { getBankAccountOptions } from "@/lib/bank-accounts";
import { requirePermission } from "@/lib/context";
import { NewExpenseFlow } from "./new-expense-flow";

export const dynamic = "force-dynamic";

/** `/panel/giderler/yeni` — çekmece sürümü. Veri hazırlığı tam sayfayla aynı. */
export default async function NewExpenseModal() {
  const ctx = await requirePermission("expense:write");
  const t = await getTranslations("app.expenses");
  const tCommon = await getTranslations("common");

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
    <RouteDrawer
      title={t("newExpense")}
      description={t("newExpenseDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      {/* Çekmece gövdesi artık dolgusuz (`padded={false}`); kaydırma ve iç
          boşluk formun kabuğunda. Uyarı formun dışında kaldığı için kendi
          boşluğunu taşıyor ve kaydırma alanının üstünde sabit duruyor. */}
      {categories.length === 0 ? (
        <div className="px-5 pt-5 sm:px-6">
          <Alert tone="warning" title={t("noCategoriesTitle")}>
            {t("noCategoriesBody")}
          </Alert>
        </div>
      ) : null}

      <NewExpenseFlow
        categories={categories}
        bankAccounts={bankAccounts}
        canApprove={hasPermission(ctx.roles, "expense:approve")}
        labels={{
          submit: tCommon("action.create"),
          createdTitle: t("drawerCreatedTitle"),
          createdHint: t("drawerCreatedHint"),
          addAnother: t("drawerAddAnother"),
          openDetail: tCommon("action.detail"),
          done: tCommon("action.close"),
        }}
      />
    </RouteDrawer>
  );
}
