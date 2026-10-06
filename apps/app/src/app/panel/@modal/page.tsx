/**
 * `@modal` yuvasının **eşleşmeyen adres** karşılığı.
 *
 * Paralel rota yuvaları Next'te yumuşak gezinmede eşleşme bulamazsa `default`'a
 * düşmüyor, **önceki içeriğini koruyor** (`default.tsx` yalnız tam sayfa
 * yüklemede çalışır). Sonuç: bir çekmece (ör. `/panel/sakinler/yeni`) açıkken
 * başka bir sayfaya gidildiğinde çekmece o sayfanın üstünde hayalet olarak
 * kalıyordu; geri dönüşte de eski çekmeceler tek tek çıkıyordu.
 *
 * Bu isteğe bağlı yakalayıcı, çekmece rotası olmayan her adreste yuvayı
 * boşaltıyor. Çekmece rotaları (`(.)…/yeni`) daha özgül olduğu için önceliği
 * koruyor.
 */
export default function ModalSlotRoot() {
  return null;
}
