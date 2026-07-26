import { eq, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { maskPhone, type Role } from "@yonetim/core";
import { memberships, unitOccupancies, units, users, withBypassRls, withTenant } from "@yonetim/db";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { logDataAccess, requirePermissionWithLog } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function ResidentsPage() {
  const ctx = await requirePermissionWithLog("resident:read");
  const t = await getTranslations("app.residents");
  const tEnum = await getTranslations("enum");

  const occupancies = await withTenant(ctx.tenantId, async (tx) =>
    tx
      .select({
        id: unitOccupancies.id,
        userId: unitOccupancies.userId,
        relation: unitOccupancies.relation,
        unitNumber: units.number,
      })
      .from(unitOccupancies)
      .innerJoin(units, eq(units.id, unitOccupancies.unitId))
      .where(isNull(unitOccupancies.endDate)),
  );

  const userIds = [...new Set(occupancies.map((o) => o.userId))];
  const people = userIds.length
    ? await withBypassRls("residents:list", async (tx) =>
        tx
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            whatsappOptIn: users.whatsappOptIn,
          })
          .from(users)
          .where(isNull(users.deletedAt)),
      )
    : [];

  const roles = await withTenant(ctx.tenantId, async (tx) =>
    tx
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(isNull(memberships.deletedAt)),
  );

  // KVKK: sakin listesini görüntüleme kaydı (Bölüm 3.3).
  for (const uid of userIds.slice(0, 50)) {
    await logDataAccess(ctx, {
      subjectUserId: uid,
      dataCategory: "iletisim_bilgisi",
      action: "view",
      purpose: "resident_list_view",
    });
  }

  if (occupancies.length === 0) {
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

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4">
        <Alert tone="info">{t("privacyNotice")}</Alert>
      </div>

      <Card>
        <CardHeader title={t("activeCount", { count: occupancies.length })} />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table} style={{ minWidth: 720 }}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>{t("fullName")}</th>
                  <th scope="col" className={tc.th}>{t("unit")}</th>
                  <th scope="col" className={tc.th}>{t("relation")}</th>
                  <th scope="col" className={tc.th}>{t("phone")}</th>
                  <th scope="col" className={tc.th}>{t("role")}</th>
                  <th scope="col" className={tc.th}>{t("whatsapp")}</th>
                </tr>
              </thead>
              <tbody>
                {occupancies.map((o) => {
                  const person = people.find((p) => p.id === o.userId);
                  const role = roles.find((r) => r.userId === o.userId)?.role as Role | undefined;
                  return (
                    <tr key={o.id} className={tc.tr}>
                      <td className={`${tc.td} font-medium`}>
                        {[person?.firstName, person?.lastName].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className={tc.td}>{o.unitNumber}</td>
                      <td className={tc.td}>{tEnum(`ownership.${o.relation}`)}</td>
                      <td className={`${tc.tdMuted} tabular-nums`}>
                        {person?.phone ? maskPhone(person.phone) : "—"}
                      </td>
                      <td className={tc.td}>{role ? tEnum(`role.${role}`) : "—"}</td>
                      <td className={tc.td}>
                        {person?.whatsappOptIn ? (
                          <Badge tone="success">{t("whatsappOptIn")}</Badge>
                        ) : (
                          <Badge tone="neutral">{t("whatsappOptOut")}</Badge>
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
