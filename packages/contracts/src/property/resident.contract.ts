import { z } from "zod";

import { dateTime, moneyMinor, uuid } from "../_shared/fields";
import { listQuery, pageMeta, option } from "../_shared/list";

/**
 * Sakin (malik / kiracı) sözleşmesi — MIMARI-PLAN §6.4 `property/resident`.
 *
 * "TEK CARİ" MODELİ: kişi `users` tablosunda **platform genelinde tekil**;
 * siteye bağlanma `memberships`, bağımsız bölümle ilişki `unit_occupancies`
 * üzerinden kurulur. Bir kişi beş dairede malik olsa da tek kayıttır ve
 * borçları tek bakiyede toplanır. Sözleşme bunu yansıtıyor: satır birim
 * değil **kişi**, `occupancies` ise çoklu.
 *
 * KİŞİSEL VERİ (§9.1, GAP-DURUM kararı 7):
 *
 *   - TCKN **hiçbir uçta açık dönmez.** Şifreli değer de dönmez — `apps/app`
 *     artık `FIELD_ENCRYPTION_KEY`'e sahip olmadığı için çözemez zaten.
 *     Sunucu maskeli metni (`tcknMasked`) üretir; çözme yalnız `apps/api`'de.
 *   - Telefon şifrelenmez ama **maskeli** döner (`phoneMasked`). Ham numaraya
 *     yalnız bildirim gönderen sunucu tarafı erişir.
 *   - Bu uçları çağıran her okuma `data_access_logs`'a **dönen kümeyle**
 *     yazılır (§8.4) — sayfalama sunucuda olduğu için kayıt ekranla birebir.
 */

export const RESIDENT_ROLES = [
  "owner",
  "tenant_resident",
  "staff",
  "auditor",
  "accountant",
] as const;
export const residentRole = z.enum(RESIDENT_ROLES);

export const RELATIONS = ["owner", "tenant"] as const;
export const relation = z.enum(RELATIONS);

/**
 * Borç devir politikası — GAP 4.2.4. Kiracı çıkarken kalan borcun kime
 * kalacağını belirler; `next_tenant` deviri **erteler**.
 */
export const TRANSFER_POLICIES = ["owner", "next_tenant", "keep"] as const;
export const transferPolicy = z.enum(TRANSFER_POLICIES);

export const RESIDENT_SORT_KEYS = ["name", "outstanding", "unit"] as const;

export const residentListQuery = listQuery.extend({
  sort: z.enum(RESIDENT_SORT_KEYS).default("name"),
  blockId: uuid.optional(),
  role: residentRole.optional(),
  /** `inDebt` = açık bakiyesi olanlar, `multiUnit` = birden çok birimde ilişkisi olanlar. */
  status: z.enum(["inDebt", "multiUnit"]).optional(),
});

export type ResidentListQuery = z.infer<typeof residentListQuery>;

export const residentOccupancyBrief = z.object({
  unitId: uuid,
  unitNumber: z.string(),
  blockName: z.string().nullable(),
  relation: z.string(),
});

export const residentRow = z.object({
  userId: uuid,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  /** Maskeli — ham numara istemciye hiç ulaşmaz (§9.1). */
  phoneMasked: z.string().nullable(),
  email: z.string().nullable(),
  whatsappOptIn: z.boolean(),
  /** TCKN kayıtlı mı — değerin kendisi değil, varlığı. */
  hasTckn: z.boolean(),
  roles: z.array(z.string()),
  occupancies: z.array(residentOccupancyBrief),
  outstandingMinor: moneyMinor,
  overdueMinor: moneyMinor,
});

export type ResidentRow = z.infer<typeof residentRow>;

export const residentListResponse = z.object({
  rows: z.array(residentRow),
  meta: pageMeta,
  facets: z.object({ blocks: z.array(option) }),
  totals: z.object({
    activeCount: z.number().int(),
    ownerCount: z.number().int(),
    tenantCount: z.number().int(),
    optInCount: z.number().int(),
  }),
});

export type ResidentListResponse = z.infer<typeof residentListResponse>;

/* ------------------------------------------------------------------ *
 * Detay
 * ------------------------------------------------------------------ */

export const residentOccupancy = z.object({
  occupancyId: uuid,
  unitId: uuid,
  unitNumber: z.string(),
  blockName: z.string().nullable(),
  relation: z.string(),
  ownershipPct: z.string(),
  startDate: dateTime,
  endDate: dateTime.nullable(),
  debtTransferPolicy: z.string(),
  contractUrl: z.string().nullable(),
});

export const residentDetail = z.object({
  userId: uuid,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phoneMasked: z.string().nullable(),
  email: z.string().nullable(),
  locale: z.string(),
  whatsappOptIn: z.boolean(),
  whatsappOptInAt: dateTime.nullable(),
  /**
   * Sunucuda çözülüp maskelenmiş TCKN (`•••••••89 01` gibi). Şifreli değer
   * bilinçli olarak **dönmüyor**: app onu çözemez, taşımak yalnız sızıntı
   * yüzeyi olurdu.
   */
  tcknMasked: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhoneMasked: z.string().nullable(),
  createdAt: dateTime,
  lastLoginAt: dateTime.nullable(),
  roles: z.array(z.string()),
  notes: z.string().nullable(),
  occupancies: z.array(residentOccupancy),
  balance: z.object({
    outstandingMinor: moneyMinor,
    overdueMinor: moneyMinor,
    paidTotalMinor: moneyMinor,
  }),
  debts: z.array(
    z.object({
      id: uuid,
      unitNumber: z.string(),
      description: z.string(),
      period: z.string().nullable(),
      amountMinor: moneyMinor,
      paidMinor: moneyMinor,
      lateFeeMinor: moneyMinor,
      dueDate: dateTime,
      status: z.string(),
    }),
  ),
  payments: z.array(
    z.object({
      id: uuid,
      amountMinor: moneyMinor,
      method: z.string(),
      status: z.string(),
      paidAt: dateTime.nullable(),
      receiptNo: z.string().nullable(),
      /** Borçlu başkasıysa ödemenin kimin adına yapıldığı. */
      onBehalfOf: z.string().nullable(),
    }),
  ),
  consents: z.array(
    z.object({
      kind: z.string(),
      granted: z.boolean(),
      documentVersion: z.string(),
      at: dateTime.nullable(),
    }),
  ),
});

export type ResidentDetail = z.infer<typeof residentDetail>;

/**
 * Düzenleme formunun ön dolgusu — okuma yüzeyinden **ayrı** uç.
 *
 * Neden ayrı: düzenleme formu telefonu maskeli alsaydı, yönetici kaydettiğinde
 * maske numaranın yerine yazılırdı. Ham değere gerçekten ihtiyaç var, ama bu
 * ihtiyaç görüntüleme ucunu gevşetmeyi haklı çıkarmaz. Bu yüzden:
 *
 *   - `resident:read` değil **`resident:write`** ister
 *   - erişim `data_access_logs`'a ayrı bir amaçla (`resident.edit_form`) yazılır
 *   - TCKN yine **dönmez**: alan boş bırakılırsa mevcut değer korunuyor,
 *     dolayısıyla formun onu bilmesine hiç gerek yok (`hasTckn` yeterli).
 */
export const residentEditForm = z.object({
  id: uuid,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  role: z.string(),
  locale: z.string(),
  whatsappOptIn: z.boolean(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  notes: z.string().nullable(),
  hasTckn: z.boolean(),
});

export type ResidentEditForm = z.infer<typeof residentEditForm>;

/* ------------------------------------------------------------------ *
 * Yazma
 * ------------------------------------------------------------------ */

const personFields = {
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  /**
   * Telefon burada **ham** girilir (normalize edilerek saklanır). Maskeleme
   * okuma ucunun işi; yazma ucunda maske alsaydık numarayı hiç kaydedemezdik.
   */
  phone: z.string().trim().max(30).nullish(),
  email: z.string().trim().email().max(160).nullish(),
  /** Boş bırakmak "sil" demek değildir; yalnız yeni değer geldiğinde yazılır. */
  tckn: z.string().trim().max(20).nullish(),
  role: residentRole,
  locale: z.enum(["tr", "en", "ar", "ru"]).default("tr"),
  whatsappOptIn: z.coerce.boolean().default(false),
  emergencyContactName: z.string().trim().max(120).nullish(),
  emergencyContactPhone: z.string().trim().max(30).nullish(),
  notes: z.string().trim().max(1000).nullish(),
};

/**
 * En az bir iletişim kanalı zorunlu: telefonu ve e-postası olmayan sakine
 * borç bildirimi gönderilemez, kayıt işlevsiz kalır.
 */
const requireContact = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(
    (data: { phone?: string | null; email?: string | null }) =>
      Boolean(data.phone) || Boolean(data.email),
    {
      message: "Telefon veya e-postadan en az biri zorunlu.",
      path: ["phone"],
    },
  );

export const residentCreate = requireContact(
  z.object({
    ...personFields,
    /**
     * KVKK md.10 aydınlatma onayı — kayıt için zorunlu (GAP-DURUM kararı 11);
     * onaysız istek 400 `consent_required` döner.
     *
     * Yalnız "kutu işaretlendi" bilgisi taşınır: onayın verildiği **metin
     * sürümü** sunucuda sabittir. Sürümü istemciden almak, istemcinin hangi
     * metne onay verildiğini beyan etmesi demekti; veri sorumlusunun kendi
     * belgesi hakkındaki kaydı istemciye emanet edemeyiz.
     */
    kvkkAcknowledged: z.coerce.boolean(),
    /** İlk ilişki (isteğe bağlı): birim + rol + başlangıç. */
    unitId: uuid.nullish(),
    relation: relation.nullish(),
    ownershipPct: z.coerce.number().min(0.001).max(100).default(100),
    startDate: dateTime.nullish(),
    debtTransferPolicy: transferPolicy.default("owner"),
  }),
);

export type ResidentCreate = z.infer<typeof residentCreate>;

export const residentUpdate = requireContact(
  z.object({ ...personFields, id: uuid }),
);

export type ResidentUpdate = z.infer<typeof residentUpdate>;

/**
 * Kayıt sonucu, kişinin **yeni mi açıldığı** bilgisini taşır.
 *
 * Aynı telefon/e-posta ile kayıtlı kişi varsa yeni kullanıcı açılmaz, mevcut
 * kayıt bu siteye bağlanır ("tek cari"). Yönetici bunu bilmeli: "yeni sakin
 * eklendi" ile "zaten kayıtlı kişi siteye bağlandı" farklı olaylar.
 */
export const residentSaveResult = z.object({
  id: uuid,
  linkedExisting: z.boolean(),
});

export type ResidentSaveResult = z.infer<typeof residentSaveResult>;

/* ------------------------------------------------------------------ *
 * Birim ilişkisi (occupancy)
 * ------------------------------------------------------------------ */

export const occupancyCreate = z.object({
  userId: uuid,
  unitId: uuid,
  relation,
  ownershipPct: z.coerce.number().min(0.001).max(100).default(100),
  startDate: dateTime,
  debtTransferPolicy: transferPolicy.default("owner"),
  contractUrl: z.string().trim().max(500).nullish(),
});

export type OccupancyCreate = z.infer<typeof occupancyCreate>;

export const occupancyEnd = z.object({
  endDate: dateTime,
  /**
   * Kalan borç ne olacak — politika kaydındaki varsayılan yerine burada
   * açıkça seçilir: çıkış anı, kararın verildiği andır.
   */
  transferTo: transferPolicy,
  reason: z.string().trim().max(500).nullish(),
});

export type OccupancyEnd = z.infer<typeof occupancyEnd>;

export const occupancyEndResult = z.object({
  transferredDebtCount: z.number().int(),
  transferredMinor: moneyMinor,
  /** `next_tenant` seçildiyse devir ertelendi; borçlar işaretlendi. */
  pending: z.boolean(),
});

export type OccupancyEndResult = z.infer<typeof occupancyEndResult>;

/* ------------------------------------------------------------------ *
 * Toplu işlemler ve arama
 * ------------------------------------------------------------------ */

export const residentIds = z.object({ ids: z.array(uuid).min(1) });

export const residentRemoveResult = z.object({
  removed: z.number().int(),
  /** Açık borcu olduğu için çıkarılamayanlar — sessizce yutulmaz. */
  skipped: z.number().int(),
});

export type ResidentRemoveResult = z.infer<typeof residentRemoveResult>;

export const whatsappOptInPatch = z.object({
  ids: z.array(uuid).min(1),
  optIn: z.coerce.boolean(),
});

export const residentOptionRow = z.object({
  id: uuid,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phoneMasked: z.string().nullable(),
});

export const residentOptionList = z.object({
  rows: z.array(residentOptionRow),
});

export type ResidentOptionList = z.infer<typeof residentOptionList>;

/**
 * TCKN çakışma kontrolü — form ipucu için.
 *
 * Sorgu **blind index** üzerinden yapılır: TCKN'in kendisi hiçbir zaman
 * karşılaştırılabilir düz metin olarak saklanmıyor. Yanıt kasıtlı olarak
 * yalnız ad döndürür; "bu TCKN kime ait" sorusu bir numaralandırma yüzeyi
 * olduğu için uç `resident:read` yetkisi ister ve her çağrı KVKK erişim
 * kaydına yazılır.
 */
export const tcknLookupQuery = z.object({
  tckn: z.string().trim().min(11).max(20),
});

export const tcknLookupResult = z.object({
  found: z.boolean(),
  id: uuid.nullable(),
  name: z.string().nullable(),
});

export type TcknLookupResult = z.infer<typeof tcknLookupResult>;
