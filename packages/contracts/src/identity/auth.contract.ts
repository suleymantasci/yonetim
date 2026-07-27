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
