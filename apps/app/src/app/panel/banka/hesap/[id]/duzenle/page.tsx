import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { bankAccountDetail } from "@yonetim/contracts";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { BankAccountForm } from "../../../bank-account-form";

export const dynamic = "force-dynamic";

/** `/panel/banka/hesap/[id]/duzenle` — tam sayfa (çekmece: `@modal`). */
export default async function EditBankAccountPage({
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
    <>
      <PageHeader
        title={detail.bankName}
        description={t("editAccountDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/banka" },
          { label: detail.ibanMasked },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <BankAccountForm
            defaults={{
              id: detail.id,
              bankName: detail.bankName,
              ibanMasked: detail.ibanMasked,
              accountName: detail.accountName,
              purpose: detail.purpose,
              isActive: detail.isActive,
              hasPayments: detail.hasPayments,
            }}
            cancelHref="/panel/banka"
            submitLabel={tCommon("action.save")}
          />
        </CardBody>
      </Card>
    </>
  );
}
