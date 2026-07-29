import type { StaffDetail } from "@yonetim/contracts";

import type { StaffFormDefaults } from "./staff-form";

/**
 * `StaffDetail` → form varsayılanları.
 *
 * TEK YERDE, ÇÜNKÜ İKİ ÇAĞIRAN VAR: tam sayfa `/[id]/duzenle` ve çekmece
 * sürümü. İkisinde ayrı ayrı yazılsaydı, alan eklendiğinde birinin
 * güncellenmemesi sessiz bir veri kaybı olurdu — form gönderilen alanı
 * "boş" sayıp mevcut değeri ezerdi.
 *
 * Tarihler `<input type="date">` için **İstanbul gününe** göre kesiliyor.
 * `toISOString()` UTC'ye çevirdiği için 00:00+03:00 olarak saklanan bir gün
 * bir önceki güne kayardı; form.ts girişte aynı ofseti uyguluyor, bu çıkışta.
 */
export function toStaffDefaults(detail: StaffDetail): StaffFormDefaults {
  return {
    id: detail.id,
    fullName: detail.fullName,
    role: detail.role,
    phone: detail.phone,
    grossSalaryKurus: detail.grossSalaryMinor,
    netSalaryKurus: detail.netSalaryMinor,
    sgkPremiumKurus: detail.sgkPremiumMinor,
    startedAt: toDateInput(detail.startedAt),
    endedAt: detail.endedAt ? toDateInput(detail.endedAt) : null,
    annualLeaveDays: detail.annualLeaveDays,
    usedLeaveDays: detail.usedLeaveDays,
    advanceBalanceKurus: detail.advanceBalanceMinor,
    hasTckn: detail.hasTckn,
    hasIban: detail.hasIban,
  };
}

function toDateInput(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
