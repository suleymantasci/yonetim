import { Pencil, Plus } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
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
import { SeveranceCalculator } from "./severance-calculator";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const ctx = await requirePermission("staff:read");
  const t = await getTranslations("app.staff");
  const tEnum = await getTranslations("enum");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  // Şifreli TCKN/IBAN bu sınırı geçmiyor; uç yalnız "kayıtlı mı" diyor (§9.1).
  const { rows, attendance, totals } = await apiGet(
    "/v1/panel/staff",
    staffListResponse,
  );
  const monthlyCost = totals.monthlyGrossMinor + totals.monthlySgkMinor;

  // Yetkisiz kullanıcıya düğme hiç render edilmiyor; bağlayıcı kontrol
  // uçta (`staff:write`), buradaki yalnız gereksiz tıklamayı önlüyor.
  const canWrite = hasPermission(ctx.roles, "staff:write");
  const newStaffButton = canWrite ? (
    <Link
      href="/panel/personel/yeni"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
    >
      <Plus aria-hidden className="h-4 w-4" />
      {t("newStaff")}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={newStaffButton}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
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
                action={newStaffButton}
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
                    {canWrite ? (
                      <th scope="col" className={`${tc.th} w-10`}>
                        <span className="sr-only">{tCommon("action.edit")}</span>
                      </th>
                    ) : null}
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
                      {canWrite ? (
                        <td className={tc.td}>
                          <Link
                            href={`/panel/personel/${s.id}/duzenle`}
                            aria-label={tCommon("action.edit")}
                            className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg"
                          >
                            <Pencil aria-hidden className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/*
        Hesaplayıcı yalnız **aktif** personel için: ayrılmış birinin tazminatı
        zaten ödenmiş olmalı ve listede tutmak "kime hesaplıyorum" sorusunu
        bulanıklaştırırdı. Hesap `staff:payroll` yetkisi istiyor; yetkisiz
        kullanıcıda uç 403 dönüyor (ekran sunucuda ayrıca filtrelenmiyor
        çünkü bağlayıcı karar API'de — §9.1).
      */}
      <SeveranceCalculator
        staff={rows
          .filter((s) => s.isActive)
          .map((s) => ({
            id: s.id,
            name: s.fullName,
            grossKurus: s.grossSalaryMinor,
          }))}
      />
    </>
  );
}
