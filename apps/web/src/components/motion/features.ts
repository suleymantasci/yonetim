import { domAnimation } from "motion/react";

/**
 * `LazyMotion`ın gecikmeli yüklediği özellik paketi.
 *
 * Ayrı dosya olmasının nedeni paketleyiciyle ilgili: dinamik `import()` bir
 * modül sınırına ihtiyaç duyuyor. Sağlayıcının içinden `import("motion/react")`
 * deseydik paketleyici modülü ayıramaz, özellikler yine ilk parçaya düşerdi.
 *
 * `domAnimation` seçildi, `domMax` değil: sürükleme ve layout animasyonu
 * (`layoutId`) pazarlama sitesinde kullanılmıyor ve ~15 kB daha getiriyor.
 * Bir sekme göstergesi için paylaşılan `layoutId` gerekirse burası değişir —
 * ve o değişiklik bundle bütçesi kapısında görünür.
 */
export default domAnimation;
