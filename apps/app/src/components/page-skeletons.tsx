import { Skeleton, SkeletonStats } from "@yonetim/ui";

/**
 * Sayfa iskeletleri — GAP 4.6.2, UI Faz 2.4.
 *
 * NEDEN SAYFA BAŞINA İSKELET: panelin tek jenerik iskeleti her sayfaya
 * "başlık + dört kart + tablo" çiziyordu. Kontrol panelinde tablo yok,
 * altı grafik var; liste ekranlarında ise grafik yok, araç çubuğu var.
 * Yanlış şekilli bir iskelet beklemeyi kısaltmıyor, **düzen atlaması**
 * (CLS) üretiyor: kullanıcı bir düzen görüp bir başkasına geçiyor.
 *
 * İskeletler `aria-hidden` (bkz. `Skeleton`): ekran okuyucu için doğru
 * bildirim `loading.tsx`'in kendisi değil, sayfanın gelmesidir.
 */

function PageTitleSkeleton() {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-10 w-36" />
    </div>
  );
}

/** Liste ekranları: araç çubuğu + tablo satırları + sayfalama. */
export function ListPageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div>
      <PageTitleSkeleton />

      <div className="mb-4 flex flex-wrap gap-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-[var(--row-py)]">
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
    </div>
  );
}

/** Kontrol paneli: KPI şeridi + kart üçlüsü + grafik ızgarası. */
export function DashboardSkeleton() {
  return (
    <div>
      <PageTitleSkeleton />

      <SkeletonStats />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-3/4" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[260, 220, 220, 220].map((height, index) => (
          <div
            key={index}
            className={`rounded-xl border border-border bg-surface p-4 shadow-sm ${
              index === 0 ? "xl:col-span-2" : ""
            }`}
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-1.5 h-3 w-64 max-w-full" />
            {/* Yükseklik grafiğinkiyle aynı: iskelet çıkınca sayfa zıplamasın. */}
            <Skeleton className="mt-4 w-full" style={{ height }} />
          </div>
        ))}
      </div>
    </div>
  );
}
