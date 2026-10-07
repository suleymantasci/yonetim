/**
 * Demo zaman çizelgesi — İstanbul saati (UTC+3, 2016'dan beri yaz saati yok).
 *
 * Bütün tarihler `now`'a göreli: demo bugün açılsa da bir yıl sonra açılsa da
 * "son 12 ayın aidatı", "geçen ayki bakım", "yarın gelecek kargo" hep aynı
 * yerde durur.
 */
const OFFSET_MS = 3 * 3_600_000;
export const DAY_MS = 86_400_000;

export interface Period {
  year: number;
  month: number;
}

export function istanbul(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - OFFSET_MS);
}

export function periodOf(date: Date): Period {
  const local = new Date(date.getTime() + OFFSET_MS);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1 };
}

export function addMonths(p: Period, delta: number): Period {
  const index = p.year * 12 + (p.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function periodKey(p: Period): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

export function daysInMonth(p: Period): number {
  return new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Verilen anın İstanbul takvim gününde, belirtilen saat. */
export function atLocalHour(date: Date, hour: number): Date {
  const local = new Date(date.getTime() + OFFSET_MS);
  return istanbul(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), hour);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

export function monthLabel(p: Period): string {
  return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
}
