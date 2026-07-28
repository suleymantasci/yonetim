"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import {
  Alert,
  Combobox,
  FormSection,
  Input,
  RadioGroup,
  Select,
  Switch,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import type { ServerAction } from "@/components/form/action-form";

/**
 * Birim ekleme/düzenleme formu — GAP 4.1.1.
 *
 * Arsa payı girişi iki modludur (GAP 4.2.3): yönetici tapudaki "120/1000"
 * kesrini ya da doğrudan ondalık oranı girer. Varsayılan kesir modudur çünkü
 * tapu belgesinde yazan biçim odur; ondalık isteyen kullanıcı geçiş yapar.
 */
export function UnitForm({
  action,
  blocks,
  defaults,
  cancelHref,
  submitLabel,
  stayOnSuccess,
  onCreated,
  footer,
}: {
  action: ServerAction<{ id: string }>;
  blocks: { id: string; name: string }[];
  defaults?: {
    id: string;
    blockId: string | null;
    number: string;
    floor: number;
    type: string;
    areaM2: string | null;
    landShare: string | null;
    landShareNumerator: number | null;
    landShareDenominator: number | null;
    roomCount: string | null;
    residentCount: number;
    ownershipType: string;
    duesExempt: boolean;
    lateFeeExempt: boolean;
    duesMultiplier: string;
    notes: string | null;
  };
  cancelHref?: string;
  submitLabel: string;
  /** Çekmece içinde açıldığında: kayıt sonrası sayfa değiştirme. */
  stayOnSuccess?: boolean;
  onCreated?: (id: string) => void;
  /** Varsayılan yapışkan alt bar yerine özel bir alt bar. */
  footer?: ReactNode;
}) {
  const t = useTranslations("app.units");
  const tEnum = useTranslations("enum");
  const [shareMode, setShareMode] = useState<"fraction" | "decimal">(
    defaults?.landShareNumerator
      ? "fraction"
      : defaults?.landShare
        ? "decimal"
        : "fraction",
  );

  const unitTypes = [
    "flat",
    "shop",
    "office",
    "depot",
    "garage",
    "villa",
    "common_area",
  ] as const;

  return (
    <ActionForm
      action={action as ServerAction<{ id: string }>}
      submitLabel={submitLabel}
      cancelHref={cancelHref}
      stayOnSuccess={stayOnSuccess}
      footer={footer}
      onSuccess={(state) => {
        if (state.data?.id) onCreated?.(state.data.id);
      }}
    >
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <FormSection
        title={t("sectionIdentity")}
        description={t("sectionIdentityHint")}
      >
        <FormField
          name="number"
          label={t("number")}
          required
          hint={t("numberHint")}
        >
          <Input
            name="number"
            defaultValue={defaults?.number}
            required
            maxLength={20}
            autoComplete="off"
          />
        </FormField>

        <FormField name="blockId" label={t("block")} hint={t("blockHint")}>
          <Combobox
            name="blockId"
            options={blocks.map((block) => ({
              value: block.id,
              label: block.name,
            }))}
            defaultValues={defaults?.blockId ? [defaults.blockId] : []}
            placeholder={t("noBlock")}
            searchPlaceholder={t("searchBlock")}
            emptyText={t("noBlockFound")}
          />
        </FormField>

        <FormField name="floor" label={t("floor")} required>
          <Input
            name="floor"
            type="number"
            inputMode="numeric"
            defaultValue={defaults?.floor ?? 0}
            required
            min={-10}
            max={200}
          />
        </FormField>

        <FormField name="type" label={t("type")} required>
          <Select name="type" defaultValue={defaults?.type ?? "flat"} required>
            {unitTypes.map((type) => (
              <option key={type} value={type}>
                {tEnum(`unitType.${type}`)}
              </option>
            ))}
          </Select>
        </FormField>
      </FormSection>

      <FormSection
        title={t("sectionMeasures")}
        description={t("sectionMeasuresHint")}
      >
        <FormField name="areaM2" label={t("area")} hint={t("areaHint")}>
          <Input
            name="areaM2"
            inputMode="decimal"
            defaultValue={defaults?.areaM2 ?? ""}
            placeholder="72,50"
          />
        </FormField>

        <FormField
          name="roomCount"
          label={t("roomCount")}
          hint={t("roomCountHint")}
        >
          <Input
            name="roomCount"
            defaultValue={defaults?.roomCount ?? ""}
            placeholder="3+1"
            maxLength={10}
          />
        </FormField>

        <div className="sm:col-span-2">
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium text-fg">
              {t("landShare")}
            </legend>
            <div className="mb-3">
              <RadioGroup
                name="_shareMode"
                columns={2}
                defaultValue={shareMode}
                onChange={(value) =>
                  setShareMode(value as "fraction" | "decimal")
                }
                options={[
                  {
                    value: "fraction",
                    label: t("shareFraction"),
                    description: t("shareFractionHint"),
                  },
                  {
                    value: "decimal",
                    label: t("shareDecimal"),
                    description: t("shareDecimalHint"),
                  },
                ]}
              />
            </div>

            {shareMode === "fraction" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  name="landShareNumerator"
                  label={t("shareNumerator")}
                >
                  <Input
                    name="landShareNumerator"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    defaultValue={defaults?.landShareNumerator ?? ""}
                    placeholder="120"
                  />
                </FormField>
                <FormField
                  name="landShareDenominator"
                  label={t("shareDenominator")}
                >
                  <Input
                    name="landShareDenominator"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    defaultValue={defaults?.landShareDenominator ?? ""}
                    placeholder="1000"
                  />
                </FormField>
              </div>
            ) : (
              <FormField
                name="landShare"
                label={t("shareDecimal")}
                hint={t("shareDecimalRange")}
              >
                <Input
                  name="landShare"
                  inputMode="decimal"
                  defaultValue={defaults?.landShare ?? ""}
                  placeholder="0,120000"
                />
              </FormField>
            )}
          </fieldset>
        </div>
      </FormSection>

      <FormSection
        title={t("sectionOccupancy")}
        description={t("sectionOccupancyHint")}
      >
        <FormField name="ownershipType" label={t("ownershipType")} required>
          <Select
            name="ownershipType"
            defaultValue={defaults?.ownershipType ?? "vacant"}
            required
          >
            {(["owner", "tenant", "vacant"] as const).map((value) => (
              <option key={value} value={value}>
                {tEnum(`occupancy.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          name="residentCount"
          label={t("residentCount")}
          hint={t("residentCountHint")}
        >
          <Input
            name="residentCount"
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
            defaultValue={defaults?.residentCount ?? 0}
          />
        </FormField>
      </FormSection>

      <FormSection
        title={t("sectionDues")}
        description={t("sectionDuesHint")}
        columns={1}
      >
        <Switch
          name="duesExempt"
          label={t("duesExempt")}
          description={t("duesExemptHint")}
          defaultChecked={defaults?.duesExempt}
        />
        <Switch
          name="lateFeeExempt"
          label={t("lateFeeExempt")}
          description={t("lateFeeExemptHint")}
          defaultChecked={defaults?.lateFeeExempt}
        />
        <FormField
          name="duesMultiplier"
          label={t("duesMultiplier")}
          hint={t("duesMultiplierHint")}
        >
          <Input
            name="duesMultiplier"
            inputMode="decimal"
            defaultValue={defaults?.duesMultiplier ?? "1"}
            placeholder="1,000"
          />
        </FormField>
        <div className="mt-1">
          <Alert tone="info">{t("duesMultiplierNote")}</Alert>
        </div>
      </FormSection>

      <FormSection title={t("sectionNotes")} columns={1}>
        <FormField name="notes" label={t("notes")} hint={t("notesHint")}>
          <Textarea
            name="notes"
            defaultValue={defaults?.notes ?? ""}
            maxLength={2000}
            rows={3}
          />
        </FormField>
      </FormSection>
    </ActionForm>
  );
}
