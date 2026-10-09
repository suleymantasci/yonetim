"use client";

import { Pencil, Wallet } from "lucide-react";
import { useState } from "react";

import {
  Alert,
  CheckboxGroup,
  DateInput,
  Drawer,
  Input,
  MoneyInput,
  Select,
  Switch,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { adjustDebt, collectPayment } from "../actions";

/**
 * Borç düzeltme ve tahsilat panelleri.
 *
 * DÜZELTME: gerekçe alanı zorunlu ve en az 10 karakter. Alanın hemen altında
 * "bu metin sakine gösterilecek" uyarısı var — yönetici ne yazdığının nereye
 * gittiğini bilmeli. Sunucu tarafı bu gerekçeyi `app.change_reason` ile
 * timeline trigger'ına taşır; gerekçesiz düzeltme yolu yok (SPEC 3.2).
 *
 * TAHSİLAT: hangi borçlara öncelik verileceği seçilebilir; boş bırakılırsa
 * en eski vade önce kapanır. Borcu aşan tutar avans olarak bildirilir.
 */
export function DebtActionPanels({
  collectDefaults,
  debtId,
  debtorUserId,
  closed = false,
  unitId,
  currentAmountKurus,
  currentDueDate,
  lateFeeExempt,
  paidKurus,
  openDebts,
  residents,
  bankAccounts,
  labels,
}: {
  debtId: string;
  debtorUserId?: string | null;
  closed?: boolean;
  unitId: string;
  currentAmountKurus: number;
  currentDueDate: string;
  lateFeeExempt: boolean;
  paidKurus: number;
  openDebts: { id: string; label: string; remaining: string }[];
  residents: { id: string; label: string }[];
  /** Aktif banka hesapları — nakit dışı tahsilatta paranın girdiği hesap. */
  bankAccounts: { id: string; label: string }[];
  /** Site ayarındaki varsayılan ödeme şekli ve hesap. */
  collectDefaults?: { method: string; bankAccountId: string | null };
  labels: {
    adjust: string;
    adjustTitle: string;
    adjustHint: string;
    amount: string;
    dueDate: string;
    reason: string;
    reasonHint: string;
    reasonWarning: string;
    visibleToResident: string;
    visibleHint: string;
    lateFeeExempt: string;
    lateFeeExemptHint: string;
    paidWarning: string;
    collect: string;
    collectTitle: string;
    collectHint: string;
    collectAmount: string;
    method: string;
    methodCash: string;
    methodTransfer: string;
    methodCard: string;
    methodOffset: string;
    paidAt: string;
    bankAccount: string;
    bankAccountHint: string;
    bankAccountNone: string;
    noBankAccounts: string;
    payer: string;
    payerHint: string;
    receiptNo: string;
    targetDebts: string;
    targetDebtsHint: string;
    note: string;
    save: string;
    cancel: string;
  };
}) {
  const [adjusting, setAdjusting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  // Ödeme yöntemi banka hesabı alanının görünürlüğünü belirliyor.
  const [method, setMethod] = useState(collectDefaults?.method ?? "bank_transfer");

  if (closed) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAdjusting(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
      >
        <Pencil aria-hidden className="h-4 w-4" />
        {labels.adjust}
      </button>
      <button
        type="button"
        onClick={() => setCollecting(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
      >
        <Wallet aria-hidden className="h-4 w-4" />
        {labels.collect}
      </button>

      <Drawer
        open={adjusting}
        onClose={() => setAdjusting(false)}
        title={labels.adjustTitle}
        description={labels.adjustHint}
        closeLabel={labels.cancel}
        padded={false}
      >
        <ActionForm
          action={adjustDebt}
          submitLabel={labels.save}
          onSuccess={() => setAdjusting(false)}
          layout="modal"
          onCancel={() => setAdjusting(false)}
        >
          <input type="hidden" name="id" value={debtId} />

          <div className="space-y-4">
            {paidKurus > 0 ? (
              <Alert tone="warning">{labels.paidWarning}</Alert>
            ) : null}

            <FormField name="amountKurus" label={labels.amount} required>
              <MoneyInput
                name="amountKurus"
                defaultKurus={currentAmountKurus}
                required
              />
            </FormField>

            <FormField name="dueDate" label={labels.dueDate} required>
              <DateInput
                name="dueDate"
                defaultValue={currentDueDate}
                required
              />
            </FormField>

            <FormField
              name="reason"
              label={labels.reason}
              hint={labels.reasonHint}
              required
            >
              <Textarea
                name="reason"
                rows={3}
                minLength={10}
                maxLength={500}
                required
              />
            </FormField>

            <Alert tone="info">{labels.reasonWarning}</Alert>

            <Switch
              name="visibleToResident"
              label={labels.visibleToResident}
              description={labels.visibleHint}
              defaultChecked
            />
            <Switch
              name="lateFeeExempt"
              label={labels.lateFeeExempt}
              description={labels.lateFeeExemptHint}
              defaultChecked={lateFeeExempt}
            />
          </div>
        </ActionForm>
      </Drawer>

      <Drawer
        open={collecting}
        onClose={() => setCollecting(false)}
        title={labels.collectTitle}
        description={labels.collectHint}
        closeLabel={labels.cancel}
        size="lg"
        padded={false}
      >
        <ActionForm
          action={collectPayment}
          submitLabel={labels.collect}
          onSuccess={() => setCollecting(false)}
          layout="modal"
          onCancel={() => setCollecting(false)}
        >
          <input type="hidden" name="unitId" value={unitId} />
          {debtorUserId ? <input type="hidden" name="debtorUserId" value={debtorUserId} /> : null}

          <div className="space-y-4">
            <FormField name="amountKurus" label={labels.collectAmount} required>
              <MoneyInput name="amountKurus" required />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField name="method" label={labels.method} required>
                <Select
                  name="method"
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  required
                >
                  <option value="bank_transfer">{labels.methodTransfer}</option>
                  <option value="cash">{labels.methodCash}</option>
                  <option value="card">{labels.methodCard}</option>
                  <option value="offset">{labels.methodOffset}</option>
                </Select>
              </FormField>
              <FormField name="paidAt" label={labels.paidAt} required>
                <DateInput name="paidAt" defaultValue={today()} required />
              </FormField>
            </div>

            {/*
              BANKA HESABI YALNIZ NAKİT DIŞINDA SORULUYOR.

              Nakit tahsilatın banka hesabı yok; sormak, kasaya giren para
              için uydurma bir hesap seçtirmek olurdu ve o kayıt hiçbir
              ekstrede görünmeyeceği için mutabakatta kalıcı bir fark
              bırakırdı. Sunucu da `cash` yönteminde hesabı yok sayıyor.
            */}
            {method !== "cash" && bankAccounts.length > 0 ? (
              <FormField
                name="bankAccountId"
                label={labels.bankAccount}
                hint={labels.bankAccountHint}
              >
                <Select name="bankAccountId" defaultValue={collectDefaults?.bankAccountId ?? ""}>
                  <option value="">{labels.bankAccountNone}</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}

            {method !== "cash" && bankAccounts.length === 0 ? (
              <Alert tone="info">{labels.noBankAccounts}</Alert>
            ) : null}

            <FormField
              name="payerUserId"
              label={labels.payer}
              hint={labels.payerHint}
            >
              <Select name="payerUserId" defaultValue="">
                <option value="">—</option>
                {residents.map((resident) => (
                  <option key={resident.id} value={resident.id}>
                    {resident.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField name="receiptNo" label={labels.receiptNo}>
              <Input name="receiptNo" maxLength={30} />
            </FormField>

            {openDebts.length > 1 ? (
              <FormField
                name="debtIds"
                label={labels.targetDebts}
                hint={labels.targetDebtsHint}
              >
                <CheckboxGroup
                  name="debtIds"
                  columns={1}
                  defaultValues={[debtId]}
                  options={openDebts.map((debt) => ({
                    value: debt.id,
                    label: debt.label,
                    description: debt.remaining,
                  }))}
                />
              </FormField>
            ) : (
              <input type="hidden" name="debtIds" value={debtId} />
            )}

            <FormField name="note" label={labels.note}>
              <Textarea name="note" rows={2} maxLength={500} />
            </FormField>
          </div>
        </ActionForm>
      </Drawer>
    </>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
