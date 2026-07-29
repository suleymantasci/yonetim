import { getTranslations } from "next-intl/server";

import { RouteDrawer } from "@/components/route-drawer";
import { requirePermission } from "@/lib/context";
import { BankAccountDrawerFlow } from "../bank-account-drawer-flow";

export const dynamic = "force-dynamic";

/** `/panel/banka/hesap/yeni` — çekmece sürümü. */
export default async function NewBankAccountModal() {
  await requirePermission("bank:write");
  const t = await getTranslations("app.bank");
  const tCommon = await getTranslations("common");

  return (
    <RouteDrawer
      title={t("newAccount")}
      description={t("newAccountDescription")}
      closeLabel={tCommon("action.close")}
      size="lg"
    >
      <BankAccountDrawerFlow submitLabel={tCommon("action.create")} />
    </RouteDrawer>
  );
}
