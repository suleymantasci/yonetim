"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";

import { ListToolbar, ToolbarSelect } from "@yonetim/ui";

/**
 * Liste araç çubuğu köprüsü.
 *
 * `ListToolbar` (paket içi, saf) ile Next yönlendiricisini birleştirir:
 * arama/filtre değişimi `router.replace` ile URL'e yazılır, sunucu yeniden
 * render eder. `replace` kullanılıyor — her harf için tarayıcı geçmişine
 * kayıt bırakmak geri tuşunu kullanılamaz hale getirirdi.
 *
 * `scroll: false`: filtre değişince sayfa başına zıplamaz.
 */
export function ListControls({
  searchPlaceholder = "",
  searchable = true,
  filters,
  trailing,
}: {
  /** `searchable={false}` iken kullanılmaz; o yüzden zorunlu değil. */
  searchPlaceholder?: string;
  /** Arama kabul etmeyen uçlar için kutuyu gizler (bkz. `ListToolbar`). */
  searchable?: boolean;
  /** Sunucudan gelen filtre tanımları (seçenek etiketleri çevrilmiş halde). */
  filters?: {
    param: string;
    label: string;
    value: string;
    options: { value: string; label: string }[];
  }[];
  trailing?: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      // Filtre değişimi her zaman ilk sayfaya döner; aksi halde boş sayfa görülür.
      next.delete("sayfa");
      router.replace(next.toString() ? `?${next.toString()}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <ListToolbar
      defaultQuery={searchParams.get("q") ?? ""}
      onQueryChange={(query) => setParam("q", query)}
      placeholder={searchPlaceholder}
      searchable={searchable}
      trailing={trailing}
    >
      {filters?.map((filter) => (
        <ToolbarSelect
          key={filter.param}
          label={filter.label}
          value={filter.value}
          onChange={(value) => setParam(filter.param, value)}
          options={filter.options}
        />
      ))}
    </ListToolbar>
  );
}
