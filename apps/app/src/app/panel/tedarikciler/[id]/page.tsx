import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link2, Pencil, Trash2 } from "lucide-react";

import { hasPermission } from "@yonetim/auth/guard";
import { vendorDetail } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader, Stat, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ActionDrawerButton } from "@/components/form/action-drawer-button";
import Link from "@/components/link";
import { PrintButton } from "@/components/print-button";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { linkVendorExpenses, removeVendor, saveVendor } from "../actions";
import { VendorFields } from "../vendor-fields";

export const dynamic = "force-dynamic";

/** Tedarikçi kartı + cari ekstresi (muavin). Yazdırılabilir. */
export default async function VendorDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("vendor:read");
  const t = await getTranslations("app.vendors");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const detail = await apiGet(`/v1/panel/vendors/${id}`, vendorDetail).catch(() => null);
  if (!detail) notFound();
  const { vendor: v, ledger } = detail;
  const canWrite = hasPermission(ctx.roles, "vendor:write");

  return (
    <>
      <PageHeader
        title={v.name}
        description={[v.category, v.taxNumber ? `${t("taxNumberShort")} ${v.taxNumber}` : null, v.taxOffice]
          .filter(Boolean)
          .join(" · ")}
        breadcrumb={[{ label: t("title"), href: "/panel/tedarikciler" }, { label: v.name }]}
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PrintButton label={t("printLedger")} />
            {canWrite ? (
              <>
                <ActionDrawerButton
                  action={saveVendor}
                  hidden={{ id: v.id }}
                  icon={<Pencil />}
                  label={tCommon("action.edit")}
                  title={t("editVendor")}
                  submitLabel={tCommon("action.save")}
                >
                  <VendorFields defaults={v} />
                </ActionDrawerButton>
                <ActionDrawerButton
                  action={linkVendorExpenses}
                  hidden={{ id: v.id }}
                  icon={<Link2 />}
                  label={t("linkExpenses")}
                  title={t("linkExpenses")}
                  description={t("linkExpensesHint", { name: v.name })}
                  submitLabel={t("linkExpenses")}
                />
                <ActionDrawerButton
                  action={removeVendor}
                  hidden={{ id: v.id }}
                  icon={<Trash2 />}
                  tone="danger"
                  label={tCommon("action.delete")}
                  title={t("deleteTitle")}
                  warning={t("deleteWarning")}
                  submitLabel={tCommon("action.delete")}
                />
              </>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t("totalInvoiced")} value={f.money(v.totalMinor)} />
        <Stat label={t("totalPaid")} value={f.money(v.paidMinor)} />
        <Stat label={t("balanceLabel")} value={f.money(v.balanceMinor)} tone={v.balanceMinor > 0 ? "warning" : "success"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("ledgerTitle")} description={t("ledgerHint")} />
          <CardBody className="p-0">
            {ledger.length === 0 ? (
              <p className="p-4 text-sm text-fg-muted">{t("ledgerEmpty")}</p>
            ) : (
              <div className={tc.wrapper}>
                <table className={tc.table} style={{ minWidth: 560 }}>
                  <thead className={tc.thead}>
                    <tr>
                      <th scope="col" className={tc.th}>{t("date")}</th>
                      <th scope="col" className={tc.th}>{t("lineDescription")}</th>
                      <th scope="col" className={`${tc.th} text-right`}>{t("credit")}</th>
                      <th scope="col" className={`${tc.th} text-right`}>{t("debit")}</th>
                      <th scope="col" className={`${tc.th} text-right`}>{t("balanceLabel")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((line, index) => (
                      <tr key={`${line.expenseId}-${line.kind}-${index}`} className={tc.tr}>
                        <td className={tc.tdMuted}>{f.date(line.date)}</td>
                        <td className={tc.td}>
                          {line.expenseId ? (
                            <Link href={`/panel/giderler/${line.expenseId}`} className="hover:underline">
                              {line.description}
                            </Link>
                          ) : (
                            line.description
                          )}
                          <div className="text-xs text-fg-subtle">
                            <Badge tone={line.kind === "payment" ? "success" : "neutral"}>
                              {t(`kind_${line.kind}`)}
                            </Badge>
                            {line.invoiceNo ? ` ${t("invoiceNoShort")} ${line.invoiceNo}` : ""}
                          </div>
                        </td>
                        <td className={tc.tdNum}>{line.creditMinor ? f.money(line.creditMinor) : ""}</td>
                        <td className={tc.tdNum}>{line.debitMinor ? f.money(line.debitMinor) : ""}</td>
                        <td className={tc.tdNum}>{f.money(line.balanceMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("cardTitle")} />
          <CardBody>
            <dl className="space-y-2 text-sm">
              {(
                [
                  ["contactName", v.contactName],
                  ["phone", v.phone],
                  ["email", v.email],
                  ["iban", v.iban],
                  ["address", v.address],
                  ["notes", v.notes],
                ] as const
              ).map(([key, value]) =>
                value ? (
                  <div key={key}>
                    <dt className="text-xs text-fg-subtle">{t(key)}</dt>
                    <dd className="whitespace-pre-line text-fg [overflow-wrap:anywhere]">{value}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
