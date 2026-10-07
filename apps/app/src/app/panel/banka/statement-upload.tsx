"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Input, Select } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { importBankStatement } from "./actions";

/**
 * Ekstre yükleme. Dosya tarayıcıda okunup `csv` metin alanına konuyor; sunucu
 * eylemine `File` taşımıyoruz. Önizleme yok: hatalı satırlar sonuç mesajında
 * sayı olarak çıkıyor, ekstre tekrar yüklenince hareketler çoğalmıyor.
 */
export function StatementUpload({
  accounts,
}: {
  accounts: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations("app.bank");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");

  return (
    <ActionForm
      action={importBankStatement}
      submitLabel={t("statementSubmit")}
      resetOnSuccess
      onSuccess={() => {
        setCsv("");
        setFileName("");
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField name="accountId" label={t("statementAccount")} required>
          <Select name="accountId" defaultValue={accounts[0]?.id}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField name="csv" label={t("statementFile")} hint={t("statementHint")} required>
          <Input
            type="file"
            accept=".csv,text/csv,text/plain"
            aria-label={t("statementFile")}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              setFileName(file?.name ?? "");
              setCsv(file ? await file.text() : "");
            }}
          />
          <input type="hidden" name="csv" value={csv} />
          {fileName ? <span className="mt-1 block text-xs text-fg-subtle">{fileName}</span> : null}
        </FormField>
      </div>
    </ActionForm>
  );
}
