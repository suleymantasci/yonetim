import type { Namespace } from "./messages";

/**
 * İstemci bileşenlerine gönderilen mesaj namespace'leri — SPEC Bölüm 4.2.
 *
 * Pazarlama sitesinde istemci tarafında yalnızca dil seçici çalışır; sayfaların
 * geri kalanı sunucuda render edilir. Bu yüzden tarayıcıya sadece `common`
 * gider. Yeni bir `"use client"` bileşeni başka namespace kullanırsa buraya
 * eklenmelidir — `tests/i18n-client.test.ts` bunu denetler.
 */
export const CLIENT_NAMESPACES = ["common"] as const satisfies readonly Namespace[];
