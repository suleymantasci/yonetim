import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { MyRequestForm } from "../request-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.myRequests");
  return { title: t("new") };
}

export default async function NewMyRequestPage() {
  await requirePermission("request:write");
  const t = await getTranslations("app.myRequests");

  return (
    <>
      <PageHeader
        title={t("new")}
        description={t("newDescription")}
        breadcrumb={[
          { href: "/panel/taleplerim", label: t("title") },
          { label: t("new") },
        ]}
      />
      <Card>
        <CardBody>
          <MyRequestForm cancelHref="/panel/taleplerim" />
        </CardBody>
      </Card>
    </>
  );
}
