import { getTranslations } from "next-intl/server";

import { staffListResponse } from "@yonetim/contracts";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Stat,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  await requirePermission("staff:read");
  const t = await getTranslations("app.staff");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  // Şifreli TCKN/IBAN bu sınırı geçmiyor; uç yalnız "kayıtlı mı" diyor (§9.1).
  const { rows, attendance, totals } = await apiGet(
    "/v1/panel/staff",
    staffListResponse,
  );
  const monthlyCost = totals.monthlyGrossMinor + totals.monthlySgkMinor;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("activeCount")} value={String(totals.active)} />
        <Stat
          label={t("monthlyCost")}
          value={f.money(monthlyCost)}
          hint={t("monthlyCostHint")}
        />
        <Stat
          label={t("attendanceRecords")}
          value={String(attendance.length)}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title={t("rosterTitle")} />
        <CardBody className="p-0">
          {rows.length === 0 ? (
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
                    <th scope="col" className={tc.th}>
                      {t("fullName")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("role")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("phone")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("startedAt")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("gross")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("remainingLeave")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className={tc.tr}>
                      <td className={`${tc.td} font-medium`}>
                        {s.fullName}{" "}
                        {!s.isActive ? (
                          <Badge tone="neutral">{t("left")}</Badge>
                        ) : null}
                      </td>
                      <td className={tc.td}>{tEnum(`staffRole.${s.role}`)}</td>
                      <td className={`${tc.tdMuted} tabular-nums`}>
                        {/* Maskeleme sunucuda; ham numara panele hiç gelmiyor. */}
                        {s.phoneMasked ?? "—"}
                      </td>
                      <td className={tc.tdMuted}>{f.date(s.startedAt)}</td>
                      <td className={tc.tdNum}>
                        {f.money(s.grossSalaryMinor)}
                      </td>
                      <td className={tc.tdNum}>
                        {t("leaveDays", {
                          days: s.annualLeaveDays - s.usedLeaveDays,
                        })}
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
