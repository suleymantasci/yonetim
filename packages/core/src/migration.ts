/**
 * Veri göçü kaynak sistemleri — tanıtım sitesindeki "geçiş" sayfası ve
 * eski aktarım kayıtlarının etiketi için.
 *
 * Aktarımın kendisi programdan bağımsızdır: dosya okunur, sütunlar başlıktan
 * tahmin edilir ve yönetici eşleştirir (`@yonetim/bank` unit-import). Bu
 * programların dışa aktarım biçimi yayımlanmış değil; program başına şablon
 * yazılmadı, yeni aktarımlar `excel` olarak kaydedilir.
 */
export type MigrationSource = "apsiyon" | "biyos" | "dijiyon" | "yonetimcell" | "excel";

/** Kaynak adları i18n katmanındadır: `enum.migrationSource.<source>`. */
export const MIGRATION_SOURCES: readonly MigrationSource[] = [
  "apsiyon", "biyos", "dijiyon", "yonetimcell", "excel",
];
