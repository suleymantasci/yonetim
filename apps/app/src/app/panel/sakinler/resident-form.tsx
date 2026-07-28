"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import {
  Alert,
  Checkbox,
  Combobox,
  DateInput,
  FormSection,
  Input,
  PhoneInput,
  RadioGroup,
  Select,
  Switch,
  TcknInput,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import type { ServerAction } from "@/components/form/action-form";

/**
 * Sakin ekleme/düzenleme formu — GAP 4.1.2.
 *
 * Üç tasarım kararı:
 *
 * 1. **KVKK onayı zorunlu alan.** Aydınlatma metni okundu kutusu işaretlenmeden
 *    kayıt yapılamaz; sunucu da bunu ayrıca doğrular ve onayı versiyonuyla
 *    `consents` tablosuna yazar. "Sonra hallederiz" yolu bilinçli olarak kapalı.
 *
 * 2. **İlk ilişki formun içinde.** Yeni sakin eklerken hangi daireye, hangi
 *    sıfatla bağlanacağı aynı ekranda sorulur. İki adıma bölmek, ilişkisiz
 *    sakin kayıtları biriktiriyordu.
 *
 * 3. **TCKN gizli varsayılan.** Alan `password` tipinde açılır, göz ikonuyla
 *    açığa çıkar. Omuz üstünden okuma en gerçekçi sızıntı yolu.
 */
export function ResidentForm({
  action,
  units,
  defaults,
  presetUnitId,
  cancelHref,
  submitLabel,
  stayOnSuccess,
  onCreated,
  footer,
}: {
  action: ServerAction<{ id: string }>;
  units: { id: string; number: string; blockName: string | null }[];
  defaults?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    email: string | null;
    role: string;
    locale: string;
    whatsappOptIn: boolean;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    notes: string | null;
    hasTckn: boolean;
  };
  presetUnitId?: string;
  cancelHref?: string;
  submitLabel: string;
  /** Çekmece içinde açıldığında: kayıt sonrası sayfa değiştirme. */
  stayOnSuccess?: boolean;
  onCreated?: (id: string) => void;
  /** Varsayılan yapışkan alt bar yerine özel bir alt bar. */
  footer?: ReactNode;
}) {
  const t = useTranslations("app.residents");
  const tCommon = useTranslations("common");
  const tEnum = useTranslations("enum");
  const [relation, setRelation] = useState<"owner" | "tenant" | "none">(
    presetUnitId ? "owner" : "none",
  );

  const isEdit = defaults !== undefined;
  const unitOptions = units.map((unit) => ({
    value: unit.id,
    label: unit.blockName ? `${unit.blockName} / ${unit.number}` : unit.number,
  }));

  return (
    <ActionForm
      action={action}
      submitLabel={submitLabel}
      cancelHref={cancelHref}
      stayOnSuccess={stayOnSuccess}
      footer={footer}
      onSuccess={(state) => {
        if (state.data?.id) onCreated?.(state.data.id);
      }}
    >
      {isEdit ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <FormSection
        title={t("sectionIdentity")}
        description={t("sectionIdentityHint")}
      >
        <FormField name="firstName" label={t("firstName")} required>
          <Input
            name="firstName"
            defaultValue={defaults?.firstName ?? ""}
            required
            maxLength={80}
            autoComplete="given-name"
          />
        </FormField>
        <FormField name="lastName" label={t("lastName")} required>
          <Input
            name="lastName"
            defaultValue={defaults?.lastName ?? ""}
            required
            maxLength={80}
            autoComplete="family-name"
          />
        </FormField>
        <FormField
          name="tckn"
          label={t("tckn")}
          hint={isEdit ? t("tcknEditHint") : t("tcknHint")}
        >
          <TcknInput
            name="tckn"
            masked={defaults?.hasTckn}
            invalidHint={tCommon("validation.invalidTckn")}
          />
        </FormField>
        <FormField name="role" label={t("role")} required>
          <Select name="role" defaultValue={defaults?.role ?? "owner"} required>
            {(
              [
                "owner",
                "tenant_resident",
                "staff",
                "auditor",
                "accountant",
              ] as const
            ).map((role) => (
              <option key={role} value={role}>
                {tEnum(`role.${role}`)}
              </option>
            ))}
          </Select>
        </FormField>
      </FormSection>

      <FormSection
        title={t("sectionContact")}
        description={t("sectionContactHint")}
      >
        <FormField name="phone" label={t("phone")} hint={t("phoneHint")}>
          <PhoneInput
            name="phone"
            defaultValue={defaults?.phone ?? ""}
            invalidHint={tCommon("validation.invalidPhone")}
          />
        </FormField>
        <FormField name="email" label={t("email")}>
          <Input
            name="email"
            type="email"
            defaultValue={defaults?.email ?? ""}
            maxLength={255}
            autoComplete="email"
          />
        </FormField>
        <FormField name="locale" label={t("locale")} hint={t("localeHint")}>
          <Select name="locale" defaultValue={defaults?.locale ?? "tr"}>
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
            <option value="ru">Русский</option>
          </Select>
        </FormField>
        <div className="sm:col-span-2">
          <Switch
            name="whatsappOptIn"
            label={t("whatsappOptInLabel")}
            description={t("whatsappOptInHint")}
            defaultChecked={defaults?.whatsappOptIn}
          />
        </div>
      </FormSection>

      <FormSection
        title={t("sectionEmergency")}
        description={t("sectionEmergencyHint")}
      >
        <FormField name="emergencyContactName" label={t("emergencyName")}>
          <Input
            name="emergencyContactName"
            defaultValue={defaults?.emergencyContactName ?? ""}
            maxLength={120}
          />
        </FormField>
        <FormField name="emergencyContactPhone" label={t("emergencyPhone")}>
          <PhoneInput
            name="emergencyContactPhone"
            defaultValue={defaults?.emergencyContactPhone ?? ""}
            invalidHint={tCommon("validation.invalidPhone")}
          />
        </FormField>
      </FormSection>

      {isEdit ? null : (
        <FormSection
          title={t("sectionFirstUnit")}
          description={t("sectionFirstUnitHint")}
          columns={1}
        >
          <RadioGroup
            name="relation"
            columns={3}
            defaultValue={relation}
            onChange={(value) =>
              setRelation(value as "owner" | "tenant" | "none")
            }
            options={[
              {
                value: "owner",
                label: tEnum("occupancy.owner"),
                description: t("relationOwnerHint"),
              },
              {
                value: "tenant",
                label: tEnum("occupancy.tenant"),
                description: t("relationTenantHint"),
              },
              {
                value: "none",
                label: t("relationNone"),
                description: t("relationNoneHint"),
              },
            ]}
          />

          {relation === "none" ? (
            <Alert tone="info">{t("relationNoneNotice")}</Alert>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="unitId" label={t("unit")} required>
                <Combobox
                  name="unitId"
                  options={unitOptions}
                  defaultValues={presetUnitId ? [presetUnitId] : []}
                  placeholder={t("selectUnit")}
                  searchPlaceholder={t("searchUnit")}
                  emptyText={t("noUnitFound")}
                />
              </FormField>
              <FormField
                name="startDate"
                label={t("startDate")}
                hint={t("startDateHint")}
              >
                <DateInput name="startDate" defaultValue={today()} />
              </FormField>
              {relation === "owner" ? (
                <FormField
                  name="ownershipPct"
                  label={t("ownershipPct")}
                  hint={t("ownershipPctHint")}
                >
                  <Input
                    name="ownershipPct"
                    inputMode="decimal"
                    defaultValue="100"
                  />
                </FormField>
              ) : (
                <FormField
                  name="debtTransferPolicy"
                  label={t("debtTransferPolicy")}
                  hint={t("debtTransferPolicyHint")}
                >
                  <Select name="debtTransferPolicy" defaultValue="owner">
                    <option value="owner">{t("transferPolicy.owner")}</option>
                    <option value="next_tenant">
                      {t("transferPolicy.next_tenant")}
                    </option>
                    <option value="keep">{t("transferPolicy.keep")}</option>
                  </Select>
                </FormField>
              )}
            </div>
          )}
        </FormSection>
      )}

      <FormSection title={t("sectionNotes")} columns={1}>
        <FormField name="notes" label={t("notes")} hint={t("notesHint")}>
          <Textarea
            name="notes"
            defaultValue={defaults?.notes ?? ""}
            rows={3}
            maxLength={1000}
          />
        </FormField>
      </FormSection>

      {isEdit ? null : (
        <div className="mt-4 rounded-lg border border-warning-border bg-warning-soft p-3">
          <Checkbox
            name="kvkkAcknowledged"
            required
            label={t("kvkkLabel")}
            description={t("kvkkDescription")}
          />
        </div>
      )}
    </ActionForm>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
