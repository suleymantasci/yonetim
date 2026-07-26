/**
 * Modül listesi anahtarları — metinler `marketing.module.*` altındadır.
 * Maddeler `|` ile ayrılmış tek bir dizede tutulur; JSON'da dizi yönetmek yerine
 * çevirmenin tek satırda görebileceği bir biçim seçildi.
 */
export const MODULE_KEYS = [
  "dues",
  "collection",
  "finance",
  "communication",
  "decision",
  "maintenance",
  "operations",
  "compliance",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
