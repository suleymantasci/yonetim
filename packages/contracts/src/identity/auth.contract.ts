import { z } from "zod";

import { dateTime, uuid } from "../_shared/fields";

/**
 * Mobil kimlik doğrulama — MIMARI-PLAN §14 A3, §17 kararı 2.
 *
 * NEDEN ŞİMDİ: cookie mobilde çalışmıyor, dolayısıyla mobil er ya da geç dört
 * kimlik yolundan biri olacak. Guard zinciri (`TenantContextGuard` →
 * `RateLimitGuard` → `PermissionGuard`) A0'da kuruldu; dördüncü yolu Faz 17'ye
 * bırakmak, o zinciri sonradan yeniden açmak demekti. Şimdi eklenince dört yol
 * da aynı `RequestContext`'e indirgeniyor ve yetki/RLS/denetim tek kod
 * yolunda kalıyor.
 *
 * AKIŞ (parola yok — kimlik telefondur):
 *
 *   1. `POST /v1/auth/mobile/otp`      → kod gönderilir
 *   2. `POST /v1/auth/mobile/token`    → kod + kimlik = access + refresh
 *   3. `POST /v1/auth/mobile/refresh`  → refresh döndürülür (rotasyon)
 *   4. `POST /v1/auth/mobile/logout`   → oturum iptal
 *
 * KULLANICI SAYIMI (enumeration) ENGELİ: 1. adım kayıtlı olmayan numarada da
 * `{ sent: true }` döner. "Bu numara sistemde yok" cevabı, bir apartman
 * yönetim sisteminde kimin nerede oturduğunu sızdırırdı.
 */

/** Telefon ya da e-posta; sunucu hangisi olduğunu kendisi anlar. */
export const authIdentifier = z.string().trim().min(5).max(160);

export const otpRequest = z.object({
  identifier: authIdentifier,
  /**
   * Çok siteli kullanıcı hangi site için giriş yaptığını belirtebilir.
   * Boşsa sunucu tek üyeliği seçer, birden fazlaysa `tenants` listesiyle
   * `tenant_selection_required` döner.
   */
  tenantSlug: z.string().trim().max(80).nullish(),
});

export type OtpRequest = z.infer<typeof otpRequest>;

/**
 * Yanıt bilerek içeriksiz: kodun gönderilip gönderilmediği kullanıcının
 * varlığını ele vermemeli. `retryAfter`, gerçek istemcinin kaç saniye
 * bekleyeceğini bilmesi için var — bu bilgi kimlik sızdırmıyor.
 */
export const otpRequestResult = z.object({
  sent: z.literal(true),
  retryAfterSeconds: z.number().int(),
});

export const otpVerify = z.object({
  identifier: authIdentifier,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { message: "Kod 6 haneli olmalı." }),
  tenantSlug: z.string().trim().max(80).nullish(),
  /** Cihaz etiketi — "oturumlarım" ekranında hangi telefon olduğunu gösterir. */
  device: z.string().trim().max(120).nullish(),
});

export type OtpVerify = z.infer<typeof otpVerify>;

export const tokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Saniye cinsinden access ömrü — istemci yenilemeyi buna göre zamanlar. */
  expiresIn: z.number().int(),
  tokenType: z.literal("Bearer"),
  tenantId: uuid,
  tenantSlug: z.string(),
  userId: uuid,
  roles: z.array(z.string()),
});

export type TokenPair = z.infer<typeof tokenPair>;

export const refreshRequest = z.object({ refreshToken: z.string().min(20) });

export type RefreshRequest = z.infer<typeof refreshRequest>;

export const logoutRequest = z.object({ refreshToken: z.string().min(20) });

/**
 * `GET /v1/auth/me` — çözülmüş `RequestContext`'in okunabilir hali.
 *
 * Yalnız kolaylık ucu değil: A3'ün çıkış ölçütü "dört kimlik yolu da **aynı**
 * bağlamı üretiyor" ve bunu sınayan e2e test bu ucu çağırıyor. Yol farkı
 * yalnız `source` alanında görünmeli.
 */
export const authMe = z.object({
  userId: uuid.nullable(),
  tenantId: uuid,
  tenantSlug: z.string(),
  roles: z.array(z.string()),
  scopes: z.array(z.string()),
  locale: z.string(),
  source: z.enum(["session", "mobile", "api_key", "internal"]),
  impersonatedBy: uuid.nullish(),
});

export type AuthMe = z.infer<typeof authMe>;

/**
 * Çoklu üyelikte site seçimi — kod doğru ama hangi siteye gireceği belirsizse
 * 409 `tenant_selection_required` ile birlikte bu liste döner.
 */
export const tenantChoice = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  roles: z.array(z.string()),
});

export const tenantChoiceList = z.object({ tenants: z.array(tenantChoice) });

export const mobileSessionRow = z.object({
  id: uuid,
  device: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: dateTime,
  expiresAt: dateTime,
  /** Bu isteği yapan oturumun kendisi mi — listede "bu cihaz" işareti için. */
  current: z.boolean(),
});

export const mobileSessionList = z.object({ rows: z.array(mobileSessionRow) });

/**
 * `GET /v1/auth/context` — panelin kabuk bağlamı.
 *
 * `authMe`'den farkı **görüntülenebilir** alanları da taşıması: site adı ve
 * durumu her sayfanın başlığında ve askıya alma uyarısında kullanılıyor.
 * İkisini tek uca birleştirmek, kimlik yolu doğrulayan e2e testi ekran
 * ihtiyacına bağımlı kılardı — `authMe` sabit kalmalı.
 *
 * `tenantStatus` bilerek serbest metin değil, ekranın karar verdiği bir alan:
 * `past_due` ise ödeme uyarısı, `suspended` ise salt-okunur kabuk gösteriliyor.
 */
export const appContext = z.object({
  userId: uuid,
  /**
   * Kabukta gösterilecek ad — sunucuda birleştiriliyor.
   *
   * Ad/soyad ayrı ayrı gönderilip istemcide birleştirilseydi, adı boş olan
   * kullanıcı için "  " (iki boşluk) render edilirdi. Boşluk yerine e-posta,
   * o da yoksa boş string düşüyor; karar tek yerde.
   */
  userName: z.string(),
  tenantId: uuid,
  tenantSlug: z.string(),
  tenantName: z.string(),
  tenantStatus: z.string(),
  roles: z.array(z.string()),
  locale: z.string(),
  impersonatedBy: uuid.nullable(),
  /** Kullanıcının erişebildiği diğer siteler — site değiştirici için. */
  memberships: z.array(
    z.object({ id: uuid, slug: z.string(), name: z.string() }),
  ),
});

export type AppContextResponse = z.infer<typeof appContext>;

/* ------------------------------------------------------------------ *
 * Web girişi (parolasız) — magic link + SMS OTP
 * ------------------------------------------------------------------ */

/**
 * `POST /v1/auth/web/request` — kod/bağlantı gönderir.
 *
 * Mobil akışla (`/v1/auth/mobile/*`) aynı **değil** ve olmamalı: mobil bir
 * token çifti alıyor, web bir oturum çerezi. İkisini tek uca sıkıştırmak,
 * yanıtın hangi istemciye gittiğine bakarak şekil değiştirmesi demekti.
 *
 * Ortak olan tek şey kullanıcı sayımı (enumeration) engeli: kayıtlı olmayan
 * kimlikte de aynı yanıt dönüyor. "Bu numara sistemde yok" cevabı, bir
 * apartman yönetim sisteminde kimin nerede oturduğunu sızdırırdı.
 */
export const webLoginRequest = z.object({
  identifier: authIdentifier,
  /** SMS metni ve e-posta şablonu bu dilde üretilir. */
  locale: z.string().max(8).optional(),
});

export type WebLoginRequest = z.infer<typeof webLoginRequest>;

export const webLoginRequestResult = z.object({
  channel: z.enum(["email", "sms"]),
  /** Normalize edilmiş kimlik — ikinci adım bunu geri gönderir. */
  identifier: z.string(),
});

export const webLoginVerify = z.object({
  identifier: authIdentifier,
  /** SMS kodu ya da magic link token'ı — hangi olduğunu sunucu anlar. */
  token: z.string().trim().min(4).max(200),
});

export type WebLoginVerify = z.infer<typeof webLoginVerify>;

/**
 * `POST /v1/auth/web/switch-tenant` — aktif siteyi değiştir.
 *
 * Slug değil **kimlik** alıyor: slug tenant'a özgü ama değiştirilebilir bir
 * alan, kimlik ise sabit. Üyelik kontrolü sunucuda yapılıyor; bu şema yalnız
 * biçimi doğruluyor.
 */
export const tenantSwitch = z.object({ tenantId: uuid });

export type TenantSwitch = z.infer<typeof tenantSwitch>;

/**
 * Oturum **jetonu** dönüyor, çerezin kendisi değil.
 *
 * Çerezi tarayıcıya `apps/app` yazıyor çünkü tarayıcı yalnız onun origin'ini
 * görüyor. Oturumun **var olma** kararı yine burada: kayıt `apps/api`'de
 * açılıyor, iptali de orada etkili oluyor. Render katmanına verilen şey bir
 * yetki değil, taşınacak bir dize.
 */
export const webLoginSession = z.object({
  sessionToken: z.string(),
  expiresAt: dateTime,
  userId: uuid,
});

export type WebLoginSession = z.infer<typeof webLoginSession>;

/**
 * Doğrulama başarısızsa neden.
 *
 * Kod olarak dönüyor, metin olarak değil: mesaj `app.login.tokenError.<kod>`
 * altından kullanıcının dilinde çevriliyor (SPEC 4.2). Sunucunun sabit Türkçe
 * metin döndürmesi, İngilizce arayüzde Türkçe hata göstermek olurdu.
 */
export const webLoginFailure = z.object({
  reason: z.enum(["invalid", "used", "expired", "wrongPurpose", "userNotFound"]),
});

export type WebLoginFailure = z.infer<typeof webLoginFailure>;
