import { Building2, Mail, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { portalManagement } from "@yonetim/contracts";
import { Alert, Card, CardBody, CardHeader, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";

/**
 * "Yönetim bilgileri" — sakinin kime, nasıl ulaşacağı.
 *
 * KMK md.34 gereği yöneticinin kimliği kat maliklerine açık; iletişim bilgisi
 * de pratikte zorunlu, bu yüzden maskelenmiyor. IBAN ise maskeli: kod
 * tabanında IBAN yöneticinin kendi banka ekranında bile maskeli, sakine açıp
 * yöneticiye kapatmak tutarlı bir çizgi değil (bkz. PROJE-DURUMU §6).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.managementInfo");
  return { title: t("title") };
}

export default async function ManagementInfoPage() {
  await requirePermission("tenant:read");
  const t = await getTranslations("app.managementInfo");
  const tEnum = await getTranslations("enum");

  const data = await apiGet("/v1/panel/portal/management", portalManagement);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("propertyTitle")} />
          <CardBody className="space-y-3 text-sm">
            <Row
              icon={<Building2 aria-hidden className="h-4 w-4" />}
              label={t("propertyName")}
              value={data.tenantName}
            />
            <Row label={t("propertyType")} value={tEnum(`tenantType.${data.tenantType}`)} />
            {data.address ? <Row label={t("address")} value={data.address} /> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("managerTitle")} />
          <CardBody className="space-y-3 text-sm">
            {data.managerName ? (
              <>
                <Row label={t("managerName")} value={data.managerName} />
                {data.managerPhone ? (
                  <Row
                    icon={<Phone aria-hidden className="h-4 w-4" />}
                    label={t("phone")}
                    value={data.managerPhone}
                    href={`tel:${data.managerPhone}`}
                  />
                ) : null}
                {data.managerEmail ? (
                  <Row
                    icon={<Mail aria-hidden className="h-4 w-4" />}
                    label={t("email")}
                    value={data.managerEmail}
                    href={`mailto:${data.managerEmail}`}
                  />
                ) : null}
              </>
            ) : (
              <p className="text-fg-subtle">{t("noManager")}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("bankTitle")} description={t("bankDescription")} />
          <CardBody className="p-0">
            {data.bankAccounts.length === 0 ? (
              <p className="p-4 text-sm text-fg-subtle">{t("noBankAccount")}</p>
            ) : (
              <>
                <div className={tc.wrapper}>
                  <table className={tc.table}>
                    <thead className={tc.thead}>
                      <tr>
                        <th className={tc.th}>{t("col.account")}</th>
                        <th className={tc.th}>{t("col.iban")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bankAccounts.map((a) => (
                        <tr key={a.id} className={tc.tr}>
                          <td className={tc.td}>
                            {a.label}
                            {a.bankName && a.bankName !== a.label ? (
                              <span className="ml-2 text-xs text-fg-subtle">{a.bankName}</span>
                            ) : null}
                          </td>
                          <td className={`${tc.td} font-mono tabular-nums`}>{a.ibanMasked}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 pt-3">
                  <Alert tone="info">{t("ibanMaskedHint")}</Alert>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("staffTitle")} />
          <CardBody className="p-0">
            {data.staff.length === 0 ? (
              <p className="p-4 text-sm text-fg-subtle">{t("noStaff")}</p>
            ) : (
              <div className={tc.wrapper}>
                <table className={tc.table}>
                  <thead className={tc.thead}>
                    <tr>
                      <th className={tc.th}>{t("col.name")}</th>
                      <th className={tc.th}>{t("col.role")}</th>
                      <th className={tc.th}>{t("phone")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.staff.map((s) => (
                      <tr key={s.id} className={tc.tr}>
                        <td className={tc.td}>{s.name}</td>
                        <td className={tc.tdMuted}>{tEnum(`staffRole.${s.role}`)}</td>
                        <td className={tc.tdMuted}>
                          {s.phone ? (
                            <a href={`tel:${s.phone}`} className="text-primary hover:underline">
                              {s.phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Row({
  icon,
  label,
  value,
  href,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-fg-subtle">
        {icon}
        {label}
      </dt>
      <dd className="text-right font-medium text-fg">
        {href ? (
          <a href={href} className="text-primary hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
