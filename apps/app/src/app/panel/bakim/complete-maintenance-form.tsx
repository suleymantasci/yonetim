"use client";

import { useTranslations } from "next-intl";

import { Alert, DateInput, Input, MoneyInput, Textarea } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { completeMaintenance } from "./actions";

/**
 * "Bakım yapıldı" formu — plan formundan **ayrı**.
 *
 * Sıradaki vade burada sorulmuyor: sunucu `yapıldığı tarih + periyot` olarak
 * hesaplıyor. Kullanıcıya sorulsaydı geç yapılan bir bakımın sonraki vadesi
 * elle ileri atılabilir ve periyot anlamını yitirirdi. Formun hesabı ekranda
 * önceden gösteriliyor ki sürpriz olmasın.
 */
export function CompleteMaintenanceForm({
  recordId,
  intervalDays,
  submitLabel,
  onDone,
  layout,
  onCancel,
}: {
  recordId: string;
  intervalDays: number;
  submitLabel: string;
  onDone?: () => void;
  layout?: "page" | "modal";
  onCancel?: () => void;
}) {
  const t = useTranslations("app.maintenance");

  return (
    <ActionForm
      action={completeMaintenance}
      submitLabel={submitLabel}
      stayOnSuccess
      layout={layout}
      onCancel={onCancel}
      onSuccess={onDone}
    >
      <input type="hidden" name="id" value={recordId} />

      <FormField name="doneAt" label={t("doneAt")} required>
        <DateInput name="doneAt" defaultValue={today()} required />
      </FormField>

      <FormField name="costKurus" label={t("costField")} hint={t("costHint")}>
        <MoneyInput name="costKurus" defaultKurus={0} />
      </FormField>

      <div className="sm:col-span-2">
        <Alert tone="info">{t("nextDueNotice", { days: intervalDays })}</Alert>
      </div>

      <div className="sm:col-span-2">
        <FormField
          name="documentUrl"
          label={t("documentUrl")}
          hint={t("documentUrlHint")}
        >
          <Input
            name="documentUrl"
            type="url"
            maxLength={500}
            placeholder="https://…"
          />
        </FormField>
      </div>

      <div className="sm:col-span-2">
        <FormField
          name="note"
          label={t("completionNote")}
          hint={t("completionNoteHint")}
        >
          <Textarea name="note" rows={3} maxLength={2000} />
        </FormField>
      </div>
    </ActionForm>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
