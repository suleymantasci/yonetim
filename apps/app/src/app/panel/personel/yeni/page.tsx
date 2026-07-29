import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { StaffForm } from "../staff-form";

export const dynamic = "force-dynamic";

/**
 * `/panel/personel/yeni` — tam sayfa sürüm.
 *
 * Çekmece sürümü `@modal/(.)personel/yeni` içinde. İkisi de duruyor çünkü
 * kesme (interception) yalnız uygulama içi gezinmede devreye giriyor; adrese
 * doğrudan gidildiğinde (yeni sekme, paylaşılan bağlantı, yenileme) bu sayfa
 * açılıyor.
 */
export default async function NewStaffPage() {
  await requirePermission("staff:write");
  const t = await getTranslations("app.staff");
  const tCommon = await getTranslations("common");

  return (
    <>
      <PageHeader
        title={t("newStaff")}
        description={t("newStaffDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/personel" },
          { label: t("newStaff") },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <StaffForm
            cancelHref="/panel/personel"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
