/**
 * Paralel rota yuvasının varsayılanı.
 *
 * Next, `@modal` yuvası için eşleşen bir sayfa bulamadığında bu dosyayı
 * render eder. Olmadan, sunucudan gelen ilk yüklemede (ya da kesilmeyen bir
 * gezinmede) yuva "eşleşmedi" hatası verir. Doğru varsayılan hiçbir şey:
 * çekmece yalnızca kesme (interception) gerçekleştiğinde açılır.
 */
export default function ModalSlotDefault() {
  return null;
}
