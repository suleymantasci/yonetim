"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Alert,
  DateInput,
  FormSection,
  Input,
  Select,
  Switch,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveMaintenance } from "./actions";

/**
 * Şablon seçeneği — adı ve yasal dayanağı **sunucuda çevrilmiş** olarak gelir.
 *
 * `maintenance` namespace'i (yasal şablon kütüphanesi) 13 kB'ın üzerinde ve
 * yalnız bu formda kullanılıyor. İstemciye göndermek, tek bir `<select>` için
 * tüm mevzuat metnini her sayfa yüklemesine eklemek olurdu; sunucu zaten
 * çeviriye erişebiliyor.
 */
export interface MaintenanceTemplateOption {
  /** Tohum listeden geliyorsa `null` — veritabanında karşılığı yok. */
  id: string | null;
  code: string;
  /** Çevrilmiş ad. */
  name: string;
  equipmentType: string;
  intervalDays: number;
  isMandatory: boolean;
  /** Çevrilmiş yasal dayanak; yoksa `null`. */
  regulatoryNote: string | null;
}

export interface MaintenanceFormDefaults {
  id: string;
  templateId: string | null;
  equipmentType: string;
  label: string;
  location: string | null;
  intervalDays: number;
  nextDueAt: string;
  isActive: boolean;
  notes: string | null;
}

/**
 * Bakım planı formu.
 *
 * ŞABLON SEÇİMİ ALANLARI **DOLDURUR, KİLİTLEMEZ**. Yasal şablon (asansör
 * yıllık kontrol, yangın tüpü dolum…) doğru başlangıç noktası ama site
 * gerçeği farklı olabilir: iki asansör, farklı konumlar, sözleşmeye bağlı
 * daha sık bakım. Kilitlemek, kullanıcıyı şablonu hiç kullanmamaya iterdi.
 *
 * TOHUM ŞABLONLARDA `templateId` YOK (`id: null`): veritabanı henüz
 * tohumlanmamışsa şablon satırı yok ve olmayan bir kimliğe bağ kurulamaz.
 * Bu durumda ad/periyot yine kopyalanıyor — bağ kaybolur, bilgi kaybolmaz.
 *
 * "YAPILDI" ALANLARI BURADA YOK: son bakım tarihi ve maliyeti ayrı bir olay
 * ve ayrı bir formda. O tarih yasal denetimde sorulan şey; plan düzeltirken
 * yanlışlıkla değiştirilebilmemeli.
 */
export function MaintenanceForm({
  defaults,
  templates,
  cancelHref,
  submitLabel,
  stayOnSuccess,
  onSaved,
  onCreated,
  layout,
  onCancel,
}: {
  defaults?: MaintenanceFormDefaults;
  templates: MaintenanceTemplateOption[];
  cancelHref?: string;
  submitLabel: string;
  stayOnSuccess?: boolean;
  onSaved?: () => void;
  onCreated?: (id: string) => void;
  layout?: "page" | "modal";
  onCancel?: () => void;
}) {
  const t = useTranslations("app.maintenance");

  const [templateCode, setTemplateCode] = useState("");
  const [label, setLabel] = useState(defaults?.label ?? "");
  const [equipmentType, setEquipmentType] = useState(
    defaults?.equipmentType ?? "",
  );
  const [intervalDays, setIntervalDays] = useState(
    defaults?.intervalDays ?? 365,
  );

  const selected = templates.find((tpl) => tpl.code === templateCode);

  return (
    <ActionForm
      action={saveMaintenance}
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
      <input
        type="hidden"
        name="templateId"
        value={selected?.id ?? defaults?.templateId ?? ""}
      />

      <FormSection title={t("sectionWhat")} description={t("sectionWhatHint")}>
        {!defaults ? (
          <div className="sm:col-span-2">
            <FormField
              name="templateCode"
              label={t("templatePicker")}
              hint={t("templatePickerHint")}
            >
              <Select
                name="templateCode"
                value={templateCode}
                onChange={(event) => {
                  const code = event.target.value;
                  setTemplateCode(code);
                  const tpl = templates.find((entry) => entry.code === code);
                  if (tpl) {
                    setLabel(tpl.name);
                    setEquipmentType(tpl.equipmentType);
                    setIntervalDays(tpl.intervalDays);
                  }
                }}
              >
                <option value="">{t("templateNone")}</option>
                {templates.map((tpl) => (
                  <option key={tpl.code} value={tpl.code}>
                    {tpl.name}
                    {tpl.isMandatory ? ` · ${t("mandatory")}` : ""}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        ) : null}

        {selected?.isMandatory ? (
          <div className="sm:col-span-2">
            <Alert tone="warning">
              {selected.regulatoryNote ?? t("mandatoryNotice")}
            </Alert>
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <FormField name="label" label={t("labelField")} required>
            <Input
              name="label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              required
              minLength={3}
              maxLength={160}
              placeholder={t("labelPlaceholder")}
            />
          </FormField>
        </div>

        <FormField
          name="equipmentType"
          label={t("equipmentType")}
          hint={t("equipmentTypeHint")}
          required
        >
          <Input
            name="equipmentType"
            value={equipmentType}
            onChange={(event) => setEquipmentType(event.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
        </FormField>

        <FormField
          name="location"
          label={t("location")}
          hint={t("locationHint")}
        >
          <Input
            name="location"
            defaultValue={defaults?.location ?? ""}
            maxLength={120}
          />
        </FormField>
      </FormSection>

      <FormSection
        title={t("sectionSchedule")}
        description={t("sectionScheduleHint")}
      >
        <FormField
          name="intervalDays"
          label={t("intervalField")}
          hint={t("intervalFieldHint")}
          required
        >
          <Input
            name="intervalDays"
            type="number"
            min={1}
            max={3650}
            value={String(intervalDays)}
            onChange={(event) =>
              setIntervalDays(Number(event.target.value) || 1)
            }
            required
          />
        </FormField>

        <FormField
          name="nextDueAt"
          label={t("nextDueAt")}
          hint={t("nextDueAtHint")}
          required
        >
          <DateInput
            name="nextDueAt"
            defaultValue={defaults?.nextDueAt ?? today()}
            required
          />
        </FormField>

        <div className="sm:col-span-2">
          <Switch
            name="isActive"
            label={t("isActive")}
            description={t("isActiveHint")}
            defaultChecked={defaults?.isActive ?? true}
          />
        </div>

        <div className="sm:col-span-2">
          <FormField name="notes" label={t("notes")} hint={t("notesHint")}>
            <Textarea
              name="notes"
              defaultValue={defaults?.notes ?? ""}
              rows={3}
              maxLength={2000}
            />
          </FormField>
        </div>
      </FormSection>
    </ActionForm>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
