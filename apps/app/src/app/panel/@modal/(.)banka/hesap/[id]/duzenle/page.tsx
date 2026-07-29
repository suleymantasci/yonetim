import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { bankAccountDetail } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { BankAccountDrawerFlow } from "../../bank-account-drawer-flow";

export const dynamic = "force-dynamic";

/** `/panel/banka/hesap/[id]/duzenle` — çekmece sürümü. */
export default async function EditBankAccountModal({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("bank:write");
  const t = await getTranslations("app.bank");
  const tCommon = await getTranslations("common");

  const detail = await apiGet(
    `/v1/panel/bank/accounts/${id}`,
    bankAccountDetail,
  ).catch(() => null);
  if (!detail) notFound();

  return (
    <RouteDrawer
      title={detail.bankName}
      description={t("editAccountDescription")}
      closeLabel={tCommon("action.close")}
      size="lg"
    >
      <BankAccountDrawerFlow
        defaults={{
          id: detail.id,
          bankName: detail.bankName,
          ibanMasked: detail.ibanMasked,
          accountName: detail.accountName,
          purpose: detail.purpose,
          isActive: detail.isActive,
          hasPayments: detail.hasPayments,
        }}
        submitLabel={tCommon("action.save")}
      />
    </RouteDrawer>
  );
}
