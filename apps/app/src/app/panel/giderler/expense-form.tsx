"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Alert,
  DateInput,
  FormSection,
  Input,
  MoneyInput,
  Select,
  Switch,
  kurusToDisplay,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveExpense } from "./actions";
import { NoCategoriesNotice } from "./no-categories-notice";

/**
 * Gider formu — GAP 4.1.4.
 *
 * KDV **girilmez, hesaplanır**: yönetici faturadaki KDV dahil toplamı yazar,
 * form oranı uygulayıp KDV'yi ayırır. Yöneticiye iki sayı sormak (toplam ve
 * KDV) her zaman uyuşmazlık üretiyordu; tek doğruluk kaynağı toplam.
 *
 * Kategori seçimi dağıtım formülünü de belirler (kategori kendi varsayılanını
 * taşır); form seçilen kategorinin formülünü hemen gösterir, böylece "bu gider
 * dairelere nasıl yansıyacak?" sorusu kayıt anında cevaplanır.
 */
export function ExpenseForm({
  categories,
  bankAccounts = [],
  defaults,
  cancelHref,
  submitLabel,
  canApprove,
  stayOnSuccess,
  onCreated,
  layout,
  onCancel,
}: {
  categories: {
    id: string;
    name: string;
    depth: number;
    distribution: string;
    defaultVatRate: string | null;
  }[];
  /** Paranın çıkabileceği hesaplar; boşsa yalnız nakit kasa sorulur. */
  bankAccounts?: { id: string; label: string }[];
  defaults?: {
    id: string;
    categoryId: string | null;
    vendorName: string | null;
    description: string;
    amountKurus: number;
    vatRate: string;
    withholdingKurus: number;
    invoiceNo: string | null;
    expenseDate: string;
    paidVia: string | null;
    bankAccountId: string | null;
    isPaid: boolean;
    attachmentUrl: string | null;
    status: string;
  };
  cancelHref?: string;
  submitLabel: string;
  /** Çekmece içinde açıldığında: kayıt sonrası sayfa değiştirme. */
  stayOnSuccess?: boolean;
  onCreated?: (id: string) => void;
  /** `"modal"`: alanlar kayar, Vazgeç/Kaydet çubuğu panelin altına sabitlenir. */
  layout?: "page" | "modal";
  onCancel?: () => void;
  canApprove: boolean;
}) {
  const t = useTranslations("app.expenses");
  const tEnum = useTranslations("enum");

  const [categoryId, setCategoryId] = useState(defaults?.categoryId ?? "");
  const [amountKurus, setAmountKurus] = useState(defaults?.amountKurus ?? 0);
  const [vatRate, setVatRate] = useState(Number(defaults?.vatRate ?? 0.2));

  const category = categories.find((entry) => entry.id === categoryId);
  const vatKurus = Math.round((amountKurus * vatRate) / (1 + vatRate));
  const netKurus = amountKurus - vatKurus;

  return (
    <ActionForm
      action={saveExpense}
      submitLabel={submitLabel}
      cancelHref={cancelHref}
      stayOnSuccess={stayOnSuccess}
      layout={layout}
      onCancel={onCancel}
      onSuccess={(state) => {
        if (state.data?.id) onCreated?.(state.data.id);
      }}
    >
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <FormSection title={t("sectionWhat")} description={t("sectionWhatHint")}>
        <div className="sm:col-span-2">
          <FormField name="description" label={t("description")} required>
            <Input
              name="description"
              defaultValue={defaults?.description}
              required
              minLength={3}
              maxLength={240}
              placeholder={t("descriptionPlaceholder")}
            />
          </FormField>
        </div>

        <FormField
          name="categoryId"
          label={t("category")}
          hint={t("categorySelectHint")}
        >
          <Select
            name="categoryId"
            value={categoryId}
            onChange={(event) => {
              const next = event.target.value;
              setCategoryId(next);
              const selected = categories.find((entry) => entry.id === next);
              if (selected?.defaultVatRate)
                setVatRate(Number(selected.defaultVatRate));
            }}
          >
            <option value="">{t("categoryNone")}</option>
            {categories.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.depth > 0 ? `— ${entry.name}` : entry.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField name="vendorName" label={t("vendor")} hint={t("vendorHint")}>
          <Input
            name="vendorName"
            defaultValue={defaults?.vendorName ?? ""}
            maxLength={160}
          />
        </FormField>

        {categories.length === 0 ? (
          <div className="sm:col-span-2">
            <NoCategoriesNotice onCreated={setCategoryId} />
          </div>
        ) : null}

        {category ? (
          <div className="sm:col-span-2">
            <Alert tone="info">
              {t("categoryDistributionNotice", {
                formula: tEnum(`duesFormula.${category.distribution}`),
              })}
            </Alert>
          </div>
        ) : null}
      </FormSection>

      <FormSection
        title={t("sectionAmount")}
        description={t("sectionAmountHint")}
      >
        <FormField
          name="amountKurus"
          label={t("amountGross")}
          required
          hint={t("amountGrossHint")}
        >
          <MoneyInput
            name="amountKurus"
            defaultKurus={defaults?.amountKurus ?? 0}
            onKurusChange={setAmountKurus}
            required
          />
        </FormField>

        <FormField
          name="vatRate"
          label={t("vatRate")}
          hint={t("vatRateFormHint")}
        >
          <Select
            name="vatRate"
            value={String(vatRate)}
            onChange={(event) => setVatRate(Number(event.target.value))}
          >
            <option value="0">%0</option>
            <option value="0.01">%1</option>
            <option value="0.1">%10</option>
            <option value="0.2">%20</option>
          </Select>
        </FormField>

        {amountKurus > 0 ? (
          <div className="sm:col-span-2 rounded-lg bg-surface-sunken p-3">
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-fg-subtle">{t("amountNet")}</dt>
                <dd className="font-semibold tabular-nums text-fg">
                  {kurusToDisplay(netKurus)} ₺
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">{t("vatAmount")}</dt>
                <dd className="font-semibold tabular-nums text-fg">
                  {kurusToDisplay(vatKurus)} ₺
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">{t("amountGross")}</dt>
                <dd className="font-semibold tabular-nums text-fg">
                  {kurusToDisplay(amountKurus)} ₺
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        <FormField
          name="withholdingKurus"
          label={t("withholding")}
          hint={t("withholdingHint")}
        >
          <MoneyInput
            name="withholdingKurus"
            defaultKurus={defaults?.withholdingKurus ?? 0}
          />
        </FormField>

        <FormField name="invoiceNo" label={t("invoiceNo")}>
          <Input
            name="invoiceNo"
            defaultValue={defaults?.invoiceNo ?? ""}
            maxLength={60}
          />
        </FormField>
      </FormSection>

      <FormSection
        title={t("sectionPayment")}
        description={t("sectionPaymentHint")}
      >
        <FormField name="expenseDate" label={t("expenseDate")} required>
          <DateInput
            name="expenseDate"
            defaultValue={defaults?.expenseDate ?? today()}
            required
          />
        </FormField>

        <FormField name="paidVia" label={t("paidVia")} hint={t("paidViaHint")}>
          <Input
            name="paidVia"
            defaultValue={defaults?.paidVia ?? ""}
            maxLength={40}
          />
        </FormField>

        {/*
          Paranın çıktığı yer: kasa dökümü "bu hesaptan ne çıktı" sorusunu
          ancak bununla cevaplıyor. Boş bırakılırsa nakit kasa sayılıyor —
          serbest metin `paidVia` hangi hesap olduğunu söylemiyordu.
          Hesap tanımlanmamış siteye seçim sorulmuyor; tek olasılık nakit.
        */}
        {bankAccounts.length > 0 ? (
          <FormField
            name="bankAccountId"
            label={t("paidFrom")}
            hint={t("paidFromHint")}
          >
            <Select
              name="bankAccountId"
              defaultValue={defaults?.bankAccountId ?? ""}
            >
              <option value="">{t("paidFromCash")}</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}

        <FormField name="status" label={t("status")} required>
          <Select
            name="status"
            defaultValue={
              defaults?.status ?? (canApprove ? "approved" : "pending_approval")
            }
            required
          >
            <option value="draft">{tEnum("expenseStatus.draft")}</option>
            <option value="pending_approval">
              {tEnum("expenseStatus.pending_approval")}
            </option>
            {canApprove ? (
              <>
                <option value="approved">
                  {tEnum("expenseStatus.approved")}
                </option>
                <option value="paid">{tEnum("expenseStatus.paid")}</option>
              </>
            ) : null}
          </Select>
        </FormField>

        <div className="sm:col-span-2">
          <Switch
            name="isPaid"
            label={t("isPaid")}
            description={t("isPaidHint")}
            defaultChecked={defaults?.isPaid}
          />
        </div>
      </FormSection>

      <FormSection
        title={t("sectionDocument")}
        description={t("sectionDocumentHint")}
        columns={1}
      >
        <FormField
          name="attachmentUrl"
          label={t("attachmentUrl")}
          hint={t("attachmentUrlHint")}
        >
          <Input
            name="attachmentUrl"
            type="url"
            defaultValue={defaults?.attachmentUrl ?? ""}
            maxLength={500}
            placeholder="https://…"
          />
        </FormField>

        {/* Dosya yükleme alanı vardı ama seçilen dosya hiçbir yere
            kaydedilmiyordu; üstelik Server Action gövdesine binip 1 MB'ı aşan
            faturada isteği 500'e düşürüyor, doğrulama hiç çalışmıyordu.
            Yükleme, Belgeler modülünün imzalı-URL akışına bağlanınca
            (`packages/ui` `FileInput`) geri gelecek; o güne kadar bağlantı. */}
      </FormSection>
    </ActionForm>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
