import { asc, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { blocks, units, withTenant } from "@yonetim/db";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";

export const dynamic = "force-dynamic";

export default async function UnitsPage() {
  const ctx = await requirePermission("unit:read");
  const t = await getTranslations("app.units");
  const tEnum = await getTranslations("enum");

  const data = await withTenant(ctx.tenantId, async (tx) => {
    const blockRows = await tx
      .select()
      .from(blocks)
      .where(isNull(blocks.deletedAt))
      .orderBy(asc(blocks.sortOrder));
    const unitRows = await tx
      .select()
      .from(units)
      .where(isNull(units.deletedAt))
      .orderBy(asc(units.number));
    return { blockRows, unitRows };
  });

  if (data.unitRows.length === 0) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
        />
      </>
    );
  }

  const totalArea = data.unitRows.reduce((a, u) => a + Number(u.areaM2 ?? 0), 0);
  const totalShare = data.unitRows.reduce((a, u) => a + Number(u.landShare ?? 0), 0);
  const shareLooksWrong = totalShare > 0 && Math.abs(totalShare - 1) > 0.01 && Math.abs(totalShare - 1000) > 1;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("summary", {
          units: data.unitRows.length,
          blocks: data.blockRows.length,
          area: totalArea.toLocaleString(ctx.locale),
          share: totalShare.toFixed(4),
        })}
      />

      {shareLooksWrong ? (
        <div className="mb-4">
          <Alert tone="warning">{t("landShareWarning")}</Alert>
        </div>
      ) : null}

      <Card>
        <CardHeader title={t("listTitle")} />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table} style={{ minWidth: 720 }}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>{t("number")}</th>
                  <th scope="col" className={tc.th}>{t("block")}</th>
                  <th scope="col" className={tc.th}>{t("floor")}</th>
                  <th scope="col" className={tc.th}>{t("type")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("area")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("landShare")}</th>
                  <th scope="col" className={tc.th}>{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.unitRows.map((u) => {
                  const block = data.blockRows.find((b) => b.id === u.blockId);
                  return (
                    <tr key={u.id} className={tc.tr}>
                      <td className={`${tc.td} font-medium`}>{u.number}</td>
                      <td className={tc.tdMuted}>{block?.name ?? "—"}</td>
                      <td className={tc.td}>{u.floor}</td>
                      <td className={tc.td}>{tEnum(`unitType.${u.type}`)}</td>
                      <td className={tc.tdNum}>{u.areaM2 ?? "—"}</td>
                      <td className={tc.tdNum}>{u.landShare ?? "—"}</td>
                      <td className={tc.td}>
                        {u.duesExempt ? (
                          <Badge tone="warning">{t("duesExempt")}</Badge>
                        ) : (
                          <Badge tone="neutral">{tEnum(`occupancy.${u.ownershipType}`)}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
