import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";

import { hasPermission } from "@yonetim/auth/guard";
import { vendorListResponse } from "@yonetim/contracts";
import { Alert, Card, CardBody, EmptyState, Stat } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ActionDrawerButton } from "@/components/form/action-drawer-button";
import Link from "@/components/link";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { saveVendor } from "./actions";
import { VendorFields } from "./vendor-fields";

export const dynamic = "force-dynamic";

/**
 * Tedarikçiler — kart + cari bakiye. Bakiye giderlerden türetiliyor: onaylı
 * ya da ödenmiş gider tahakkuk, ödeme tarihi dolu gider ödeme sayılıyor.
 */
export default async function VendorsPage() {
  const ctx = await requirePermission("vendor:read");
  const t = await getTranslations("app.vendors");
  const tCommon = await getTranslations("common");
  const f = await formatters();
  const { rows, totals } = await apiGet("/v1/panel/vendors", vendorListResponse);
  const canWrite = hasPermission(ctx.roles, "vendor:write");

  const newButton = canWrite ? (
    <ActionDrawerButton
      action={saveVendor}
      hidden={{}}
      icon={<Plus />}
      tone="primary"
      label={t("newVendor")}
      title={t("newVendor")}
      description={t("newVendorHint")}
      submitLabel={tCommon("action.create")}
    >
      <VendorFields />
    </ActionDrawerButton>
  ) : null;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} action={newButton} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t("vendorCount")} value={String(totals.vendors)} />
        <Stat
          label={t("totalBalance")}
          value={f.money(totals.balanceMinor)}
          tone={totals.balanceMinor > 0 ? "warning" : "neutral"}
        />
        <Stat label={t("unlinkedExpenses")} value={String(totals.unlinkedExpenses)} />
      </div>

      {totals.unlinkedExpenses > 0 ? (
        <div className="mb-4">
          <Alert tone="info">{t("unlinkedHint", { count: totals.unlinkedExpenses })}</Alert>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={newButton ?? undefined}
        />
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {rows.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/panel/tedarikciler/${v.id}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-hover"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-fg [overflow-wrap:anywhere]">
                        {v.name}
                        {!v.isActive ? (
                          <span className="ml-2 text-xs font-normal text-fg-subtle">{t("inactive")}</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-fg-subtle">
                        {v.category}
                        {v.taxNumber ? ` · ${t("taxNumberShort")} ${v.taxNumber}` : ""}
                        {` · ${t("expenseCount", { count: v.expenseCount })}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-sm font-semibold tabular-nums ${v.balanceMinor > 0 ? "text-warning-fg" : "text-fg"}`}
                      >
                        {f.money(v.balanceMinor)}
                      </div>
                      <div className="text-xs text-fg-subtle">{t("balanceLabel")}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
