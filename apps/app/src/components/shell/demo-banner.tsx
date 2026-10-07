"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Demo şeridi — kalan süre her dakika yenilenir.
 *
 * Metinler sunucudan hazır geliyor (`{time}` yer tutucusuyla); burada yalnız
 * süre hesaplanıyor. Süre dolduğunda şerit "birazdan silinecek" metnine
 * dönüyor — silme 10 dakikalık bakım turunda gerçekleşiyor.
 */
export function DemoBanner({
  expiresAt,
  labels,
  ctaHref,
}: {
  expiresAt: string;
  labels: { template: string; ended: string; noSend: string; cta: string; hours: string; minutes: string };
  ctaHref: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const left = new Date(expiresAt).getTime() - now;
  const totalMinutes = Math.max(0, Math.floor(left / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const time = hours > 0 ? `${hours} ${labels.hours} ${minutes} ${labels.minutes}` : `${minutes} ${labels.minutes}`;
  const text = left <= 0 ? labels.ended : labels.template.replace("{time}", time);

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-info-border bg-info-soft px-4 py-2 text-sm text-info-fg"
    >
      <span className="flex min-w-0 items-center gap-2 font-semibold">
        <Clock aria-hidden className="h-4 w-4 shrink-0" />
        <span className="min-w-0">{text}</span>
        <span className="hidden font-normal opacity-80 md:inline">· {labels.noSend}</span>
      </span>
      <a
        href={ctaHref}
        className="shrink-0 rounded-lg border border-info-border bg-surface px-3 py-1 text-xs font-bold text-fg hover:bg-hover"
      >
        {labels.cta}
      </a>
    </div>
  );
}
