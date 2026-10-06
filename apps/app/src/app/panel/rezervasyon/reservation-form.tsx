"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert, FormSection, Input, Select, Textarea } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import Link from "@/components/link";
import { createReservation } from "./actions";

export interface ReservationResourceOption {
  id: string;
  name: string;
  requiresApproval: boolean;
  openHour: number;
  closeHour: number;
  maxHoursPerBooking: number;
  capacity: number | null;
}

/**
 * Rezervasyon oluşturma formu.
 *
 * ÜCRET ALANI **YOK**. Ücret kaynağın tarifesinden ve süreden türüyor ve
 * sunucuda hesaplanıyor; forma koymak, aynı salonun iki sakine iki farklı
 * fiyata verilebilmesi demekti. Seçilen tesisin kuralları (saat aralığı,
 * azami süre) ekranda gösteriliyor ki kullanıcı reddedilecek bir aralık
 * girmeden önce görsün.
 *
 * DURUM ALANI DA YOK: onay gerekip gerekmediği kaynağın kuralı, formu
 * dolduranın tercihi değil.
 *
 * KİŞİ SEÇİMİ ZORUNLU — rezervasyon bir kişiye ait, daireye değil. Kiracı
 * taşındığında dairenin geçmiş rezervasyonları yeni sakine ait olmamalı.
 */
export function ReservationForm({
  resources,
  residents,
  units,
  cancelHref,
  submitLabel,
  stayOnSuccess,
  onCreated,
  layout,
  onCancel,
}: {
  resources: ReservationResourceOption[];
  residents: { id: string; name: string }[];
  units: { id: string; number: string; blockName: string | null }[];
  cancelHref?: string;
  submitLabel: string;
  stayOnSuccess?: boolean;
  onCreated?: (id: string) => void;
  layout?: "page" | "modal";
  onCancel?: () => void;
}) {
  const t = useTranslations("app.reservations");

  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "");
  const resource = resources.find((r) => r.id === resourceId);

  if (resources.length === 0) {
    return (
      <Alert
        tone="warning"
        action={
          <Link
            href="/panel/rezervasyon/tesis/yeni"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            {t("noResourcesAction")}
          </Link>
        }
      >
        {t("noResourcesYet")}
      </Alert>
    );
  }

  return (
    <ActionForm
      action={createReservation}
      submitLabel={submitLabel}
      cancelHref={cancelHref}
      stayOnSuccess={stayOnSuccess}
      layout={layout}
      onCancel={onCancel}
      onSuccess={(state) => {
        if (state.data?.id) onCreated?.(state.data.id);
      }}
    >
      <FormSection title={t("bookingSection")} description={t("bookingSectionHint")}>
        <FormField name="resourceId" label={t("resource")} required>
          <Select
            name="resourceId"
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
            required
          >
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          name="guestCount"
          label={t("guestCount")}
          hint={
            resource?.capacity
              ? t("guestCountHintCapacity", { capacity: resource.capacity })
              : t("guestCountHint")
          }
          required
        >
          <Input
            name="guestCount"
            type="number"
            min={1}
            max={resource?.capacity || 1000}
            defaultValue="1"
            required
          />
        </FormField>

        {resource ? (
          <div className="sm:col-span-2">
            <Alert tone="info">
              {t("resourceRules", {
                open: String(resource.openHour).padStart(2, "0"),
                close: String(resource.closeHour).padStart(2, "0"),
                hours: resource.maxHoursPerBooking,
              })}
              {resource.requiresApproval
                ? ` ${t("resourceNeedsApproval")}`
                : ` ${t("resourceAutoApproved")}`}
            </Alert>
          </div>
        ) : null}

        <FormField name="startAt" label={t("startAt")} required>
          <Input name="startAt" type="datetime-local" required />
        </FormField>

        <FormField name="endAt" label={t("endAt")} required>
          <Input name="endAt" type="datetime-local" required />
        </FormField>
      </FormSection>

      <FormSection title={t("holderSection")} description={t("holderSectionHint")}>
        <FormField name="userId" label={t("holder")} required>
          <Select name="userId" defaultValue="" required>
            <option value="">{t("holderPlaceholder")}</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField name="unitId" label={t("unit")} hint={t("unitHint")}>
          <Select name="unitId" defaultValue="">
            <option value="">{t("unitNone")}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.blockName ? `${u.blockName} / ${u.number}` : u.number}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="sm:col-span-2">
          <FormField name="note" label={t("note")} hint={t("noteHint")}>
            <Textarea name="note" rows={3} maxLength={1000} />
          </FormField>
        </div>
      </FormSection>
    </ActionForm>
  );
}
