import type { MeetingListResponse } from "@yonetim/contracts";

import type { MeetingFormDefaults } from "./meeting-form";

/**
 * Liste satırı → form varsayılanları.
 *
 * Gündem sözleşmede `unknown[]` (JSONB); burada savunmacı biçimde metne
 * indirgeniyor. Biçim değişirse gündem boş açılır ama ekran patlamaz.
 */
export function toMeetingDefaults(
  row: MeetingListResponse["rows"][number],
): MeetingFormDefaults {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    scheduledAt: toDateInput(row.scheduledAt),
    secondCallAt: row.secondCallAt ? toDateInput(row.secondCallAt) : null,
    location: row.location,
    onlineUrl: row.onlineUrl,
    agenda: row.agenda
      .map((item) =>
        typeof item === "string"
          ? item
          : item && typeof item === "object" && "title" in item
            ? String((item as { title: unknown }).title)
            : "",
      )
      .filter((item) => item !== ""),
    status: row.status,
    minutesUrl: row.minutesUrl,
  };
}

/** İstanbul gününe göre kesiyor; `toISOString()` UTC'ye kaydırırdı. */
function toDateInput(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
