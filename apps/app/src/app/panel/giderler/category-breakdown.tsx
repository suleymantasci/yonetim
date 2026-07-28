import { seriesColor } from "@yonetim/ui";

/**
 * Kategori kırılımı — doğrudan etiketli yatay sütun.
 *
 * NEDEN RECHARTS DEĞİL (UI planı §2.2'den bilinçli sapma): plan bu listeyi
 * "gerçek yatay sütuna" çevirmeyi yazıyordu. Recharts'a çevirmeyi denemek
 * üç şeyi geri götürüyordu ve üçü de bu panonun asıl işiydi:
 *
 *  1. **Kategori adları eksene sıkışıyor.** "Asansör bakım ve onarım" gibi
 *     adlar 168px'lik kategori ekseninde kırpılıyor; burada adın tamamı
 *     çubuğun üstünde, kendi satırında duruyor.
 *  2. **Tutar her satırda yazılı.** Recharts'ta değer ancak tooltip'te ya da
 *     `LabelList` ile geliyor; ikisi de dokunmatik ekranda ya kayboluyor ya
 *     çakışıyor. Burada tutar ve pay her zaman görünür.
 *  3. **Motor gerekmiyor.** Bu blok sunucuda render ediliyor; grafik motoru
 *     için `ssr:false` sınırı açmak, tek sayfada 95 kB'ı yalnız bu kırılım
 *     için ödemek demekti.
 *
 * Kimlik yalnız renkle taşınmıyor (açık temada bazı seri renkleri 3:1'in
 * altında) — ad, tutar ve yüzde payı yazıyla da veriliyor.
 */
export function CategoryBreakdown({
  rows,
  emptyText,
  shareLabel,
}: {
  rows: { name: string; amountKurus: number; amountLabel: string }[];
  emptyText: string;
  /** Ekran okuyucuya "toplamın payı" bağlamı — görsel olarak yalnız % yazılı. */
  shareLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-fg-subtle">{emptyText}</p>;
  }

  const max = Math.max(...rows.map((row) => row.amountKurus), 1);
  const total = rows.reduce((sum, row) => sum + row.amountKurus, 0);

  return (
    <ul className="space-y-3.5">
      {rows.map((row, index) => {
        const share = total > 0 ? row.amountKurus / total : 0;
        return (
          <li key={row.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-baseline gap-2">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 translate-y-px rounded-full"
                  style={{ backgroundColor: seriesColor(index) }}
                />
                <span className="min-w-0 truncate text-fg">{row.name}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="text-xs tabular-nums text-fg-subtle">
                  <span className="sr-only">{shareLabel} </span>
                  {(share * 100).toFixed(0)}%
                </span>
                <span className="font-semibold tabular-nums text-fg">{row.amountLabel}</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken">
              <div
                aria-hidden
                className="h-full rounded-full"
                style={{
                  width: `${(row.amountKurus / max) * 100}%`,
                  backgroundColor: seriesColor(index),
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
