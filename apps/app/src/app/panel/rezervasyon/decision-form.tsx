"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Select, Textarea } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { decideReservation } from "./actions";

const DECISIONS = [
  "approved",
  "rejected",
  "cancelled",
  "completed",
  "no_show",
] as const;

/** Gerekçe beklenen kararlar — "reddedildi" tek başına bir cevap değil. */
const REASON_EXPECTED = new Set(["rejected", "cancelled", "no_show"]);

/**
 * Rezervasyon kararı — onay / ret / iptal / tamamlandı / gelmedi.
 *
 * Beş seçenek tek `<select>`'te çünkü hepsi aynı soruya cevap: "bu talep ne
 * oldu". Ayrı düğmelere bölmek, nadir olanları (gelmedi, tamamlandı) ya
 * gizlerdi ya da beş düğmelik bir sıra üretirdi.
 *
 * Gerekçe alanı yalnız gerektiğinde açılıyor: her karar için sormak,
 * onaylarken boş geçilen ve bu yüzden ret gerekçelerinde de boş bırakılan bir
 * alan üretirdi.
 */
export function ReservationDecisionForm({
  reservationId,
  currentStatus,
  submitLabel,
  onDone,
}: {
  reservationId: string;
  currentStatus: string;
  submitLabel: string;
  onDone?: () => void;
}) {
  const t = useTranslations("app.reservations");
  const tEnum = useTranslations("enum");

  const [decision, setDecision] = useState(
    currentStatus === "pending" ? "approved" : currentStatus,
  );

  return (
    <ActionForm
      action={decideReservation}
      submitLabel={submitLabel}
      stayOnSuccess
      onSuccess={onDone}
    >
      <input type="hidden" name="id" value={reservationId} />

      <FormField name="decision" label={t("decision")} required>
        <Select
          name="decision"
          value={decision}
          onChange={(event) => setDecision(event.target.value)}
          required
        >
          {DECISIONS.map((d) => (
            <option key={d} value={d}>
              {tEnum(`reservationStatus.${d}`)}
            </option>
          ))}
        </Select>
      </FormField>

      {REASON_EXPECTED.has(decision) ? (
        <FormField name="reason" label={t("reason")} hint={t("reasonHint")}>
          <Textarea name="reason" rows={3} maxLength={1000} />
        </FormField>
      ) : null}
    </ActionForm>
  );
}
