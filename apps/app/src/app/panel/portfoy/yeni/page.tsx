import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requireContext } from "@/lib/context";
import { createAnotherTenant } from "@/app/kurulum/actions";
import { SetupForm } from "@/app/kurulum/setup-form";

export const dynamic = "force-dynamic";

/**
 * `/panel/portfoy/yeni` — mevcut yöneticinin yeni site eklemesi.
 *
 * `/kurulum` yalnız hiç sitesi olmayanlar için; sitesi olan oraya girince
 * panele dönüyor. Yetki görünürlük içindir, gerçek kapı `POST /v1/auth/setup`
 * (üyeliği olup yönetici rolü olmayan 403 alır).
 */
export default async function NewTenantPage() {
  const ctx = await requireContext();
  if (!ctx.roles.some((r) => r === "manager" || r === "company_admin")) {
    redirect("/panel/portfoy");
  }
  const t = await getTranslations("app.portfolio");

  return (
    <>
      <PageHeader
        title={t("newTenant")}
        description={t("newTenantDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/portfoy" },
          { label: t("newTenant") },
        ]}
      />
      <Card className="max-w-3xl">
        <CardBody>
          <SetupForm action={createAnotherTenant} />
        </CardBody>
      </Card>
    </>
  );
}
