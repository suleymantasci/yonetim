import type { Namespace } from "@yonetim/panel-messages";

/**
 * İstemci bileşenlerine gönderilen mesaj namespace'leri — SPEC Bölüm 4.2.
 *
 * `NextIntlClientProvider` yalnızca burada sayılan namespace'leri taşır; tüm
 * paketi göndermek gereksiz yere tarayıcıya yük bindirir. Bir istemci bileşeni
 * (`"use client"`) yeni bir namespace kullanmaya başlarsa buraya eklenmelidir —
 * `tests/i18n-client.test.ts` bunu denetler ve unutulursa testi düşürür.
 */
export const CLIENT_NAMESPACES = ["common", "enum", "app", "kvkk"] as const satisfies
  readonly Namespace[];
