import type { MaintenanceDetail } from "@yonetim/contracts";

import type { MaintenanceFormDefaults } from "./maintenance-form";

/**
 * `MaintenanceDetail` → form varsayılanları.
 *
 * Tek yerde, çünkü iki çağıran var: tam sayfa `/[id]/duzenle` ve çekmece
 * sürümü. Ayrı ayrı yazılsaydı, alan eklendiğinde birinin güncellenmemesi
 * sessiz veri kaybı olurdu.
 *
 * `lastDoneAt` ve `lastCostMinor` **taşınmıyor**: form onları göstermiyor
 * çünkü "yapıldı" ayrı bir olay ve ayrı bir formda.
 */
export function toMaintenanceDefaults(
  detail: MaintenanceDetail,
): MaintenanceFormDefaults {
  return {
    id: detail.id,
    templateId: detail.templateId,
    equipmentType: detail.equipmentType,
    label: detail.label,
    location: detail.location,
    intervalDays: detail.intervalDays,
    nextDueAt: toDateInput(detail.nextDueAt),
    isActive: detail.isActive,
    notes: detail.notes,
  };
}

/** İstanbul gününe göre kesiyor; `toISOString()` UTC'ye kaydırırdı. */
export function toDateInput(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
