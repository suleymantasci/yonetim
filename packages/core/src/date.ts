/** Europe/Istanbul sabit UTC+3 — yaz saati uygulaması 2016'da kaldırıldı. */
export const TR_UTC_OFFSET_MINUTES = 180;

export interface Period {
  year: number;
  /** 1-12 */
  month: number;
}

export function currentPeriod(now: Date = new Date()): Period {
  const tr = toIstanbul(now);
  return { year: tr.getUTCFullYear(), month: tr.getUTCMonth() + 1 };
}

/** UTC tarihi İstanbul saatine kaydırılmış "sahte UTC" Date olarak döner. */
export function toIstanbul(date: Date): Date {
  return new Date(date.getTime() + TR_UTC_OFFSET_MINUTES * 60_000);
}

/** İstanbul yerel saatinden gerçek UTC Date üretir. */
export function fromIstanbul(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute) - TR_UTC_OFFSET_MINUTES * 60_000,
  );
}

export function periodKey(p: Period): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

export function parsePeriodKey(key: string): Period | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(m[1]), month };
}

export function addMonths(p: Period, delta: number): Period {
  const total = p.year * 12 + (p.month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function comparePeriods(a: Period, b: Period): number {
  return a.year - b.year || a.month - b.month;
}

export function daysInMonth(p: Period): number {
  return new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
}

/** Vade tarihi: dönem + ayın N'i. Ay o güne sahip değilse ayın son günü. */
export function dueDateFor(p: Period, dayOfMonth: number): Date {
  const day = Math.min(dayOfMonth, daysInMonth(p));
  return fromIstanbul(p.year, p.month, day, 23, 59);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * Tarihe takvim ayı ekler. Ay sonu taşmasında ayın son gününe sabitlenir:
 * 31 Ocak + 1 ay = 28/29 Şubat (JS'nin varsayılanı 3 Mart'a kayardı ve
 * abonelik dönemi bir sonraki ayın içine taşardı).
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Istanbul",
});
const dateTimeFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Istanbul",
});

export function formatDate(date: Date): string {
  return dateFmt.format(date);
}

export function formatDateTime(date: Date): string {
  return dateTimeFmt.format(date);
}

export const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

export function formatPeriod(p: Period): string {
  return `${TR_MONTHS[p.month - 1]} ${p.year}`;
}

/**
 * Bildirim gönderim saati uygun mu? (SPEC Bölüm 8.1)
 * 22:00-08:00 arası acil olmayan bildirimler sabah 09:00'a ertelenir.
 */
export function nextAllowedSendTime(
  now: Date,
  opts: { urgent: boolean; quietStart: number; quietEnd: number; deferHour: number },
): Date {
  if (opts.urgent) return now;
  const tr = toIstanbul(now);
  const hour = tr.getUTCHours();
  const inQuiet =
    opts.quietStart > opts.quietEnd
      ? hour >= opts.quietStart || hour < opts.quietEnd
      : hour >= opts.quietStart && hour < opts.quietEnd;
  if (!inQuiet) return now;
  const dayShift = hour >= opts.quietStart ? 1 : 0;
  const base = new Date(tr.getTime() + dayShift * 86_400_000);
  return fromIstanbul(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate(),
    opts.deferHour,
    0,
  );
}
