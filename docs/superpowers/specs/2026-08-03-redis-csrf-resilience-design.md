# Redis ve CSRF Çalışma Zamanı Dayanıklılığı — Tasarım

**Tarih:** 2026-08-03  
**Durum:** Onaylandı; uygulama planına hazır  
**Kapsam:** `apps/api`, `apps/app`, geliştirme/üretim ortam yapılandırması ve regresyon testleri

## 1. Bağlam ve kanıtlanmış sorunlar

Son güvenlik güncellemelerinden sonra yerel panel isteği şu zincirde kırılıyor:

1. `.env` içinde `REDIS_URL=redis://localhost:6380` var.
2. Docker daemon çalışmadığı için bu portta Redis dinlemiyor.
3. `RedisService.incrWindow()` bağlantı hatasından sonra `null` döndürüyor.
4. `RateLimitGuard` yeni fail-closed davranışla `503 rate_limiter_unavailable` üretiyor.
5. `GET /v1/auth/context` bu nedenle panel render'ını düşürüyor.

Aynı ortamda şu ek kusurlar doğrudan yeniden üretildi:

- Global rate-limit guard, `@Public()` health uçlarını da Redis'e bağlıyor; `/health` liveness probu Redis yokken 503 dönüyor.
- `/health/ready` Redis kontrolünü döndürmesine rağmen `status` hesabında yalnız DB'yi dikkate alıyor ve Redis yokken `ok` bildiriyor.
- Son CSRF değişikliği `Host` fallback'ini kaldırdı. API'nin allowlist'inde yerel panel origin'i (`http://localhost:3001`) yok ve Next server→API istekleri `Origin` göndermiyor; cookie taşıyan POST'lar 403 oluyor.
- Origin kontrolü session cookie'si olmayan public login/mobile/webhook POST'larına da uygulanıyor; bu, API istemcilerini ve imza doğrulayan webhook'ları gereksiz yere kırıyor.
- Redis istemcisi ve BullMQ producer bağlantıları erişilemeyen Redis'e varsayılan retry/offline-queue davranışıyla bağlanıyor; uzun bekleme ve `[ioredis] Unhandled error event` üretiyor.

Typecheck, mevcut 410 unit/contract testi ve üç uygulamanın production build'i bu altyapı arızalarını yakalamıyor; sorun gerçek HTTP/Redis sınırında ortaya çıkıyor.

## 2. Hedefler

- Yerel geliştirmede Redis kapalıyken API ve panelin hızlı, açıkça belgelenmiş bir fail-open yolu ile çalışabilmesi.
- Üretimde Redis yokluğunda rate-limit'in kesinlikle fail-closed kalması.
- Liveness probunun bağımlılık arızasından etkilenmemesi; readiness bilgisinin DB ve Redis'i doğru yansıtması.
- Cookie-authenticated state-changing isteklerde Origin/Referer savunmasını korurken server action, mobile/Bearer ve imza doğrulayan webhook akışlarını kırmamak.
- Redis bağlantısı yokken uzun komut beklemelerini ve unhandled error olaylarını kaldırmak.
- Her kök davranış için otomatik regresyon testi ve gerçek süreç smoke testi eklemek.

## 3. Kapsam dışı

- Double-submit CSRF token'a tam geçiş. Bu, bütün form/server-action sözleşmesini değiştiren ayrı bir güvenlik çalışmasıdır.
- Redis yerine başka bir KV sağlayıcısına geçiş.
- İş alanı controller/service'lerinde refactor veya yeni özellik.
- Üretim altyapısında Docker daemon başlatma; bu çalışma uygulama kodu ve yapılandırma davranışını düzeltir.

## 4. Tasarım

### 4.1 Rate-limit ortam politikası

`RATE_LIMIT_FAIL_OPEN` env alanı doğrulanmış API ortam şemasına eklenecek.

- Değer açıkça `false` ise fail-open kapalıdır.
- Değer belirtilmemişse yalnız `development` ve `test` ortamlarında fail-open açıktır.
- `production` ortamında değer ne olursa olsun fail-closed uygulanır; üretim güvenliği bir yanlış env değeriyle zayıflatılamaz.
- Guard doğrudan ham `process.env` yerine doğrulanmış ortam değerini ve üretim bilgisini kullanır.
- `.env.example` yerel davranışı ve production override'ını açıkça belgeler.

Redis sayaç sonucu `null` olduğunda production davranışı mevcut sözleşmeyi korur: `503`, `rate_limiter_unavailable`, `Retry-After: 60`. Geliştirme/testte istek devam eder; Redis önbelleği ve sayaçlar yalnızca opsiyonel optimizasyon/koruma olarak kalır.

### 4.2 Redis ve BullMQ bağlantı davranışı

`RedisService` istemcisi için:

- `enableOfflineQueue: false` ile bağlantı yokken komutlar kuyrukta tutulmaz.
- Kısa `connectTimeout` ve düşük `maxRetriesPerRequest` ile komut hızlı reddedilir.
- `error` listener'ı bağlanır; bağlantı olayları unhandled event olarak süreci kirletmez.
- Yeniden bağlanma sınırlı ve kontrollü tutulur; normal bağlantı geldiğinde servis yeniden kullanılabilir.
- `get/set/del/incr` metotlarının mevcut `null`/sessiz fallback sözleşmesi korunur.

API'nin BullMQ producer bağlantısı aynı fast-fail seçeneklerini kullanır. API açılışında Redis yok diye kuyruk istemcisi process'i düşürmez; kuyruk kullanan çağrı kendi sınırında hata alır ve mevcut iş-alanı hata/log davranışı devam eder. Worker'ın Redis zorunluluğu değiştirilmez; worker kuyruk olmadan anlamlı iş yapamadığı için fail-fast kalır.

### 4.3 Health uçları

Yeni açık metadata dekoratörü (`SkipRateLimit`) ile yalnız `HealthController.live` ve `HealthController.ready` rate-limit guard'dan muaf tutulur. Genel `@Public()` uçları hâlâ IP başına limitlidir.

Readiness şu şekilde hesaplanır:

```text
status = database === true && redis === true ? "ok" : "degraded"
```

JSON şekli (`status`, `checks.database`, `checks.redis`) ve HTTP 200 davranışı korunur. Liveness yalnız process'in ayakta olduğunu ölçer ve Redis/DB'ye dokunmadan 200 döner. Böylece Docker liveness kontrolü, bağımlılık kesintisinde yanlış yeniden başlatma döngüsüne girmez.

### 4.4 CSRF Origin/Referer savunması

Express middleware'in karar sırası şu olur:

1. `GET`, `HEAD`, `OPTIONS` → geç.
2. `Authorization` header'ı → geç; Bearer/internal akışlar cookie-CSRF kapsamı değildir.
3. Session cookie yok → geç; public login/mobile ve imza doğrulayan webhook'lar kendi endpoint/rate-limit/imza kontrollerini yapar.
4. Session cookie varsa → `Origin` veya `Referer` allowlist'te değilse 403; varsa geç.

Session cookie tespiti, yalnız cookie adını güvenilir biçimde ayrıştırarak yapılır; rastgele bir cookie'nin varlığı CSRF kontrolünü tetiklemez.

Allowlist:

- Kullanıcı tarafından verilen `CORS_ORIGINS` değerleri korunur.
- Development/test'te yalnız loopback uygulama origin'leri (`localhost`/`127.0.0.1` için web, panel ve API portları) otomatik eklenir.
- Production compose, panel origin'ini `CORS_ORIGINS` varsayılanına açıkça ekler; dış origin'ler yine deploy env'iyle belirlenir.
- `Host` header'ı hiçbir koşulda güven sinyali değildir.

`apps/app` server API istemcisi:

- Gelen istek `Origin` taşıyorsa onu iletir; API allowlist'i son kararı verir.
- Gelen `Origin` yoksa `NEXT_PUBLIC_APP_URL` değerini `Origin` olarak ekler.
- Bu başlık yalnız trusted app→API çağrısının CSRF bağlamını taşır; API'deki allowlist kontrolünün yerine geçmez.

### 4.5 Hata gözlemlenebilirliği

Redis bağlantı hataları güvenli, yapılandırılmış ve sınırlı loglanır; anahtar değerleri mevcut redact davranışına uygun kalır. Rate-limit production 503'leri mevcut request-id ve `Retry-After` başlıklarını korur. Geliştirme fail-open olduğunda log, bunun Redis'siz çalışma olduğunu açıkça belirtir; sessiz güvenlik düşüşü oluşmaz.

## 5. Test stratejisi

### Birim/regresyon

- RateLimitGuard: skip metadata, development fail-open, production fail-closed, `Retry-After`, limit aşımı.
- Environment: eksik/`true`/`false` fail-open değerleri ve production override.
- CSRF karar yardımcıları/middleware: session cookie + trusted/untrusted origin, session'sız public POST, Authorization POST.
- App API header builder: gelen origin ve yapılandırılmış fallback.
- HealthController: dört DB/Redis kombinasyonu ve doğru `status`.
- Redis bağlantı yapılandırması: fast-fail seçenekleri ve error listener'ın kurulması (ağ bağımlılığı olmayan birim doğrulama).

### Gerçek süreç smoke testleri

Geçici API portunda, erişilemeyen Redis ile:

- `/health` → 200 ve `status: ok`.
- `/health/ready` → 200, `checks.redis: false`, `status: degraded`.
- Session'sız login/webhook POST → CSRF 403 değil; endpoint'in kendi 4xx/başarı cevabı.
- Session cookie + trusted origin → CSRF aşaması geçilir.
- Session cookie + kötü origin → 403 `csrf_origin_check_failed`.
- Development fail-open ile korumalı GET → Redis 503 yerine route/kimlik katmanına ulaşır.

Sonrasında API/app/worker typecheck, tüm unit/contract testleri ve üç production build tekrar çalıştırılır.

## 6. Alternatifler ve karar gerekçesi

1. **Sadece Redis'i başlatmak:** Kullanıcı makinesinde semptomu giderir; health, CSRF ve unhandled event kusurlarını bırakır. Reddedildi.
2. **Her ortamda fail-open:** Yereli düzeltir fakat production'da rate-limit korumasını Redis kesintisinde kaldırır. Reddedildi.
3. **Double-submit token'a hemen geçmek:** Güvenlik açısından daha kapsamlı olabilir; bu olay için gereksiz geniş değişiklik ve ayrı plan gerektirir. Ertelendi.
4. **Hedefli dayanıklılık (seçilen):** Production güvenlik kararını korur, gerçek sınır hatalarını düzeltir ve değişiklikleri test edilebilir küçük katmanlara ayırır.

## 7. Başarı ölçütleri

- Redis kapalı yerel süreçte panel render'ı `rate_limiter_unavailable` nedeniyle 500/503 olmaz.
- `/health` Redis kapalıyken 200; `/health/ready` Redis durumunu doğru biçimde `degraded` bildirir.
- Giriş, mobile/Bearer ve webhook POST'ları yanlışlıkla CSRF origin hatası almaz.
- Cookie-authenticated kötü origin mutation'ları 403 olarak korunur.
- API loglarında unhandled ioredis error olayı ve 12 saniyelik komut beklemesi görülmez.
- Tüm mevcut test, typecheck ve build kapıları yeşil kalır.
