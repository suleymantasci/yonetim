"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { siteConfig } from "@yonetim/config";
import {
  Alert,
  FormSection,
  Input,
  MoneyInput,
  Select,
  Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveRequest } from "./actions";

const CATEGORIES = [
  "asansor",
  "su",
  "elektrik",
  "dogalgaz",
  "ortak_alan",
  "guvenlik",
  "temizlik",
  "hasere",
  "diger",
] as const;

const PRIORITIES = ["critical", "high", "normal", "low"] as const;

export interface RequestFormDefaults {
  id: string;
  unitId: string | null;
  category: string;
  title: string;
  description: string | null;
  priority: string;
  assignedToUserId: string | null;
  costKurus: number;
}

/**
 * Talep/arıza formu.
 *
 * DURUM ALANI **YOK**. Durum geçişi ayrı bir uçta, çünkü geçişin yan etkileri
 * (ilk yanıt/çözüm/kapanış zamanı) formun kaydettiği alanlar değil, geçişin
 * ürettiği izler. Buraya bir `<select>` koymak o izleri form alanına
 * çevirirdi ve geçmişe dönük tarihle SLA ölçümü anlamsızlaştırılabilirdi.
 *
 * ÖNCELİK SEÇİMİ SLA SÖZÜNÜ GÖSTERİYOR: yönetici "kritik" derken kaç saatlik
 * bir söz verdiğini seçtiği anda görüyor. Rakamlar `siteConfig.sla`'dan
 * geliyor — vadeyi sunucu da aynı kaynaktan hesaplıyor, iki yerde iki farklı
 * sayı olamaz.
 */
export function RequestForm({
  defaults,
  units,
  assignees,
  canAssign,
  cancelHref,
  submitLabel,
  stayOnSuccess,
  onSaved,
  onCreated,
  layout,
  onCancel,
}: {
  defaults?: RequestFormDefaults;
  units: { id: string; number: string; blockName: string | null }[];
  assignees: { id: string; name: string; role: string }[];
  canAssign: boolean;
  cancelHref?: string;
  submitLabel: string;
  stayOnSuccess?: boolean;
  onSaved?: () => void;
  onCreated?: (id: string) => void;
  layout?: "page" | "modal";
  onCancel?: () => void;
}) {
  return (
    <ActionForm
      action={saveRequest}
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
      <RequestRecordFields
        defaults={defaults}
        units={units}
        assignees={canAssign ? assignees : undefined}
      />
    </ActionForm>
  );
}

/**
 * Talebin kayıt alanları — yeni talep formu ve detay sayfasındaki tek form
 * aynı alanları kullanır. `assignees` verilmezse görevli alanı çizilmez
 * (detayda atama "Durum ve atama" bölümünde).
 */
export function RequestRecordFields({
  defaults,
  units,
  assignees,
}: {
  defaults?: Omit<RequestFormDefaults, "id"> & { id?: string };
  units: { id: string; number: string; blockName: string | null }[];
  assignees?: { id: string; name: string; role: string }[];
}) {
  const t = useTranslations("app.requests");
  const tEnum = useTranslations("enum");

  const [priority, setPriority] = useState(defaults?.priority ?? "normal");
  const slaHours =
    siteConfig.sla[priority as keyof typeof siteConfig.sla]?.hours ??
    siteConfig.sla.normal.hours;

  return (
    <>

      <FormSection title={t("sectionWhat")} description={t("sectionWhatHint")}>
        <div className="sm:col-span-2">
          <FormField name="title" label={t("subject")} required>
            <Input
              name="title"
              defaultValue={defaults?.title}
              required
              minLength={3}
              maxLength={200}
              placeholder={t("subjectPlaceholder")}
            />
          </FormField>
        </div>

        <FormField name="category" label={t("category")} required>
          <Select
            name="category"
            defaultValue={defaults?.category ?? "diger"}
            required
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tEnum(`requestCategory.${c}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField name="unitId" label={t("unit")} hint={t("unitHint")}>
          <Select name="unitId" defaultValue={defaults?.unitId ?? ""}>
            <option value="">{t("unitCommonArea")}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.blockName ? `${u.blockName} / ${u.number}` : u.number}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="sm:col-span-2">
          <FormField
            name="description"
            label={t("descriptionField")}
            hint={t("descriptionFieldHint")}
          >
            <Textarea
              name="description"
              defaultValue={defaults?.description ?? ""}
              rows={4}
              maxLength={4000}
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection
        title={t("sectionHandling")}
        description={t("sectionHandlingHint")}
      >
        <FormField name="priority" label={t("priority")} required>
          <Select
            name="priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            required
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {tEnum(`requestPriority.${p}`)}
              </option>
            ))}
          </Select>
        </FormField>

        {assignees ? (
          <FormField
            name="assignedToUserId"
            label={t("assignee")}
            hint={t("assigneeHint")}
          >
            <Select
              name="assignedToUserId"
              defaultValue={defaults?.assignedToUserId ?? ""}
            >
              <option value="">{t("assigneeNone")}</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {tEnum(`role.${a.role}`)}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}

        <div className="sm:col-span-2">
          <Alert tone={priority === "critical" ? "warning" : "info"}>
            {t("slaPromise", { hours: slaHours })}
          </Alert>
        </div>

        <FormField name="costKurus" label={t("cost")} hint={t("costHint")}>
          <MoneyInput
            name="costKurus"
            defaultKurus={defaults?.costKurus ?? 0}
          />
        </FormField>
      </FormSection>
    </>
  );
}
