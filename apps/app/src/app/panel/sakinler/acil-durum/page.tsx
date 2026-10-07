import { ArrowLeft } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { emergencyReport } from "@yonetim/contracts";
import {
  Alert,
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

export const dynamic = "force-dynamic";

/**
 * Acil durum listesi — GAP 4.1.2 / rakip incelemesi §4.1.
 *
 * NEDEN AYRI SAYFA, SEKME DEĞİL: bu ekran kan grubu (KVKK md.6 özel nitelikli
 * sağlık verisi) ve **maskesiz** acil durum telefonu gösteriyor. Sakin
 * listesinin bir sekmesi olsaydı, sıradan bir liste gezintisi de sağlık
 * verisi erişim kaydı bırakırdı ve "kim sağlık verisine baktı" sorusu
 * cevapsız kalırdı. Ayrı sayfa = ayrı uç = ayrı kütük satırı.
 *
 * KVKK erişim kaydını `apps/api` yazıyor (§8.4), burada ikinci bir kayıt yok.
 *
 * YAZDIRILABİLİR: yangın tüpü dolabına asılacak liste bu ekrandan çıkıyor;
 * `print:` sınıfları gereksiz kabuğu baskıdan düşürüyor.
 */
export default async function EmergencyContactsPage() {
  await requirePermission("resident:read");
  const t = await getTranslations("app.residents");
  const tCommon = await getTranslations("common");

  const data = await apiGet(
    "/v1/panel/residents/emergency",
    emergencyReport,
  );

  return (
    <>
      <PageHeader
        title={t("emergencyTitle")}
        description={t("emergencyDescription")}
        action={
          <Link
            href="/panel/sakinler"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover print:hidden"
          >
            <ArrowLeft aria-hidden className="h-4 w-4" />
            {t("backToList")}
          </Link>
        }
      />

      <div className="mb-4 print:hidden">
        <Alert tone="warning">{t("emergencyPrivacyNotice")}</Alert>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("statPeople")} value={String(data.totals.residents)} />
        <Stat
          label={t("statWithBloodType")}
          value={String(data.totals.withBloodType)}
        />
        <Stat
          label={t("statWithEmergencyContact")}
          value={String(data.totals.withEmergencyContact)}
        />
        {/*
          Eksik kayıt sayısı bir **iş listesi göstergesi**: rapor bu sayıyı
          sıfıra indirmek için var. Sıfırsa olumlu tonda gösteriliyor ki
          "yapacak iş yok" tek bakışta okunsun.
        */}
        <Stat
          label={t("statMissingBoth")}
          value={String(data.totals.missingBoth)}
          tone={data.totals.missingBoth > 0 ? "warning" : "success"}
          hint={t("statMissingBothHint")}
        />
      </div>

      <Card>
        <CardHeader
          title={t("emergencyTableTitle")}
          description={t("emergencyTableHint")}
        />
        <CardBody className="p-0">
          {data.rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 780 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>
                      {t("fullName")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("units")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("phone")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("bloodType")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("emergencyName")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("emergencyPhone")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.userId} className={tc.tr}>
                      <td className={`${tc.td} font-medium`}>
                        <Link
                          href={`/panel/sakinler/${row.userId}`}
                          className="hover:underline"
                        >
                          {row.fullName}
                        </Link>
                      </td>
                      <td className={tc.tdMuted}>
                        {row.units.length > 0 ? row.units.join(", ") : "—"}
                      </td>
                      <td className={`${tc.tdMuted} tabular-nums`}>
                        {row.phone ?? "—"}
                      </td>
                      <td className={tc.td}>
                        {row.bloodType ? (
                          // Rozet renk değil **metin** taşıyor: kan grubu
                          // renkle kodlanamaz, yanlış okunması ölümcül.
                          <Badge tone="danger">{row.bloodType}</Badge>
                        ) : (
                          <span className="text-fg-subtle">
                            {tCommon("state.empty")}
                          </span>
                        )}
                      </td>
                      <td className={tc.td}>{row.emergencyContactName ?? "—"}</td>
                      <td className={`${tc.td} tabular-nums`}>
                        {row.emergencyContactPhone ?? "—"}
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
