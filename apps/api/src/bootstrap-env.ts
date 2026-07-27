import { loadRootEnv } from "./infra/config/load-env";

/**
 * Yan etkili ilk import — `main.ts` / `migrate.ts` en üstünde çağrılır.
 *
 * Neden ayrı dosya: CommonJS'te `import` ifadeleri hoist edilir, dolayısıyla
 * `bootstrap()` içinde `.env` yüklemek geç kalıyor — `AppModule` zaten
 * yüklenmiş ve dekoratörleri değerlendirilmiş oluyor. Yan etkili bir modülü
 * ilk sıraya koymak, sıralamayı derleyiciden bağımsız olarak garanti eder.
 */
loadRootEnv();
