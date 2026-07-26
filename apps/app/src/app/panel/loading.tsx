import { Skeleton, SkeletonStats, SkeletonTable } from "@yonetim/ui";

/**
 * Panel yükleme iskeleti — GAP 4.6.2.
 *
 * Modül sayfaları çoğunlukla "başlık + özet kartları + tablo" düzeninde
 * olduğu için tek bir jenerik iskelet yeterli; sayfaya özel iskelet ancak
 * düzen belirgin şekilde farklıysa yazılır (örn. takvim, sohbet).
 */
export default function PanelLoading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="mb-6">
        <SkeletonStats />
      </div>
      <SkeletonTable />
    </div>
  );
}
