import { z } from "zod";

import { dateTime, uuid } from "../_shared/fields";
import { authIdentifier } from "./auth.contract";

/**
 * Kayıt akışları — `/kayit`, `/kayit-talebi`, `/kurulum`.
 *
 * Üçü de aynı boşluğu kapatıyor: `apps/web`'in tüm CTA'ları `/kayit`'e,
 * site landing sayfaları `/kayit-talebi`'ne bakıyordu ve ikisi de 404
 * veriyordu. `requireContext()` ise sitesi olmayan kullanıcıyı `/kurulum`'a
 * yönlendiriyordu — o da yoktu.
 */

/* ----------------------------------------------------------- /kayit */

/**
 * Slug istemciden ALINMIYOR. Site adından türetilip çakışma varsa sunucu
 * sonuna sayı ekliyor: kullanıcıya "bu adres dolu" diye tur attırmak,
 * kaydın en kırılgan adımında gereksiz bir engel.
 */
export const signupStart = z.object({
  /** Site/apartman adı. Yönetim firmasında firmanın ilk sitesi. */
  propertyName: z.string().trim().min(2).max(200),
  propertyType: z.enum([
    "apartment",
    "site",
    "residence",
    "plaza",
    "avm",
    "office",
    "vakif",
    "dernek",
  ]),
  city: z.string().trim().max(60).optional(),
  unitCount: z.coerce.number().int().min(1).max(10_000),

  /**
   * Yönetim firması kaydı mı?
   *
   * Fark tek bir alan değil: firma birden çok siteyi yönetir, bu yüzden
   * `companies` kaydı açılıyor ve açılan site ona bağlanıyor. Sonraki
   * siteler `/kurulum` üzerinden aynı firmaya ekleniyor ve hepsi
   * `/panel/portfoy` ekranında tek listede görünüyor.
   */
  companyName: z.string().trim().min(2).max(200).optional(),

  fullName: z.string().trim().min(2).max(160),
  /** E-posta ya da telefon — giriş akışındaki `authIdentifier` ile aynı kural. */
  identifier: authIdentifier,

  /** Pazarlama kampanyası (`/kayit?kampanya=`) ve rakip geçişi (`?gecis=`). */
  campaign: z.string().trim().max(60).optional(),
  migrationSource: z.string().trim().max(60).optional(),

  /** KVKK aydınlatma onayı — işaretsiz kayıt açılmaz. */
  acceptedTerms: z.literal(true),
});

export type SignupStart = z.infer<typeof signupStart>;

/**
 * Kayıt **oturum açmaz**, doğrulama kodu gönderir.
 *
 * Doğrulanmamış bir e-posta/telefonla site açmak, başkasının adresiyle site
 * açıp o kişiyi kilitlemenin yolu olurdu. Kod `POST /v1/auth/web/verify` ile
 * doğrulanıyor — yani giriş akışının aynısı, ikinci bir doğrulama yolu yok.
 */
export const signupStartResult = z.object({
  channel: z.enum(["email", "sms"]),
  identifier: z.string(),
  tenantSlug: z.string(),
});

export type SignupStartResult = z.infer<typeof signupStartResult>;

/* --------------------------------------------------- /kayit-talebi */

export const accessRequestCreate = z.object({
  /** Hangi siteye başvuruluyor — landing sayfasından `?site=` ile geliyor. */
  tenantSlug: z.string().trim().min(1).max(50),
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email().max(255).optional(),
  blockLabel: z.string().trim().max(60).optional(),
  unitLabel: z.string().trim().min(1).max(40),
  claimedRelation: z.enum(["owner", "tenant"]),
  note: z.string().trim().max(1000).optional(),
  acceptedTerms: z.literal(true),
});

export type AccessRequestCreate = z.infer<typeof accessRequestCreate>;

/**
 * Yanıt bilerek **bilgisiz**: talep zaten varsa da, site bulunamadıysa da
 * aynı gövde döner. Aksi halde uç, "bu sitede bu numara kayıtlı mı"
 * sorusunun sorulabildiği bir yüzey olurdu.
 */
export const accessRequestResult = z.object({ received: z.literal(true) });

/* -------------------------------------------- panel: onay kuyruğu */

export const accessRequestRow = z.object({
  id: uuid,
  fullName: z.string(),
  phoneMasked: z.string(),
  email: z.string().nullable(),
  blockLabel: z.string().nullable(),
  unitLabel: z.string(),
  claimedRelation: z.string(),
  note: z.string().nullable(),
  status: z.string(),
  createdAt: dateTime,
  /** Beyan edilen daireyle eşleşen birim — yönetici onayda bunu doğruluyor. */
  matchedUnit: z.object({ id: uuid, number: z.string() }).nullable(),
});

export const accessRequestListResponse = z.object({
  rows: z.array(accessRequestRow),
  pendingCount: z.number().int(),
});

export const accessRequestDecision = z.object({
  /** Onayda zorunlu: yöneticinin doğruladığı gerçek bağımsız bölüm. */
  unitId: uuid.optional(),
  relation: z.enum(["owner", "tenant"]).optional(),
  rejectionReason: z.string().trim().max(500).optional(),
});

export type AccessRequestDecision = z.infer<typeof accessRequestDecision>;
export type AccessRequestListResponse = z.infer<typeof accessRequestListResponse>;

/* -------------------------------------------------------- /kurulum */

/**
 * Hesabı olup hiç sitesi olmayan kullanıcı için kurulum.
 *
 * `requireContext()` bu durumda `/kurulum`'a yönlendiriyordu ve sayfa yoktu —
 * yani davet edilip üyeliği kaldırılan ya da kaydı yarım kalan kullanıcı 404
 * görüyordu.
 */
export const setupTenant = z.object({
  propertyName: z.string().trim().min(2).max(200),
  propertyType: z.enum([
    "apartment",
    "site",
    "residence",
    "plaza",
    "avm",
    "office",
    "vakif",
    "dernek",
  ]),
  city: z.string().trim().max(60).optional(),
  unitCount: z.coerce.number().int().min(1).max(10_000),
  /** Doldurulursa birimler otomatik üretilir (`1`…`unitCount`). */
  generateUnits: z.boolean().default(false),
});

export const setupTenantResult = z.object({ tenantId: uuid, slug: z.string() });

export type SetupTenant = z.infer<typeof setupTenant>;
export type SetupTenantResult = z.infer<typeof setupTenantResult>;
