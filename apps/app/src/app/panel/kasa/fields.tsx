import { getTranslations } from "next-intl/server";

import { INCOME_CATEGORIES } from "@yonetim/contracts";
import { DateInput, Input, MoneyInput, Select, Textarea } from "@yonetim/ui";

import { FormField } from "@/components/form/action-form";

export interface BankOption {
  id: string;
  label: string;
}

const today = () =>
  new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

/** Tek seçim: "cash" ya da "bank:<id>" (bkz. `actions.ts`). */
async function AccountSelect({
  name,
  banks,
  defaultValue,
}: {
  name: string;
  banks: BankOption[];
  defaultValue?: string;
}) {
  const t = await getTranslations("app.cash");
  return (
    <Select name={name} defaultValue={defaultValue ?? "cash"} required>
      <option value="cash">{t("cashAccount")}</option>
      {banks.map((b) => (
        <option key={b.id} value={`bank:${b.id}`}>
          {b.label}
        </option>
      ))}
    </Select>
  );
}

export async function TransferFields({ banks }: { banks: BankOption[] }) {
  const t = await getTranslations("app.cash");
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField name="from" label={t("from")} required>
          <AccountSelect name="from" banks={banks} defaultValue="cash" />
        </FormField>
        <FormField name="to" label={t("to")} required>
          <AccountSelect
            name="to"
            banks={banks}
            defaultValue={banks[0] ? `bank:${banks[0].id}` : "cash"}
          />
        </FormField>
        <FormField name="date" label={t("date")} required>
          <DateInput
            name="date"
            defaultValue={today()}
            max={today()}
            required
          />
        </FormField>
        <FormField name="amountMinor" label={t("amount")} required>
          <MoneyInput name="amountMinor" required />
        </FormField>
      </div>
      <FormField
        name="documentNo"
        label={t("documentNo")}
        hint={t("documentNoHint")}
      >
        <Input name="documentNo" maxLength={60} />
      </FormField>
      <FormField name="description" label={t("descriptionField")}>
        <Textarea name="description" rows={2} maxLength={500} />
      </FormField>
    </>
  );
}

export async function IncomeFields({ banks }: { banks: BankOption[] }) {
  const t = await getTranslations("app.cash");
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField name="category" label={t("category")} required>
          <Select name="category" defaultValue="rent" required>
            {INCOME_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`incomeCategory.${c}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField name="to" label={t("toAccount")} required>
          <AccountSelect name="to" banks={banks} />
        </FormField>
        <FormField name="date" label={t("date")} required>
          <DateInput
            name="date"
            defaultValue={today()}
            max={today()}
            required
          />
        </FormField>
        <FormField name="amountMinor" label={t("amount")} required>
          <MoneyInput name="amountMinor" required />
        </FormField>
      </div>
      <FormField
        name="payerName"
        label={t("payerName")}
        hint={t("payerNameHint")}
        required
      >
        <Input name="payerName" minLength={2} maxLength={160} required />
      </FormField>
      <FormField
        name="documentNo"
        label={t("documentNo")}
        hint={t("documentNoHint")}
      >
        <Input name="documentNo" maxLength={60} />
      </FormField>
      <FormField name="description" label={t("descriptionField")}>
        <Textarea name="description" rows={2} maxLength={500} />
      </FormField>
    </>
  );
}

export async function HandoverFields({
  defaultFrom,
}: {
  defaultFrom?: string;
}) {
  const t = await getTranslations("app.cash");
  return (
    <>
      <FormField
        name="date"
        label={t("handoverDate")}
        hint={t("handoverDateHint")}
        required
      >
        <DateInput name="date" defaultValue={today()} max={today()} required />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField name="fromName" label={t("handoverFrom")} required>
          <Input
            name="fromName"
            defaultValue={defaultFrom}
            minLength={2}
            maxLength={160}
            required
          />
        </FormField>
        <FormField name="toName" label={t("handoverTo")} required>
          <Input name="toName" minLength={2} maxLength={160} required />
        </FormField>
      </div>
      <FormField name="note" label={t("handoverNote")}>
        <Textarea name="note" rows={3} maxLength={2000} />
      </FormField>
    </>
  );
}

export async function VoidFields() {
  const t = await getTranslations("app.cash");
  return (
    <FormField
      name="reason"
      label={t("voidReason")}
      hint={t("voidReasonHint")}
      required
    >
      <Textarea name="reason" rows={2} minLength={5} maxLength={500} required />
    </FormField>
  );
}
