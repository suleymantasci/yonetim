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
import { saveStaff } from "./actions";

const ROLES = [
  "kapici",
  "guvenlik",
  "temizlik",
  "bahcivan",
  "teknik",
  "diger",
] as const;

export interface StaffFormDefaults {
  id: string;
  fullName: string;
  role: string;
  phone: string | null;
  grossSalaryKurus: number;
  netSalaryKurus: number;
  sgkPremiumKurus: number;
  startedAt: string;
  endedAt: string | null;
  annualLeaveDays: number;
  usedLeaveDays: number;
  advanceBalanceKurus: number;
  hasTckn: boolean;
  hasIban: boolean;
}

/**
 * Personel formu — PROJE-DURUMU §5.2'nin ilk maddesi.
 *
 * NET ÜCRET VE SGK **GİRİLİYOR, HESAPLANMIYOR**. Gerçek bordro asgari geçim
 * indirimi, kümülatif vergi matrahı, teşvik indirimleri ve SGK tavanına bağlı;
 * burada hesaplamak mali müşavirin ürettiği bordroyla çelişecek bir ikinci
 * gerçek üretirdi. Form bunu gizlemiyor, ekranda söylüyor — "yaklaşık" diye
 * sunulan bir rakam, yanlış olduğu anlaşılana kadar doğru sanılır.
 *
 * AYRILIŞ TARİHİ TEK KAYNAK: ayrı bir "aktif mi" anahtarı yok. İkisi birlikte
 * olsaydı "ayrıldı ama aktif" çelişkisi mümkün olurdu ve o çelişki aylık
 * maliyet toplamını sessizce şişirirdi (toplam yalnız aktifleri sayıyor).
 *
 * TCKN/IBAN **boş = dokunma**. Alanlar hiçbir okuma ucundan geri gelmediği
 * için (§9.1) formda her zaman boş görünüyorlar; boşluğu "sil" saymak, formu
 * açıp kaydeden herkesin kimlik bilgisini silmesi demekti. Silmek için ayrı
 * bir anahtar var ve yalnız kayıt varsa gösteriliyor.
 */
export function StaffForm({
  defaults,
  cancelHref,
  submitLabel,
  stayOnSuccess,
  onSaved,
  onCreated,
  layout,
  onCancel,
}: {
  defaults?: StaffFormDefaults;
  cancelHref?: string;
  submitLabel: string;
  stayOnSuccess?: boolean;
  onSaved?: () => void;
  onCreated?: (id: string) => void;
  layout?: "page" | "modal";
  onCancel?: () => void;
}) {
  const t = useTranslations("app.staff");
  const tEnum = useTranslations("enum");

  const [grossKurus, setGrossKurus] = useState(defaults?.grossSalaryKurus ?? 0);
  const [sgkKurus, setSgkKurus] = useState(defaults?.sgkPremiumKurus ?? 0);
  const [endedAt, setEndedAt] = useState(defaults?.endedAt ?? "");
  const [annualLeave, setAnnualLeave] = useState(
    defaults?.annualLeaveDays ?? 14,
  );
  const [usedLeave, setUsedLeave] = useState(defaults?.usedLeaveDays ?? 0);

  const employerCost = grossKurus + sgkKurus;
  const remainingLeave = annualLeave - usedLeave;

  return (
    <ActionForm
      action={saveStaff}
      submitLabel={submitLabel}
      cancelHref={cancelHref}
      stayOnSuccess={stayOnSuccess}
      layout={layout}
      onCancel={onCancel}
      onSuccess={(state) => {
        if (state.data?.id) onCreated?.(state.data.id);
        onSaved?.();
      }}
    >
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <FormSection title={t("sectionPerson")} description={t("sectionPersonHint")}>
        <FormField name="fullName" label={t("fullName")} required>
          <Input
            name="fullName"
            defaultValue={defaults?.fullName}
            required
            minLength={3}
            maxLength={160}
            placeholder={t("fullNamePlaceholder")}
          />
        </FormField>

        <FormField name="role" label={t("role")} required>
          <Select name="role" defaultValue={defaults?.role ?? "kapici"} required>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {tEnum(`staffRole.${role}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField name="phone" label={t("phone")} hint={t("phoneHint")}>
          <Input
            name="phone"
            type="tel"
            defaultValue={defaults?.phone ?? ""}
            maxLength={20}
            placeholder="+90…"
          />
        </FormField>
      </FormSection>

      <FormSection
        title={t("sectionIdentity")}
        description={t("sectionIdentityHint")}
      >
        <FormField name="tckn" label={t("tckn")} hint={t("tcknHint")}>
          <Input
            name="tckn"
            inputMode="numeric"
            maxLength={11}
            placeholder={defaults?.hasTckn ? t("piiOnRecord") : ""}
          />
        </FormField>

        <FormField name="iban" label={t("iban")} hint={t("ibanHint")}>
          <Input
            name="iban"
            maxLength={34}
            placeholder={defaults?.hasIban ? t("piiOnRecord") : "TR…"}
          />
        </FormField>

        {/* Silme anahtarları yalnız kayıt varken anlamlı; yoksa gösterilmiyor
            ki form "silinecek bir şey var" izlenimi vermesin. */}
        {defaults?.hasTckn ? (
          <div className="sm:col-span-2">
            <Switch
              name="clearTckn"
              label={t("clearTckn")}
              description={t("clearTcknHint")}
            />
          </div>
        ) : null}
        {defaults?.hasIban ? (
          <div className="sm:col-span-2">
            <Switch
              name="clearIban"
              label={t("clearIban")}
              description={t("clearIbanHint")}
            />
          </div>
        ) : null}
      </FormSection>

      <FormSection
        title={t("sectionEmployment")}
        description={t("sectionEmploymentHint")}
      >
        <FormField name="startedAt" label={t("startedAt")} required>
          <DateInput
            name="startedAt"
            defaultValue={defaults?.startedAt ?? today()}
            required
          />
        </FormField>

        <FormField name="endedAt" label={t("endedAt")} hint={t("endedAtHint")}>
          <DateInput
            name="endedAt"
            defaultValue={defaults?.endedAt ?? ""}
            onValueChange={setEndedAt}
          />
        </FormField>

        {endedAt ? (
          <div className="sm:col-span-2">
            <Alert tone="warning">{t("endedAtNotice")}</Alert>
          </div>
        ) : null}

        <FormField name="annualLeaveDays" label={t("annualLeaveDays")} required>
          <Input
            name="annualLeaveDays"
            type="number"
            min={0}
            max={365}
            value={String(annualLeave)}
            onChange={(event) => setAnnualLeave(Number(event.target.value) || 0)}
            required
          />
        </FormField>

        <FormField name="usedLeaveDays" label={t("usedLeaveDays")} required>
          <Input
            name="usedLeaveDays"
            type="number"
            min={0}
            max={365}
            value={String(usedLeave)}
            onChange={(event) => setUsedLeave(Number(event.target.value) || 0)}
            required
          />
        </FormField>

        <div className="sm:col-span-2">
          <Alert tone={remainingLeave < 0 ? "danger" : "info"}>
            {remainingLeave < 0
              ? t("leaveNegative")
              : t("leaveRemainingNotice", { days: remainingLeave })}
          </Alert>
        </div>
      </FormSection>

      <FormSection
        title={t("sectionPayroll")}
        description={t("sectionPayrollHint")}
      >
        <FormField
          name="grossSalaryKurus"
          label={t("grossSalary")}
          hint={t("grossSalaryHint")}
        >
          <MoneyInput
            name="grossSalaryKurus"
            defaultKurus={defaults?.grossSalaryKurus ?? 0}
            onKurusChange={setGrossKurus}
          />
        </FormField>

        <FormField
          name="netSalaryKurus"
          label={t("netSalary")}
          hint={t("netSalaryHint")}
        >
          <MoneyInput
            name="netSalaryKurus"
            defaultKurus={defaults?.netSalaryKurus ?? 0}
          />
        </FormField>

        <FormField
          name="sgkPremiumKurus"
          label={t("sgkPremium")}
          hint={t("sgkPremiumHint")}
        >
          <MoneyInput
            name="sgkPremiumKurus"
            defaultKurus={defaults?.sgkPremiumKurus ?? 0}
            onKurusChange={setSgkKurus}
          />
        </FormField>

        {/* Avans bakiyesi artık elle yazılmıyor: personel carisinden
            (avans ödemeleri − mahsuplar) hesaplanıyor. */}

        {employerCost > 0 ? (
          <div className="sm:col-span-2 rounded-lg bg-surface-sunken p-3">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-fg-subtle">{t("employerCost")}</dt>
                <dd className="font-semibold tabular-nums text-fg">
                  {kurusToDisplay(employerCost)} ₺
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">
                  {t("employerCostYearly")}
                </dt>
                <dd className="font-semibold tabular-nums text-fg">
                  {kurusToDisplay(employerCost * 12)} ₺
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <Alert tone="info">{t("payrollDisclaimer")}</Alert>
        </div>
      </FormSection>
    </ActionForm>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
