import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { BankAccountForm } from "../../bank-account-form";

export const dynamic = "force-dynamic";

/** `/panel/banka/hesap/yeni` — tam sayfa (çekmece: `@modal/(.)banka`). */
export default async function NewBankAccountPage() {
  await requirePermission("bank:write");
  const t = await getTranslations("app.bank");
  const tCommon = await getTranslations("common");

  return (
    <>
      <PageHeader
        title={t("newAccount")}
        description={t("newAccountDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/banka" },
          { label: t("newAccount") },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <BankAccountForm
            cancelHref="/panel/banka"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
