import { safeUrl } from "./safe-url";

/**
 * Ek alanındaki değeri bağlantıya çevirir.
 *
 * - `document:<uuid>` → panel içi indirme yönlendirmesi (adres her tıklamada
 *   yeniden imzalanıyor; kalıcı imzalı adres saklanmıyor).
 * - http(s) → olduğu gibi (`safeUrl`).
 * - Diğer her şey → `null` (ör. `javascript:`).
 */
export function attachmentHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^document:([0-9a-f-]{36})$/i.exec(value.trim());
  if (match) return `/panel/belgeler/${match[1]}/indir`;
  return safeUrl(value);
}
