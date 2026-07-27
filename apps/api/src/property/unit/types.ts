import type { Database } from "@yonetim/db";

/**
 * Repository yardımcılarının aldığı transaction tipi.
 *
 * `@yonetim/db`'nin `Database` tipi doğrudan kullanılabilir; ayrı bir isim
 * altında yeniden yayınlamak, ESLint'in `@yonetim/db` importunu kısıtladığı
 * dosyalarda tip almayı kolaylaştırıyor (kısıt **fonksiyonlara**, tiplere değil).
 */
export type { Database };
