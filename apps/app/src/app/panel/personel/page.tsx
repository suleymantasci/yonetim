import { desc, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { maskPhone } from "@yonetim/core";
import { staff, staffAttendance, withTenant } from "@yonetim/db";
import { Badge, Card, CardBody, CardHeader, EmptyState, Stat, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const ctx = await requirePermission("staff:read");
  const t = await getTranslations("app.staff");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const data = await withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.select().from(staff).where(isNull(staff.deletedAt));
    const attendance = await tx
      .select()
      .from(staffAttendance)
      .orderBy(desc(staffAttendance.checkInAt))
      .limit(50);
    return { rows, attendance };
  });

  const active = data.rows.filter((s) => s.isActive);
  const monthlyCost = active.reduce((a, s) => a + s.grossSalaryKurus + s.sgkPremiumKurus, 0);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("activeCount")} value={String(active.length)} />
        <Stat label={t("monthlyCost")} value={f.money(monthlyCost)} hint={t("monthlyCostHint")} />
        <Stat label={t("attendanceRecords")} value={String(data.attendance.length)} />
      </div>

      <Card className="mt-4">
        <CardHeader title={t("rosterTitle")} />
        <CardBody className="p-0">
          {data.rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 640 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("fullName")}</th>
                    <th scope="col" className={tc.th}>{t("role")}</th>
                    <th scope="col" className={tc.th}>{t("phone")}</th>
                    <th scope="col" className={tc.th}>{t("startedAt")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("gross")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("remainingLeave")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((s) => (
                    <tr key={s.id} className={tc.tr}>
                      <td className={`${tc.td} font-medium`}>
                        {s.fullName}{" "}
                        {!s.isActive ? <Badge tone="neutral">{t("left")}</Badge> : null}
                      </td>
                      <td className={tc.td}>{tEnum(`staffRole.${s.role}`)}</td>
                      <td className={`${tc.tdMuted} tabular-nums`}>
                        {s.phone ? maskPhone(s.phone) : "—"}
                      </td>
                      <td className={tc.tdMuted}>{f.date(s.startedAt)}</td>
                      <td className={tc.tdNum}>{f.money(s.grossSalaryKurus)}</td>
                      <td className={tc.tdNum}>
                        {t("leaveDays", { days: s.annualLeaveDays - s.usedLeaveDays })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
