export * from "./cn";
export * from "./components/brand";
export * from "./components/button";
export * from "./components/card";
export * from "./components/badge";
export * from "./components/input";
export * from "./components/stat";
export * from "./components/empty-state";
export * from "./components/table";
export * from "./components/alert";
export * from "./components/disclosure";
export * from "./components/segmented";
export * from "./components/progress-bar";

/* UI kit v2 — GAP 4.3.5 / 4.4.5 / 4.6 */
export * from "./components/overlay";
export * from "./components/toast";
export * from "./components/skeleton";
export * from "./components/fields";
export * from "./components/navigation";
export * from "./components/page-header";
export * from "./components/list-toolbar";
export * from "./components/timeline";
export * from "./components/chart/index";
export * from "./components/error-state";

/*
 * Hareket katmanı BİLEREK buradan dışa aktarılmıyor: `@yonetim/ui/motion`
 * alt yolundan alınır.
 *
 * Barrel'dan `export *` yapmak, kökten tek bir şey (örneğin `cn`) alan her
 * dosyanın motion istemci modüllerini de paylaşılan parçaya çekmesine yol
 * açıyordu — ölçüldü: pazarlama sitesinin First Load JS'i 137 kB'den
 * 184 kB'ye çıkıyor, üstelik sayfada tek bir animasyon olmasa bile.
 * "use client" modülleri istemci sınırının ötesinde ağaç sarsımına uğramıyor.
 */

export * from "./theme/color";
export * from "./theme/theme";
export * from "./theme/theme-toggle";
export * from "./theme/a11y";
export * from "./theme/a11y-preferences";
