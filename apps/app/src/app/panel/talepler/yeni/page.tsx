import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { requestListResponse } from "@yonetim/contracts";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { RequestForm } from "../request-form";

export const dynamic = "force-dynamic";

/** `/panel/talepler/yeni` — tam sayfa sürüm (çekmece: `@modal/(.)talepler`). */
export default async function NewRequestPage() {
  const ctx = await requirePermission("request:write");
  const t = await getTranslations("app.requests");
  const tCommon = await getTranslations("common");

  // Daire ve görevli seçenekleri liste ucundan geliyor (§9a): ayrı uçtan
  // çekmek aynı ekran için üçüncü bir gidiş-dönüş olurdu.
  const { units, assignees } = await apiGet(
    "/v1/panel/operations/requests",
    requestListResponse,
  );

  return (
    <>
      <PageHeader
        title={t("newRequest")}
        description={t("newRequestDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/talepler" },
          { label: t("newRequest") },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <RequestForm
            units={units}
            assignees={assignees}
            canAssign={hasPermission(ctx.roles, "request:assign")}
            cancelHref="/panel/talepler"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
