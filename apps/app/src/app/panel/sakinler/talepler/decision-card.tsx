"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Select, Textarea } from "@yonetim/ui";

import { ActionForm, FormField, SubmitButton } from "@/components/form/action-form";
import { approveAccessRequest, rejectAccessRequest } from "./actions";

export interface UnitOption {
  id: string;
  number: string;
  blockName: string | null;
}

/**
 * Bekleyen bir başvurunun karar kutusu.
 *
 * ONAY VE RED **AYRI FORM**, tek formda iki düğme değil: onayın zorunlu alanı
 * (daire) var, reddin yok. Tek formda birleştirilseydi reddetmek isteyen
 * yönetici, reddedeceği başvuru için önce bir daire seçmek zorunda kalırdı.
 *
 * RED KUTUSU KAPALI BAŞLIYOR: kuyruğun asıl işi onaylamak. Her satırda açık
 * duran bir gerekçe alanı, ekranı reddetmenin normal olduğu bir yer gibi
 * gösterirdi.
 */
export function DecisionCard({
  requestId,
  units,
  suggestedUnitId,
  claimedRelation,
}: {
  requestId: string;
  units: UnitOption[];
  /** Beyandan çıkan eşleşme — **öneri**, seçili gelmiyor değil, doğrulanıyor. */
  suggestedUnitId: string | null;
  claimedRelation: string;
}) {
  const t = useTranslations("app.accessRequests");
  const tCommon = useTranslations("common");
  const [rejecting, setRejecting] = useState(false);

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <ActionForm
        action={approveAccessRequest}
        submitLabel={t("approve")}
        footer={
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SubmitButton label={t("approve")} />
            <button
              type="button"
              onClick={() => setRejecting((open) => !open)}
              className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
            >
              {rejecting ? tCommon("action.cancel") : t("reject")}
            </button>
          </div>
        }
      >
        <input type="hidden" name="id" value={requestId} />

        <FormField name="unitId" label={t("unit")} hint={t("unitHint")}>
          {/*
            Ön seçim yok: `suggestedUnitId` yalnız etikette "önerilen" olarak
            işaretli. Seçili gelseydi yönetici doğrulamadan onaylayabilirdi ve
            beyan, kontrol edilmiş bir bilgi gibi kayda geçerdi.
          */}
          <Select name="unitId" defaultValue="" required>
            <option value="" disabled>
              {t("unitPlaceholder")}
            </option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.blockName ? `${unit.blockName} · ` : ""}
                {unit.number}
                {unit.id === suggestedUnitId ? ` — ${t("suggested")}` : ""}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField name="relation" label={t("relation")}>
          {/*
            Beyan varsayılan geliyor ama kilitli değil: malik olduğunu söyleyip
            kiracı çıkan başvuru olağan. Malik/kiracı ayrımı oy hakkını
            belirliyor (KMK md.31), bu yüzden karar yöneticinin.
          */}
          <Select
            name="relation"
            defaultValue={claimedRelation === "owner" ? "owner" : "tenant"}
          >
            <option value="owner">{t("relationOwner")}</option>
            <option value="tenant">{t("relationTenant")}</option>
          </Select>
        </FormField>
      </ActionForm>

      {rejecting ? (
        <ActionForm
          action={rejectAccessRequest}
          submitLabel={t("reject")}
          footer={
            <div className="mt-3">
              <SubmitButton label={t("rejectConfirm")} variant="danger" />
            </div>
          }
        >
          <input type="hidden" name="id" value={requestId} />
          <FormField
            name="rejectionReason"
            label={t("rejectionReason")}
            hint={t("rejectionReasonHint")}
          >
            <Textarea name="rejectionReason" rows={2} maxLength={500} />
          </FormField>
        </ActionForm>
      ) : null}
    </div>
  );
}
