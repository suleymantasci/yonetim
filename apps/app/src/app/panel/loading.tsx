import { DashboardSkeleton } from "@/components/page-skeletons";

/**
 * Panel yükleme iskeleti — GAP 4.6.2.
 *
 * Bu iskelet kontrol panelinin düzenini taşıyor (KPI şeridi + kart üçlüsü +
 * grafik ızgarası). Liste ekranlarının kendi `loading.tsx`'i var; kendi
 * iskeleti olmayan modül sayfaları hafif ve neredeyse anında geliyor.
 */
export default function PanelLoading() {
  return <DashboardSkeleton />;
}
