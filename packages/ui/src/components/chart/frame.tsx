"use client";

import { ChartColumnBig, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "../../cn";
import { seriesColor, type Series } from "./palette";

/**
 * Grafik çerçevesi ve erişilebilir eşdeğeri — GAP 4.3.4.
 *
 * Bu dosya **Recharts'a bağımlı değildir** ve öyle kalmalıdır. Gerekçe:
 * grafik motoru `ssr:false` ile yükleniyor; JS gelmeden ya da hiç gelmezse
 * ekranda kalan tek doğru kaynak buradaki tablodur. Motoru buraya sızdırmak,
 * "veri okunabilir kalsın" garantisini motorun yüklenmesine bağlamak olurdu.
 *
 * ZORUNLU KURALLAR (dataviz yöntemi) — motor değişse de değişmez:
 * - **Tek eksen.** İki farklı ölçekli ölçü asla aynı grafikte iki y ekseninde
 *   gösterilmez; gelir-gider gibi çiftler aynı birimde (kuruş) olduğu için
 *   tek eksende çizilir.
 * - Renk **seriye** bağlıdır, sıralamaya değil: `seriesIndex` sabit kalır.
 * - 2+ seride lejant her zaman vardır → kimlik asla yalnız renkle taşınmaz.
 * - Her grafik `ChartFrame` içinde gelir; çerçeve **tablo görünümünü zorunlu
 *   tutar** (açık temada 3 seri rengi 3:1 kontrastın altında — "relief" kuralı)
 *   ve aynı tablo ekran okuyucu için tek doğru kaynaktır.
 * - Izgara ve eksenler geri planda (`text-fg-subtle`, ince çizgi).
 */

export interface ChartFrameProps {
  title: string;
  description?: string;
  /** X ekseni etiketleri — tablo görünümünde satır başlığı olur. */
  labels: string[];
  series: Series[];
  /** Değerleri okunur metne çevirir (para, yüzde). */
  formatValue: (value: number) => string;
  labelsHeader: string;
  tableToggleLabel: string;
  chartToggleLabel: string;
  emptyText: string;
  children: ReactNode;
  action?: ReactNode;
  /** Grafiğin altında kalan açıklama satırı (varsayım, kaynak, uyarı). */
  footnote?: ReactNode;
  /** Tabloda sütun toplamı satırı — yalnız toplanabilir ölçülerde anlamlı. */
  totalLabel?: string;
  className?: string;
}

/**
 * Grafik çerçevesi: başlık, lejant, grafik/tablo geçişi.
 * Tablo yalnız bir "ek" değil; grafiğin erişilebilir eşdeğeri.
 */
export function ChartFrame({
  title,
  description,
  labels,
  series,
  formatValue,
  labelsHeader,
  tableToggleLabel,
  chartToggleLabel,
  emptyText,
  children,
  action,
  footnote,
  totalLabel,
  className,
}: ChartFrameProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const empty = series.length === 0 || labels.length === 0;

  return (
    <figure
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm",
        className,
      )}
    >
      {/*
       * `flex-wrap` DEĞİL: uzun bir açıklama başlık bloğunu genişletince
       * görünüm anahtarı alt satıra düşüyor ve `justify-between` onu sola
       * yaslıyordu — aynı ızgaradaki iki kartın anahtarı iki farklı yerde
       * duruyordu. Başlık bloğu `min-w-0 flex-1` ile daralır, anahtar
       * `shrink-0` ile hep sağ üstte kalır.
       */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <figcaption className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight text-fg">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{description}</p>
          ) : null}
        </figcaption>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <ViewSwitch
            view={view}
            onChange={setView}
            chartLabel={chartToggleLabel}
            tableLabel={tableToggleLabel}
          />
        </div>
      </div>

      {/* Lejant: 2+ seride her zaman. Tek seride başlık zaten seriyi adlandırır. */}
      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-1.5 px-4 pb-3">
          {series.map((item, index) => (
            <li
              key={item.key}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-fg-muted"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: seriesColor(index) }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex-1 px-4 pb-4">
        {empty ? (
          <p className="py-12 text-center text-sm text-fg-subtle">{emptyText}</p>
        ) : view === "table" ? (
          <ChartTable
            labels={labels}
            series={series}
            formatValue={formatValue}
            labelsHeader={labelsHeader}
            totalLabel={totalLabel}
          />
        ) : (
          children
        )}
      </div>

      {footnote ? (
        <div className="border-t border-border bg-surface-sunken px-4 py-2 text-[11px] leading-relaxed text-fg-subtle">
          {footnote}
        </div>
      ) : null}
    </figure>
  );
}

/**
 * Grafik ↔ tablo anahtarı.
 *
 * Tek bir "değiştir" düğmesi yerine iki durumlu bir grup: kullanıcı hangi
 * görünümde olduğunu düğmenin **yazısından** değil basılı durumundan okur.
 * Tek düğmeli sürümde etiket ("Tablo olarak") hedefi mi mevcut durumu mu
 * söylediği belirsizdi.
 */
function ViewSwitch({
  view,
  onChange,
  chartLabel,
  tableLabel,
}: {
  view: "chart" | "table";
  onChange: (next: "chart" | "table") => void;
  chartLabel: string;
  tableLabel: string;
}) {
  const item = (active: boolean) =>
    cn(
      "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg",
    );

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-sunken p-0.5">
      <button
        type="button"
        onClick={() => onChange("chart")}
        aria-pressed={view === "chart"}
        title={chartLabel}
        className={item(view === "chart")}
      >
        <ChartColumnBig aria-hidden className="h-4 w-4" />
        <span className="sr-only">{chartLabel}</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("table")}
        aria-pressed={view === "table"}
        title={tableLabel}
        className={item(view === "table")}
      >
        <Table2 aria-hidden className="h-4 w-4" />
        <span className="sr-only">{tableLabel}</span>
      </button>
    </div>
  );
}

export function ChartTable({
  labels,
  series,
  formatValue,
  labelsHeader,
  totalLabel,
}: {
  labels: string[];
  series: Series[];
  formatValue: (value: number) => string;
  labelsHeader: string;
  totalLabel?: string;
}) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-border">
      {/*
       * `border-separate`: yapışkan başlık toplu kenarlık modelinde alt
       * çizgisini kaybediyor — kenarlık tabloya ait olduğu için hücreyle
       * birlikte hareket etmiyor (landing'de aynı hata ölçülmüştü).
       */}
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-fg-subtle">
            <th
              scope="col"
              className="sticky top-0 z-10 border-b border-border bg-surface-sunken px-3 py-2 font-medium"
            >
              {labelsHeader}
            </th>
            {series.map((item, index) => (
              <th
                key={item.key}
                scope="col"
                className="sticky top-0 z-10 border-b border-border bg-surface-sunken px-3 py-2 text-right font-medium"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: seriesColor(index) }}
                  />
                  {item.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, row) => (
            <tr key={label + row} className="even:bg-surface-sunken/40">
              <th
                scope="row"
                className="border-b border-border px-3 py-2 text-left font-medium text-fg last:border-0"
              >
                {label}
              </th>
              {series.map((item) => (
                <td
                  key={item.key}
                  className="border-b border-border px-3 py-2 text-right tabular-nums text-fg"
                >
                  {formatValue(item.values[row] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totalLabel ? (
          <tfoot>
            <tr>
              <th
                scope="row"
                className="sticky bottom-0 border-t border-border bg-surface-sunken px-3 py-2 text-left font-semibold text-fg"
              >
                {totalLabel}
              </th>
              {series.map((item) => (
                <td
                  key={item.key}
                  className="sticky bottom-0 border-t border-border bg-surface-sunken px-3 py-2 text-right font-semibold tabular-nums text-fg"
                >
                  {formatValue(item.values.reduce((sum, value) => sum + value, 0))}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
