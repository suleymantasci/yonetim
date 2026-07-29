import type { PollListResponse } from "@yonetim/contracts";

import type { PollFormDefaults } from "./poll-form";

/**
 * Liste satırı → form varsayılanları.
 *
 * Tek yerde, çünkü iki çağıran var (tam sayfa ve çekmece). Seçenekler
 * sözleşmede `unknown` olarak duruyor — `polls.options` JSONB ve şeması
 * sürüm boyunca değişebilir; burada beklenen biçime **savunmacı** biçimde
 * indirgeniyor, biçim değişirse form boş açılıyor ama patlamıyor.
 */
export function toPollDefaults(
  row: PollListResponse["rows"][number],
): PollFormDefaults {
  return {
    id: row.id,
    question: row.question,
    description: row.description,
    options: row.options
      .map((option) =>
        option && typeof option === "object" && "label" in option
          ? String((option as { label: unknown }).label)
          : "",
      )
      .filter((label) => label !== ""),
    weightMode: row.weightMode,
    quorumRule: row.quorumRule,
    visibility: row.visibility,
    allowMultiple: row.allowMultiple,
    ownersOnly: row.ownersOnly,
    opensAt: toDateInput(row.opensAt),
    closesAt: toDateInput(row.closesAt),
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
