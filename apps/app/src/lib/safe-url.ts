/**
 * Kullanıcının serbest metin olarak girdiği bağlantıyı (`attachmentUrl`,
 * bakım raporu…) `href`'e basmadan önce süzer: yalnız http(s) geçer.
 * Sunucu bu alanları yalnız uzunlukla doğruluyor; `javascript:` ile başlayan
 * bir değer olduğu gibi basılsaydı tıklayan yöneticinin oturumunda çalışırdı.
 */
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
