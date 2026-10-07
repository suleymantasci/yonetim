import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { openingResponse } from "@yonetim/contracts";
import { Alert, Badge, Card, CardBody, DateInput, FormSection, MoneyInput } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ActionForm, FormField } from "@/components/form/action-form";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { saveOpening } from "../actions";
import { AccountingSubnav } from "../subnav";

export const dynamic = "force-dynamic";

/**
 * Açılış fişi — sisteme geçiş tarihindeki bakiyeler. Kaydetmek fişin
 * tamamını verilen değerlere eşitler (iki kez kaydetmek ikinci açılış
 * yaratmaz). Sakin devir borcu gerçek borç olarak açılır; tahsilat almış
 * devir borcu kilitlidir.
 */
export default async function OpeningPage() {
  const ctx = await requirePermission("report:read");
  const t = await getTranslations("app.accounting");
  const tCommon = await getTranslations("common");
  const f = await formatters();
  const data = await apiGet("/v1/panel/reports/accounting/opening", openingResponse);
  const canWrite = hasPermission(ctx.roles, "settings:write");

  const row = (key: string, label: string, name: string, kurus: number, hint?: string, locked = false) => (
    <div key={key} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[1fr_12rem] sm:gap-3">
      <div className="min-w-0 text-sm text-fg [overflow-wrap:anywhere]">
        {label}
        {locked ? <Badge tone="neutral" className="ml-2">{t("openingLocked")}</Badge> : null}
        {hint ? <div className="text-xs text-fg-subtle">{hint}</div> : null}
      </div>
      {locked || !canWrite ? (
        <div className="text-right text-sm tabular-nums">{f.money(kurus)}</div>
      ) : (
        <MoneyInput name={name} defaultKurus={kurus} />
      )}
    </div>
  );

  const body = (
    <>
      <FormSection title={t("openingDateSection")} description={t("openingDateHint")}>
        <FormField name="asOf" label={t("openingDate")} required>
          <DateInput name="asOf" defaultValue={data.asOf ?? new Date().toISOString().slice(0, 10)} required disabled={!canWrite} />
        </FormField>
      </FormSection>

      <FormSection title={t("openingCashSection")} description={t("openingCashHint")} columns={1}>
        <div className="space-y-2">
          {row("cash", t("openingCash"), "cash", data.cashMinor)}
          {data.banks.map((b) => row(b.bankAccountId, b.label, `bank:${b.bankAccountId}`, b.amountMinor))}
        </div>
      </FormSection>

      {data.vendors.length > 0 ? (
        <FormSection title={t("openingVendorSection")} description={t("openingVendorHint")} columns={1}>
          <div className="space-y-2">
            {data.vendors.map((v) => row(v.vendorId, v.name, `vendor:${v.vendorId}`, v.amountMinor))}
          </div>
        </FormSection>
      ) : null}

      {data.staff.length > 0 ? (
        <FormSection title={t("openingStaffSection")} description={t("openingStaffHint")} columns={1}>
          <div className="space-y-3">
            {data.staff.map((s) => (
              <div key={s.staffId} className="space-y-1 rounded-lg border border-border p-2">
                <div className="text-sm font-medium text-fg">{s.name}</div>
                {row(`${s.staffId}-p`, t("openingStaffPayable"), `staffPayable:${s.staffId}`, s.payableMinor)}
                {row(`${s.staffId}-a`, t("openingStaffAdvance"), `staffAdvance:${s.staffId}`, s.advanceMinor)}
              </div>
            ))}
          </div>
        </FormSection>
      ) : null}

      <FormSection title={t("openingUnitSection")} description={t("openingUnitHint")} columns={1}>
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            {t("openingUnitToggle", {
              count: data.units.length,
              total: f.money(data.units.reduce((s, u) => s + u.amountMinor, 0)),
            })}
          </summary>
          <div className="mt-2 space-y-2">
            {data.units.map((u) => row(u.unitId, u.label, `unit:${u.unitId}`, u.amountMinor, undefined, u.locked))}
          </div>
        </details>
      </FormSection>

      <div className="mt-2 rounded-lg bg-surface-sunken p-3 text-sm">
        <span className="text-fg-muted">{t("openingEquity")}: </span>
        <span className="font-semibold tabular-nums">{f.money(data.equityMinor)}</span>
        <div className="text-xs text-fg-subtle">{t("openingEquityHint")}</div>
      </div>
    </>
  );

  return (
    <>
      <PageHeader title={t("openingTitle")} description={t("openingDescription")} />
      <AccountingSubnav active="opening" />
      {!data.asOf ? (
        <div className="mb-4">
          <Alert tone="info">{t("openingEmpty")}</Alert>
        </div>
      ) : null}
      <Card className="max-w-3xl">
        <CardBody>
          {canWrite ? (
            <ActionForm action={saveOpening} submitLabel={tCommon("action.save")}>
              {body}
            </ActionForm>
          ) : (
            body
          )}
        </CardBody>
      </Card>
    </>
  );
}
