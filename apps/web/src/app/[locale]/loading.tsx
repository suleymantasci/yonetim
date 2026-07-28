import { Skeleton, SkeletonText } from "@yonetim/ui";

/**
 * Sayfa geçişlerinde görünen iskelet.
 *
 * Pazarlama sayfalarının çoğu statik (SSG) ve anında geliyor; bu iskelet
 * yalnız veri çeken route'larda (kiracı landing'i, fiyat hesaplama) görünür.
 * Boş bir ekran yerine sayfanın kabaca şeklini göstermek, algılanan bekleme
 * süresini kısaltıyor.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-20" aria-busy>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-6 h-12 w-full" />
      <Skeleton className="mt-3 h-12 w-3/4" />
      <SkeletonText className="mt-8" lines={3} />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </div>
  );
}
