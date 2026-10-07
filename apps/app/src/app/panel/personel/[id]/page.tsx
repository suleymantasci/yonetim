import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Ban, Banknote, CalendarCheck, HandCoins, Pencil, Scissors } from "lucide-react";

import { staffLedgerResponse } from "@yonetim/contracts";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DateInput,
  Input,
  MoneyInput,
  Select,
  Stat,
  tableClasses as tc,
  Textarea,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ActionDrawerButton } from "@/components/form/action-drawer-button";
import { FormField } from "@/components/form/action-form";
import Link from "@/components/link";
import { PrintButton } from "@/components/print-button";
import { apiGet } from "@/lib/api/server";
import { getBankAccountOptions } from "@/lib/bank-accounts";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { addStaffLedgerEntry, payStaff, voidStaffLedgerEntry } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Personel carisi — maaş borcu (siteye göre ödenmemiş maaş) ve avans
 * (personelin siteye borcu). Ödeme ve avans gider olarak kaydediliyor; kasa
 * dökümünde ve dairelere dağıtımda görünüyor.
 */
export default async function StaffLedgerPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("staff:payroll");
  const t = await getTranslations("app.staff");
  const tEnum = await getTranslations("enum");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const [data, banks] = await Promise.all([
    apiGet(`/v1/panel/staff/${id}/ledger`, staffLedgerResponse).catch(() => null),
    getBankAccountOptions(),
  ]);
  if (!data) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  const bankSelect = banks.length > 0 ? (
    <FormField name="bankAccountId" label={t("paidFrom")} hint={t("paidFromHint")}>
      <Select name="bankAccountId" defaultValue="">
        <option value="">{t("paidFromCash")}</option>
        {banks.map((b) => (
          <option key={b.id} value={b.id}>{b.label}</option>
        ))}
      </Select>
    </FormField>
  ) : null;

  return (
    <>
      <PageHeader
        title={data.staff.fullName}
        description={`${tEnum(`staffRole.${data.staff.role}` as never)} · ${t("netSalary")}: ${f.money(data.staff.netSalaryMinor)}`}
        breadcrumb={[{ label: t("title"), href: "/panel/personel" }, { label: data.staff.fullName }]}
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PrintButton label={t("printLedger")} />
            <Link
              href={`/panel/personel/${id}/duzenle`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
            >
              <Pencil aria-hidden className="h-4 w-4" />
              {tCommon("action.edit")}
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t("payable")} value={f.money(data.payableMinor)} tone={data.payableMinor > 0 ? "warning" : "neutral"} hint={t("payableHint")} />
        <Stat label={t("advanceBalance")} value={f.money(data.advanceMinor)} hint={t("advanceHint")} />
        <Stat label={t("netPosition")} value={f.money(data.payableMinor - data.advanceMinor)} hint={t("netPositionHint")} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <ActionDrawerButton
          action={payStaff}
          hidden={{ staffId: id, kind: "salary" }}
          icon={<Banknote />}
          tone="primary"
          label={t("paySalary")}
          title={t("paySalary")}
          description={t("paySalaryHint")}
          submitLabel={t("paySalary")}
        >
          <FormField name="amountKurus" label={t("amount")} required>
            {/* `key`: bakiye değişince alan yeniden kurulsun — MoneyInput ilk
                değeri state'te tutuyor ve mahsuptan sonra eski tutarı öneriyordu. */}
            <MoneyInput key={`pay-${data.payableMinor}`} name="amountKurus" defaultKurus={Math.max(data.payableMinor, 0)} required />
          </FormField>
          <FormField name="paidAt" label={t("paidAt")} required>
            <DateInput name="paidAt" defaultValue={today} required />
          </FormField>
          {bankSelect}
        </ActionDrawerButton>
        <ActionDrawerButton
          action={payStaff}
          hidden={{ staffId: id, kind: "advance" }}
          icon={<HandCoins />}
          label={t("giveAdvance")}
          title={t("giveAdvance")}
          description={t("giveAdvanceHint")}
          submitLabel={t("giveAdvance")}
        >
          <FormField name="amountKurus" label={t("amount")} required>
            <MoneyInput name="amountKurus" required />
          </FormField>
          <FormField name="paidAt" label={t("paidAt")} required>
            <DateInput name="paidAt" defaultValue={today} required />
          </FormField>
          {bankSelect}
        </ActionDrawerButton>
        <ActionDrawerButton
          action={addStaffLedgerEntry}
          hidden={{ staffId: id, kind: "accrual" }}
          icon={<CalendarCheck />}
          label={t("accrueOne")}
          title={t("accrueOne")}
          description={t("accrueOneHint")}
          submitLabel={t("accrueOne")}
        >
          <FormField name="period" label={t("accruePeriod")} required>
            <Input name="period" type="month" defaultValue={thisMonth} required />
          </FormField>
          <FormField name="amountKurus" label={t("amount")} required>
            <MoneyInput name="amountKurus" defaultKurus={data.staff.netSalaryMinor} required />
          </FormField>
          <FormField name="entryDate" label={t("accrueDate")} required>
            <DateInput name="entryDate" defaultValue={today} required />
          </FormField>
        </ActionDrawerButton>
        {data.advanceMinor > 0 ? (
          <ActionDrawerButton
            action={addStaffLedgerEntry}
            hidden={{ staffId: id, kind: "advance_deduction" }}
            icon={<Scissors />}
            label={t("deductAdvance")}
            title={t("deductAdvance")}
            description={t("deductAdvanceHint", { amount: f.money(data.advanceMinor) })}
            submitLabel={t("deductAdvance")}
          >
            <FormField name="amountKurus" label={t("amount")} required>
              <MoneyInput key={`ded-${data.advanceMinor}`} name="amountKurus" defaultKurus={data.advanceMinor} required />
            </FormField>
            <FormField name="entryDate" label={t("accrueDate")} required>
              <DateInput name="entryDate" defaultValue={today} required />
            </FormField>
          </ActionDrawerButton>
        ) : null}
      </div>

      <Card>
        <CardHeader title={t("ledgerTitle")} description={t("ledgerHint")} />
        <CardBody className="p-0">
          {data.lines.length === 0 ? (
            <p className="p-4 text-sm text-fg-muted">{t("ledgerEmpty")}</p>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 720 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("date")}</th>
                    <th scope="col" className={tc.th}>{t("lineDescription")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("payable")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("advanceBalance")}</th>
                    <th scope="col" className={`${tc.th} print:hidden`}>
                      <span className="sr-only">{tCommon("action.delete")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l, i) => (
                    <tr key={`${l.entryId ?? l.expenseId}-${i}`} className={`${tc.tr} ${l.voided ? "opacity-50" : ""}`}>
                      <td className={tc.tdMuted}>{f.date(l.date)}</td>
                      <td className={tc.td}>
                        <div className={l.voided ? "line-through" : ""}>
                          {l.expenseId ? (
                            <Link href={`/panel/giderler/${l.expenseId}`} className="hover:underline">
                              {l.description}
                            </Link>
                          ) : (
                            l.description
                          )}
                        </div>
                        <div className="text-xs text-fg-subtle">
                          <Badge tone={l.kind === "salary" || l.kind === "advance" ? "success" : "neutral"}>
                            {t(`kind_${l.kind}`)}
                          </Badge>
                          {l.voided ? ` ${t("voidedLine", { reason: l.voidReason ?? "" })}` : ""}
                        </div>
                      </td>
                      <td className={tc.tdNum}>
                        {l.payableDeltaMinor !== 0 ? <div className="text-xs text-fg-subtle">{signed(f.money, l.payableDeltaMinor)}</div> : null}
                        {f.money(l.payableMinor)}
                      </td>
                      <td className={tc.tdNum}>
                        {l.advanceDeltaMinor !== 0 ? <div className="text-xs text-fg-subtle">{signed(f.money, l.advanceDeltaMinor)}</div> : null}
                        {f.money(l.advanceMinor)}
                      </td>
                      <td className={`${tc.td} text-right print:hidden`}>
                        {l.entryId && !l.voided ? (
                          <ActionDrawerButton
                            action={voidStaffLedgerEntry}
                            hidden={{ staffId: id, entryId: l.entryId }}
                            icon={<Ban />}
                            tone="danger"
                            label={t("voidAction")}
                            title={t("voidTitle")}
                            description={l.description}
                            warning={t("voidWarning")}
                            submitLabel={t("voidAction")}
                          >
                            <FormField name="reason" label={t("voidReason")} required>
                              <Textarea name="reason" rows={2} minLength={10} maxLength={500} required />
                            </FormField>
                          </ActionDrawerButton>
                        ) : null}
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

function signed(money: (n: number) => string, value: number): string {
  return value > 0 ? `+${money(value)}` : `−${money(-value)}`;
}
