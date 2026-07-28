import { Sparkline } from "@yonetim/ui";

/**
 * Daire özeti satırındaki bakiye trendi — rakip incelemesi §4.3.
 *
 * `Sparkline` **düz seriyi bilinçli olarak çizmiyor** (bkz. bileşenin kendi
 * notu: sabit değerde çıkan şey trend değil cetvel). Tablo hücresinde bu
 * `null` boş bir kutu bırakırdı; "bu daire için veri yok mu, yoksa ekran mı
 * bozuk?" sorusunu doğuruyordu. Bu yüzden düz/eksik seri açıkça yazıyla
 * söyleniyor.
 *
 * Renk **tek başına anlam taşımıyor**: yön bilgisi `aria-label` içindeki
 * metinde de var, kırmızı çizgiyi ayırt edemeyen kullanıcı da okuyabiliyor.
 *
 * Sunucu bileşeni: `Sparkline` tek bir `<svg>`; JS gelmeden de doğru görünür.
 */
export function UnitTrendCell({
  values,
  label,
  emptyLabel,
}: {
  /** Eskiden yeniye sıralı, kuruş (`unitDebtSummaryRow.trendMinor`). */
  readonly values: readonly number[];
  readonly label: string;
  readonly emptyLabel: string;
}) {
  const series = [...values];
  const flat = series.length < 2 || new Set(series).size === 1;

  if (flat) {
    return <span className="text-xs text-fg-subtle">{emptyLabel}</span>;
  }

  // Borcun **artması** kötü haber; sparkline'ın tonu bu yönü izliyor.
  const rising = series[series.length - 1]! > series[0]!;

  return (
    <Sparkline
      values={series}
      height={24}
      className="w-24"
      area={false}
      tone={rising ? "danger" : "success"}
      label={label}
    />
  );
}
