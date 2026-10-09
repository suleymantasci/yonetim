import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { ExpenseImporter } from "./expense-importer";

export const dynamic = "force-dynamic";

/** Giderleri Excel/CSV'den yükle — önizleme, eşleşme, tek seferde kayıt. */
export default async function ExpenseImportPage() {
  await requirePermission("expense:write");
  const t = await getTranslations("app.expenseImport");
  const tExp = await getTranslations("app.expenses");
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumb={[{ label: tExp("title"), href: "/panel/giderler" }, { label: t("title") }]}
      />
      <ExpenseImporter />
    </>
  );
}
