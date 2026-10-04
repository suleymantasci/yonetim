import { Badge } from "@yonetim/ui";

const DAY_MS = 86_400_000;

/**
 * Bitiş tarihine kalan gün — gün sınırına yukarı yuvarlanmış.
 *
 * Yarın öğlen biten süre "1 gün"; bugün akşam biten "0" (bugün bitiyor);
 * geçmiş tarih negatif. Platform listelerinin hepsi aynı hesabı kullanıyor ki
 * aynı site iki ekranda farklı kalan süre göstermesin.
 */
export function daysUntil(
  until: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!until) return null;
  const end = until instanceof Date ? until.getTime() : Date.parse(until);
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - now.getTime()) / DAY_MS);
}

export function RemainingBadge({
  until,
  labels,
}: {
  until: Date | string | null | undefined;
  labels: { daysLeft: (days: number) => string; daysOverdue: (days: number) => string; endsToday: string; none: string };
}) {
  const days = daysUntil(until);
  if (days === null) return <span className="text-xs text-fg-subtle">{labels.none}</span>;
  if (days < 0) return <Badge tone="danger">{labels.daysOverdue(-days)}</Badge>;
  if (days === 0) return <Badge tone="danger">{labels.endsToday}</Badge>;
  return <Badge tone={days <= 7 ? "warning" : "neutral"}>{labels.daysLeft(days)}</Badge>;
}
