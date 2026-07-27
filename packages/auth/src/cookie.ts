/**
 * Oturum çerezinin adı ve ömür sınırları — SPEC Bölüm 14.2.
 *
 * `session.ts`'ten ayrı bir dosyada çünkü o modül veritabanına dokunuyor.
 * Çerez adını bilmek isteyen taraf (render katmanı, middleware) oturum
 * çözmek istemiyor; sadece "çerez var mı" sorusunu soruyor. İkisini aynı
 * dosyada tutmak, `apps/app`'in yalnız bir string için `@yonetim/db`'yi
 * içeri almasına yol açardı — MIMARI-PLAN §8.3 değişmez 3 tam da bunu
 * yasaklıyor.
 */
export const SESSION_COOKIE = "yonetim_session";
export const SESSION_IDLE_MINUTES = 30;
export const SESSION_MAX_DAYS = 30;
