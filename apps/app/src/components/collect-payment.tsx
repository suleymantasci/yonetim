"use client";

import { Wallet } from "lucide-react";
import { useState } from "react";

import {
  Alert,
  CheckboxGroup,
  DateInput,
  Drawer,
  Input,
  MoneyInput,
  Select,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { collectPayment } from "@/app/panel/borclar/actions";

/**
 * Tahsilat girişi — sakin ve birim ekranlarından.
 *
 * NEDEN BURADA: tahsilat yalnızca borç **detayında** (`/panel/borclar/[id]`)
 * girilebiliyordu. Yani "şu daireden 500 TL aldım" demek için önce borcu bulup
 * açmak gerekiyordu; parayı alan yönetici genelde daireyi ya da kişiyi bilir,
 * hangi borca sayılacağını değil. Mahsup sırasını zaten sunucu belirliyor
 * (en eski vade önce), dolayısıyla borcu seçtirmek gereksiz bir adımdı.
 *
 * `collectPayment` aynı eylem: kural, mahsup ve denetim kaydı tek yerde kalıyor.
 * Buradaki tek fark hangi bağlamdan başlatıldığı.
 *
 * ÇOK BİRİMLİ SAKİN: kişi birden fazla dairede oturuyorsa/malikse önce birim
 * seçiliyor ve borç listesi ona göre daralıyor. Borç birime yazılıyor, kişiye
 * değil — birim seçilmeden tahsilatın nereye işleneceği belirsiz olurdu.
 */

export interface CollectUnitOption {
  id: string;
  label: string;
}

export interface CollectDebtOption {
  id: string;
  unitId: string;
  label: string;
  remaining: string;
}

export interface CollectLabels {
  trigger: string;
  title: string;
  hint: string;
  cancel: string;
  submit: string;
  unit: string;
  amount: string;
  method: string;
  methodTransfer: string;
  methodCash: string;
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
  noOpenDebts: string;
  note: string;
}

export function CollectPaymentButton({
  units,
  openDebts,
  payers,
  bankAccounts,
  labels,
  defaultPayerId,
}: {
  units: CollectUnitOption[];
  openDebts: CollectDebtOption[];
  payers: CollectUnitOption[];
  bankAccounts: CollectUnitOption[];
  labels: CollectLabels;
  /** Sakin ekranından açıldığında ödeyen önceden seçili gelir. */
  defaultPayerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("bank_transfer");
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");

  // Birim yoksa tahsilat girilemez: borç birime yazılıyor.
  if (units.length === 0) return null;

  const debtsForUnit = openDebts.filter((debt) => debt.unitId === unitId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
      >
        <Wallet aria-hidden className="h-4 w-4" />
        {labels.trigger}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={labels.title}
        description={labels.hint}
        closeLabel={labels.cancel}
        size="lg"
        padded={false}
      >
        <ActionForm
          action={collectPayment}
          submitLabel={labels.submit}
          onSuccess={() => setOpen(false)}
          layout="modal"
          onCancel={() => setOpen(false)}
        >
          <div className="space-y-4">
            {units.length > 1 ? (
              <FormField name="unitId" label={labels.unit} required>
                <Select
                  name="unitId"
                  value={unitId}
                  onChange={(event) => setUnitId(event.target.value)}
                  required
                >
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <input type="hidden" name="unitId" value={unitId} />
            )}

            <FormField name="amountKurus" label={labels.amount} required>
              <MoneyInput name="amountKurus" required />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
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
              Banka hesabı yalnız nakit dışında soruluyor — borç detayındaki
              tahsilat paneliyle aynı gerekçe: kasaya giren para için hesap
              seçtirmek, hiçbir ekstrede görünmeyecek bir kayıt üretir ve
              mutabakatta kalıcı fark bırakır.
            */}
            {method !== "cash" && bankAccounts.length > 0 ? (
              <FormField
                name="bankAccountId"
                label={labels.bankAccount}
                hint={labels.bankAccountHint}
              >
                <Select name="bankAccountId" defaultValue="">
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
              <Select name="payerUserId" defaultValue={defaultPayerId ?? ""}>
                <option value="">—</option>
                {payers.map((payer) => (
                  <option key={payer.id} value={payer.id}>
                    {payer.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField name="receiptNo" label={labels.receiptNo}>
              <Input name="receiptNo" maxLength={30} />
            </FormField>

            {/*
              Borç seçimi **isteğe bağlı**: boş bırakılırsa sunucu en eski
              vadeden başlayarak mahsup ediyor. Zorunlu tutmak, parayı alan
              yöneticiyi kasada beklerken borç listesi okumaya zorlardı.
            */}
            {debtsForUnit.length > 0 ? (
              <FormField
                name="debtIds"
                label={labels.targetDebts}
                hint={labels.targetDebtsHint}
              >
                <CheckboxGroup
                  name="debtIds"
                  columns={1}
                  defaultValues={[]}
                  options={debtsForUnit.map((debt) => ({
                    value: debt.id,
                    label: debt.label,
                    description: debt.remaining,
                  }))}
                />
              </FormField>
            ) : (
              <Alert tone="info">{labels.noOpenDebts}</Alert>
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
