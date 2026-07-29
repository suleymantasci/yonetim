import { z } from "zod";

import { changeReason, dateTime, maskedPhone, moneyMinor, uuid } from "../_shared/fields";

/**
 * `tenancy` bağlamı — site ayarları ve personel (MIMARI-PLAN §6.3).
 *
 * PERSONEL VE KİŞİSEL VERİ: `staff` satırlarında şifreli TCKN ve IBAN var.
 * Sözleşme bunları **taşımıyor** — ne açık ne şifreli. Panelin personel
 * ekranında bordro tutarları görünüyor, kimlik numarası değil; ihtiyaç
 * doğduğunda (bordro dosyası üretimi) çözme yine yalnız `apps/api` içinde
 * kalacak. §9.1'in kuralı okuma uçlarına da uygulanıyor.
 */

/* ------------------------------------------------------------------ *
 * Site ayarları
 * ------------------------------------------------------------------ */

export const tenantSettingsResponse = z.object({
  id: uuid,
  name: z.string(),
  slug: z.string(),
  type: z.string(),
  status: z.string(),
  unitCount: z.number().int(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  neighborhood: z.string().nullable(),
  addressLine: z.string().nullable(),
  postalCode: z.string().nullable(),
  /** Serbest biçimli ayar sözlüğü (aidat günü, gecikme oranı, kanallar…). */
  settings: z.record(z.unknown()),
  landingPublished: z.boolean(),
  currentPeriodEnd: dateTime.nullable(),
  trialEndsAt: dateTime.nullable(),
  createdAt: dateTime,
});

export type TenantSettingsResponse = z.infer<typeof tenantSettingsResponse>;

/**
 * `PATCH /v1/panel/settings`.
 *
 * NE YOK, NEDEN YOK:
 *  - `slug`: sitenin genel adresini (landing sayfası, QR kodlar, paylaşılan
 *    bağlantılar) taşıyor. Değiştirmek basılmış her bağlantıyı kırardı;
 *    gerçekten gerekiyorsa destek işi.
 *  - `unitCount`: bağımsız bölüm sayısı `units` tablosundan **türeyen** bir
 *    sayı. Elle girilebilseydi ekrandaki rakam gerçek daire sayısıyla
 *    çelişir ve aidat dağıtımı hangi sayıyı kullandığını söyleyemezdi.
 *  - `status`, `trialEndsAt`, `currentPeriodEnd`: abonelik durumu. Sitenin
 *    kendi ayarı değil, faturalandırmanın sonucu.
 *
 * Gecikme oranı **üst sınırlı**: KMK md.20 aylık %5'i aşan gecikme
 * tazminatına izin vermiyor ve sınırı forma bırakmak, kanuna aykırı bir
 * oranın kaydedilebilmesi demekti.
 */
export const tenantSettingsSave = z.object({
  name: z.string().trim().min(2).max(200),
  city: z.string().trim().max(60).nullish(),
  district: z.string().trim().max(60).nullish(),
  neighborhood: z.string().trim().max(120).nullish(),
  addressLine: z.string().trim().max(500).nullish(),
  postalCode: z.string().trim().max(10).nullish(),

  /** Aidat vade günü (ayın kaçı). 28 üstü, kısa aylarda kayardı. */
  duesDueDayOfMonth: z.coerce.number().int().min(1).max(28).default(10),
  lateFeeEnabled: z.coerce.boolean().default(true),
  /** Aylık %. KMK md.20 üst sınırı 5. */
  lateFeeMonthlyPct: z.coerce.number().min(0).max(5).nullish(),

  /** KVKK başvurularının gideceği adres — veri sorumlusunun iletişim noktası. */
  kvkkContactEmail: z.string().trim().email().max(255).nullish(),

  invoiceTitle: z.string().trim().max(200).nullish(),
  invoiceTaxNumber: z.string().trim().max(11).nullish(),
  invoiceTaxOffice: z.string().trim().max(100).nullish(),
  invoiceAddress: z.string().trim().max(500).nullish(),

  /** WhatsApp gönderiminde açık rıza aransın mı. */
  whatsappOptInRequired: z.coerce.boolean().default(true),

  /**
   * Sakin kartla ödeme yapabilsin mi — **varsayılan kapalı**.
   *
   * Açık olması bir tercih değil bir **taahhüt**: sakin borcunun üstünde bir
   * tutar ödemeye başlıyor (komisyon ona yansıyor). Yöneticinin bilgisi
   * dışında açık gelmesi, sakine sormadan ek ücret yazmak olurdu. Sağlayıcı
   * kimlik bilgileri ve komisyon oranı platform tarafında kurulu değilse bu
   * ayar açık olsa da ödeme başlatılamaz — koşullar birlikte aranıyor.
   *
   * Komisyonu kimin karşılayacağı **ayar değil**: aidat neyse siteye o geçer,
   * komisyon sakinden ek olarak alınır (2026-07-29 kararı).
   */
  onlinePaymentEnabled: z.coerce.boolean().default(false),
});

export type TenantSettingsSave = z.infer<typeof tenantSettingsSave>;

/* ------------------------------------------------------------------ *
 * Entegrasyon durumu — PROJE-DURUMU §5.5
 * ------------------------------------------------------------------ */

/**
 * Bir entegrasyonun **gerçek** durumu.
 *
 * NEDEN VAR: ayarlar ekranı bugüne kadar `siteConfig.features` içindeki
 * **derleme zamanı** sabitlerini gösteriyordu. "WhatsApp: aktif" rozeti
 * "bu sitede WhatsApp bağlı" demiyordu, "bu üründe WhatsApp kodu var"
 * diyordu — yöneticiye yanlış bilgi.
 *
 * `configured` kimlik bilgisinin tanımlı olup olmadığı, `state` ise ölçülen
 * sonuç. İkisi ayrı çünkü "kimlik bilgisi var ama son gönderim başarısız"
 * ile "hiç kurulmamış" farklı sorunlar ve farklı çözümler istiyor.
 */
export const INTEGRATION_STATES = [
  "connected",
  "not_configured",
  "degraded",
  "disabled",
] as const;
export const integrationState = z.enum(INTEGRATION_STATES);

export const integrationStatusRow = z.object({
  /** `whatsapp` | `sms` | `email` | `payment` | `bank` | `einvoice` | `kep` */
  key: z.string(),
  state: integrationState,
  /** Kimlik bilgisi/anahtar tanımlı mı (ortam ya da site ayarı). */
  configured: z.boolean(),
  /**
   * Kimlik bilgisi **site ayarından** mı geliyor, ortamdan mı.
   *
   * WhatsApp karma modelde (2026-07-29 kararı) ikisi de mümkün ve fark
   * yöneticiye görünmeli: "bizim numaramızdan gidiyor" ile "sizin
   * numaranızdan gidiyor" farklı sonuçlar doğuruyor.
   */
  scope: z.enum(["tenant", "platform", "none"]),
  /** Son başarılı gönderim/senkron; hiç olmadıysa `null`. */
  lastSuccessAt: dateTime.nullable(),
  /** Son hata mesajı — `degraded` durumunda dolu. */
  lastError: z.string().nullable(),
  /** Bu kanaldan son 30 günde giden mesaj sayısı. */
  sentLast30Days: z.number().int(),
});

export const integrationStatusResponse = z.object({
  rows: z.array(integrationStatusRow),
});

export type IntegrationStatusResponse = z.infer<
  typeof integrationStatusResponse
>;

/* ------------------------------------------------------------------ *
 * Personel
 * ------------------------------------------------------------------ */

export const staffRow = z.object({
  id: uuid,
  fullName: z.string(),
  role: z.string(),
  /** Maskeli — ham numara panele gitmiyor (§9.1). */
  phoneMasked: z.string().nullable(),
  grossSalaryMinor: moneyMinor,
  netSalaryMinor: moneyMinor,
  sgkPremiumMinor: moneyMinor,
  startedAt: dateTime,
  endedAt: dateTime.nullable(),
  annualLeaveDays: z.number().int(),
  usedLeaveDays: z.number().int(),
  advanceBalanceMinor: moneyMinor,
  isActive: z.boolean(),
  /** Kimlik/IBAN kayıtlı mı — değerin kendisi değil, varlığı. */
  hasTckn: z.boolean(),
  hasIban: z.boolean(),
});

export const staffAttendanceRow = z.object({
  id: uuid,
  staffId: uuid,
  staffName: z.string().nullable(),
  checkInAt: dateTime,
  checkOutAt: dateTime.nullable(),
  method: z.string(),
  note: z.string().nullable(),
  /** Çalışılan saat; çıkış yapılmamışsa null. */
  workedHours: z.number().nullable(),
});

export const staffListResponse = z.object({
  rows: z.array(staffRow),
  attendance: z.array(staffAttendanceRow),
  totals: z.object({
    active: z.number().int(),
    monthlyGrossMinor: moneyMinor,
    monthlySgkMinor: moneyMinor,
    openShifts: z.number().int(),
  }),
});

export type StaffListResponse = z.infer<typeof staffListResponse>;

/* ------------------------------------------------------------------ *
 * Personel — yazma
 * ------------------------------------------------------------------ */

export const STAFF_ROLES = [
  "kapici",
  "guvenlik",
  "temizlik",
  "bahcivan",
  "teknik",
  "diger",
] as const;
export const staffRole = z.enum(STAFF_ROLES);

/**
 * `GET /v1/panel/staff/:id` — düzenleme formunu dolduran uç.
 *
 * Liste satırından (`staffRow`) farkı **telefonun ham gelmesi**: maskeli
 * numarayla form doldurulamaz, kullanıcı kaydettiğinde maske numaranın
 * yerine yazılırdı. Bu yüzden ayrı bir uç ve ayrı bir yetki kapısı değil ama
 * ayrı bir **erişim kaydı**: tek satır okumak, listeyi taramaktan farklı bir
 * niyettir.
 *
 * TCKN ve IBAN yine **gelmiyor** (§9.1) — yalnız kayıtlı olup olmadıkları.
 * Formda boş bırakılan alan "değiştirme" anlamına geliyor, "sil" değil;
 * silmek için ayrı bir kutucuk var (`clearTckn` / `clearIban`).
 */
export const staffDetail = z.object({
  id: uuid,
  fullName: z.string(),
  role: staffRole,
  phone: z.string().nullable(),
  grossSalaryMinor: moneyMinor,
  netSalaryMinor: moneyMinor,
  sgkPremiumMinor: moneyMinor,
  startedAt: dateTime,
  endedAt: dateTime.nullable(),
  annualLeaveDays: z.number().int(),
  usedLeaveDays: z.number().int(),
  advanceBalanceMinor: moneyMinor,
  isActive: z.boolean(),
  hasTckn: z.boolean(),
  hasIban: z.boolean(),
});

export type StaffDetail = z.infer<typeof staffDetail>;

/**
 * `POST /v1/panel/staff` (yeni) ve `PATCH /v1/panel/staff/:id` (güncelle).
 *
 * TEK ŞEMA, İKİ UÇ: alanların hiçbiri yalnız oluşturmada ya da yalnız
 * güncellemede anlamlı değil. İki ayrı şema, aynı doğrulamayı iki yerde
 * tutmak olurdu — `debtBulkCreate`/`duesPlanSave` de aynı deseni izliyor.
 *
 * NET ÜCRET VE SGK **GİRİLİYOR, HESAPLANMIYOR**: gerçek bordro asgari geçim
 * indirimi, kümülatif vergi matrahı, teşvik indirimleri ve SGK tavanına
 * bağlı. Bunları burada hesaplamak, mali müşavirin ürettiği bordroyla
 * çelişecek bir ikinci gerçek üretirdi. Track E'deki "personel bordrosu"
 * kararı verilene kadar bu alanlar **kayıt**, hesap değil.
 */
export const staffSave = z
  .object({
    fullName: z.string().trim().min(3).max(160),
    role: staffRole,
    /** Ham numara; sunucu normalize ediyor. Maskeleme yalnız okumada. */
    phone: z.string().trim().max(20).nullish(),
    /** 11 hane; boş bırakılırsa mevcut kayıt korunur. */
    tckn: z
      .string()
      .trim()
      .regex(/^\d{11}$/, "TCKN 11 haneli olmalı.")
      .nullish(),
    /** Boş bırakılırsa mevcut kayıt korunur. */
    iban: z.string().trim().max(34).nullish(),
    /** Kayıtlı TCKN/IBAN'ı **sil** — boş alandan ayrı bir niyet. */
    clearTckn: z.coerce.boolean().default(false),
    clearIban: z.coerce.boolean().default(false),
    grossSalaryMinor: z.coerce.number().int().min(0).default(0),
    netSalaryMinor: z.coerce.number().int().min(0).default(0),
    sgkPremiumMinor: z.coerce.number().int().min(0).default(0),
    startedAt: dateTime,
    /**
     * Ayrılış tarihi. Doluysa kayıt otomatik pasife düşer — "ayrıldı ama hâlâ
     * aktif" durumu aylık maliyet toplamını sessizce şişirirdi.
     */
    endedAt: dateTime.nullish(),
    /** 4857 md.53: 1–5 yıl 14 gün, 5–15 yıl 20, 15+ yıl 26 (asgari). */
    annualLeaveDays: z.coerce.number().int().min(0).max(365).default(14),
    usedLeaveDays: z.coerce.number().int().min(0).max(365).default(0),
    advanceBalanceMinor: z.coerce.number().int().min(0).default(0),
  })
  .refine((d) => !d.endedAt || d.endedAt >= d.startedAt, {
    message: "Ayrılış tarihi işe giriş tarihinden önce olamaz.",
    path: ["endedAt"],
  })
  .refine((d) => d.usedLeaveDays <= d.annualLeaveDays, {
    // Kullanılan izin hakkı aşarsa "kalan izin" negatif çıkar ve ekranda
    // anlamsız bir sayı olur; hatayı girişte yakalamak daha dürüst.
    message: "Kullanılan izin, yıllık izin hakkını aşamaz.",
    path: ["usedLeaveDays"],
  })
  .refine((d) => d.netSalaryMinor === 0 || d.netSalaryMinor <= d.grossSalaryMinor, {
    message: "Net ücret brütten büyük olamaz.",
    path: ["netSalaryMinor"],
  });

export type StaffSave = z.infer<typeof staffSave>;

export const staffSaveResult = z.object({ id: uuid, fullName: z.string() });

export type StaffSaveResult = z.infer<typeof staffSaveResult>;

/* ------------------------------------------------------------------ *
 * Kıdem / ihbar tazminatı hesaplayıcı — rakip incelemesi §4.1
 * ------------------------------------------------------------------ */

/**
 * `POST /v1/panel/staff/severance`.
 *
 * NİYE SUNUCUDA HESAPLANIYOR: girdilerin ikisi (işe giriş tarihi ve
 * giydirilmiş brüt ücret) `staff` tablosunda ve **panele hiç gitmiyor**
 * (§9.1 — bordro tutarları listede var ama hesabın tavan/vergi parametreleri
 * yok). İstemcide hesaplamak ya bu verileri dışarı taşımayı ya da kullanıcıya
 * elle girdirmeyi gerektirirdi; ikisi de mevcut kaydı atlatır.
 *
 * Ücret **ezilebiliyor** (`monthlyGrossOverrideMinor`): "zam yapsak tazminat
 * ne olur" sorusu yöneticinin gerçekten sorduğu soru. Ezme kaydı değiştirmez,
 * yalnız hesabı besler.
 */
export const severanceQuote = z.object({
  staffId: uuid,
  /** Fesih tarihi — varsayılan bugün değil, açıkça seçilir. */
  endedAt: dateTime,
  /** Boş = personel kaydındaki brüt ücret. Kuruş. */
  monthlyGrossOverrideMinor: z.coerce.number().int().min(0).optional(),
  /**
   * Hakların doğup doğmadığı **olgu** sorusudur, koddan türetilemez: istifa,
   * haklı nedenle derhal fesih (md.25/II) ya da önel kullandırılması bu
   * hakları düşürür. Yönetici işaretler.
   */
  severanceApplies: z.coerce.boolean().default(true),
  noticeApplies: z.coerce.boolean().default(true),
});

export type SeveranceQuote = z.infer<typeof severanceQuote>;

const severanceComponent = z.object({
  grossMinor: moneyMinor,
  stampDutyMinor: moneyMinor,
  incomeTaxMinor: moneyMinor,
  netMinor: moneyMinor,
});

export const severanceQuoteResult = z.object({
  staffName: z.string(),
  startedAt: dateTime,
  endedAt: dateTime,
  serviceDays: z.number().int(),
  /** Ekranda "6 yıl 4 ay" biçiminde gösterilebilsin diye ayrık. */
  serviceYears: z.number().int(),
  serviceMonthsRemainder: z.number().int(),
  monthlyGrossMinor: moneyMinor,
  cappedMonthlyGrossMinor: moneyMinor,
  /** Tavanı aşan aylık kısım; 0 değilse ekran bunu ayrıca yazar. */
  ceilingExcessMinor: moneyMinor,
  noticeWeeks: z.number().int(),
  severance: severanceComponent,
  notice: severanceComponent,
  totalNetMinor: moneyMinor,
  belowMinimumService: z.boolean(),
  /**
   * Hesapta kullanılan tavan/vergi parametrelerinin yürürlük tarihi.
   * Ekranda **gösteriliyor**: eskimiş bir tavanla üretilmiş rakam sessiz
   * kalmasın, kullanıcı tarihi görüp sorgulayabilsin.
   */
  parametersEffectiveFrom: z.string(),
  ceilingMinor: moneyMinor,
  incomeTaxRate: z.number(),
});

export type SeveranceQuoteResult = z.infer<typeof severanceQuoteResult>;

/* ------------------------------------------------------------------ *
 * Site yaşam döngüsü — pasife alma ve geri kurtarma
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/panel/tenancy/lifecycle` — sitenin yaşam döngüsü durumu.
 *
 * `daysLeftToRecover` **sunucuda** hesaplanıyor, istemcide değil: kalan gün
 * sayısı kullanıcının makinesinin saatine bağlı olmamalı. Saati geri alınmış
 * bir tarayıcı "hâlâ 40 günün var" derken sunucu tasfiyeyi çoktan uygun
 * görmüş olabilirdi.
 */
export const tenantLifecycleState = z.object({
  id: uuid,
  name: z.string(),
  status: z.string(),
  archivedAt: dateTime.nullable(),
  archivedByName: z.string().nullable(),
  purgeAfterAt: dateTime.nullable(),
  archiveReason: z.string().nullable(),
  /** Arşivden geri alınabilecek kalan gün; arşivde değilse null. */
  daysLeftToRecover: z.number().int().nullable(),
  /** Pencere uzunluğu — ekranda "90 gün içinde" metnini üretmek için. */
  recoveryWindowDays: z.number().int(),
  canArchive: z.boolean(),
  canRestore: z.boolean(),
});

export type TenantLifecycleState = z.infer<typeof tenantLifecycleState>;

export const tenantArchiveRequest = z.object({
  /**
   * Gerekçe **zorunlu**: arşivleme siteyi salt-okunura düşürüp faturalamayı
   * durduruyor. Aylar sonra "bu site neden kapalı" sorusunu soracak olan
   * kişiye (yeni yönetici, denetçi, destek ekibi) bırakılacak tek iz bu.
   */
  reason: changeReason,
});

export type TenantArchiveRequest = z.infer<typeof tenantArchiveRequest>;

export const tenantLifecycleResult = z.object({
  id: uuid,
  status: z.string(),
  purgeAfterAt: dateTime.nullable(),
});

export type TenantLifecycleResult = z.infer<typeof tenantLifecycleResult>;

/* ------------------------------------------------------------------ *
 * Platform paneli (süper-admin)
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/panel/platform/overview` — süper-admin özeti (SPEC Bölüm 18).
 *
 * "BİR EKRAN = BİR ÇAĞRI" (§9a): eskiden aynı sayfada yedi ayrı sorgu vardı.
 * Yedi uca bölmek, tek bir açılışı yedi gidiş-dönüşe çıkarırdı.
 *
 * Bu uç **tenant sınırının dışında** çalışıyor: platform genelinin sayıları
 * tanımı gereği tek bir siteye ait değil. Bu yüzden yetki kontrolü rol
 * bazlı ve dar — yalnız platform rolleri.
 */
export const platformOverview = z.object({
  tenants: z.object({
    total: z.number().int(),
    trial: z.number().int(),
    active: z.number().int(),
    pastDue: z.number().int(),
    suspended: z.number().int(),
  }),
  revenue: z.object({ mrrMinor: moneyMinor, arrMinor: moneyMinor }),
  notifications: z.object({
    sent: z.number().int(),
    failed: z.number().int(),
    /** Oran sunucuda: sıfıra bölme kararı tek yerde verilsin. */
    failureRate: z.number(),
    costMinor: moneyMinor,
  }),
  overdueKvkkCount: z.number().int(),
  recentTenants: z.array(
    z.object({
      id: uuid,
      name: z.string(),
      slug: z.string(),
      status: z.string(),
      unitCount: z.number().int(),
      createdAt: dateTime,
    }),
  ),
  campaigns: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      usageCount: z.number().int(),
      usageLimit: z.number().int().nullable(),
    }),
  ),
  featureFlags: z.array(
    z.object({
      id: uuid,
      key: z.string(),
      enabled: z.boolean(),
      rolloutPct: z.number().int(),
    }),
  ),
  plans: z.array(
    z.object({ id: uuid, name: z.string(), yearlyPriceMinor: moneyMinor }),
  ),
});

export type PlatformOverview = z.infer<typeof platformOverview>;

/* ------------------------------------------------------------------ *
 * Platform — hesap yönetimi (SPEC Bölüm 18.1 #1–#4)
 * ------------------------------------------------------------------ */

/**
 * "Hesap" burada **kullanıcı** değil, **müşteri**: ya bir yönetim firması ya
 * da tek bir siteyi yöneten bağımsız yönetici.
 *
 * NEDEN BU BİRİM: panelin cevaplaması istenen sorular ("kaç hesap kayıtlı",
 * "bu hesaba bağlı kaç site var", "ödemesini yapıyor mu") kullanıcı satırıyla
 * cevaplanamıyor — bir yönetim firmasının on kullanıcısı olabilir ve onlar tek
 * bir müşteri. Tenant satırıyla da cevaplanamıyor — o firma on siteyi tek
 * sözleşmeyle yönetiyor. Bu yüzden liste `companies` satırlarını ve firmaya
 * bağlı **olmayan** siteleri tek bir küme olarak dönüyor.
 *
 * Abonelik site başına kalıyor (2026-07-29 kararı); hesap satırındaki tutarlar
 * ona bağlı sitelerin **toplamı**. Yani konsolide bir abonelik yok, konsolide
 * bir görünüm var.
 */
export const platformAccountRow = z.object({
  /** `company:<uuid>` veya `tenant:<uuid>` — iki küme tek listede. */
  key: z.string(),
  kind: z.enum(["company", "standalone"]),
  name: z.string(),
  /** İletişim — firma kaydından ya da sitenin yöneticisinden. */
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  siteCount: z.number().int(),
  /** Arşivdeki siteler `siteCount` içinde; ayrıca sayılıyor. */
  archivedSiteCount: z.number().int(),
  unitCount: z.number().int(),
  userCount: z.number().int(),
  /**
   * Hesabın **en kötü** abonelik durumu. Ortalama ya da "ilk site" yanıltıcı
   * olurdu: on siteden birinin ödemesi durmuşsa panel bunu göstermeli.
   */
  worstSubscriptionStatus: z.string().nullable(),
  /** En yakın dönem sonu — "ne zaman yenilenecek/bitecek". */
  nextPeriodEndAt: dateTime.nullable(),
  trialEndsAt: dateTime.nullable(),
  yearlyPriceMinor: moneyMinor,
  /** Ödenmiş fatura toplamı (tüm zamanlar) ve ödenmemiş bakiye. */
  paidTotalMinor: moneyMinor,
  outstandingMinor: moneyMinor,
  overdueInvoiceCount: z.number().int(),
  addonCount: z.number().int(),
  createdAt: dateTime,
});

export type PlatformAccountRow = z.infer<typeof platformAccountRow>;

export const platformAccountList = z.object({
  rows: z.array(platformAccountRow),
  total: z.number().int(),
  /** Sunucu tarafı özet — liste sayfalanınca da doğru kalması için. */
  totals: z.object({
    accounts: z.number().int(),
    sites: z.number().int(),
    units: z.number().int(),
    payingAccounts: z.number().int(),
    trialAccounts: z.number().int(),
    outstandingMinor: moneyMinor,
  }),
});

export type PlatformAccountList = z.infer<typeof platformAccountList>;

/** `GET /v1/panel/platform/accounts/:key` — tek hesabın tam dökümü. */
export const platformAccountDetail = z.object({
  account: platformAccountRow,
  sites: z.array(
    z.object({
      id: uuid,
      name: z.string(),
      slug: z.string(),
      status: z.string(),
      unitCount: z.number().int(),
      residentCount: z.number().int(),
      trialEndsAt: dateTime.nullable(),
      archivedAt: dateTime.nullable(),
      purgeAfterAt: dateTime.nullable(),
      /** Arşivdeki site için kalan gün — süper-admin de aynı sayıyı görmeli. */
      daysLeftToRecover: z.number().int().nullable(),
      subscription: z
        .object({
          id: uuid,
          planName: z.string(),
          status: z.string(),
          billingPeriod: z.string(),
          priceMinor: moneyMinor,
          currentPeriodEndAt: dateTime.nullable(),
          trialEndsAt: dateTime.nullable(),
          cancelAtPeriodEnd: z.boolean(),
          dunningStep: z.number().int(),
          smsUsedThisPeriod: z.number().int(),
          smsQuotaYearly: z.number().int(),
        })
        .nullable(),
      createdAt: dateTime,
    }),
  ),
  users: z.array(
    z.object({
      id: uuid,
      name: z.string(),
      email: z.string().nullable(),
      /** Maskeli — §9.1: platform paneli de açık numara taşımıyor. */
      phone: maskedPhone,
      roles: z.array(z.string()),
      siteCount: z.number().int(),
      lastLoginAt: dateTime.nullable(),
      isPlatformUser: z.boolean(),
      status: z.string(),
    }),
  ),
  invoices: z.array(
    z.object({
      id: uuid,
      invoiceNo: z.string(),
      tenantName: z.string(),
      status: z.string(),
      totalMinor: moneyMinor,
      issuedAt: dateTime.nullable(),
      dueAt: dateTime.nullable(),
      paidAt: dateTime.nullable(),
    }),
  ),
  addons: z.array(
    z.object({
      id: uuid,
      tenantName: z.string(),
      kind: z.string(),
      name: z.string(),
      purchasedQuantity: z.number().int(),
      remainingQuantity: z.number().int(),
      totalPriceMinor: moneyMinor,
      source: z.string(),
      status: z.string(),
      validUntil: dateTime.nullable(),
    }),
  ),
});

export type PlatformAccountDetail = z.infer<typeof platformAccountDetail>;

/* ---------------- Platform aksiyonları ---------------- */

/**
 * Abonelik süresi uzatma.
 *
 * Gün cinsinden, tarih değil: "15 gün daha ver" destek konuşmasının doğal
 * birimi ve iki farklı zaman diliminde aynı sonucu veriyor. Mutlak tarih
 * alsaydık, süreyi **kısaltan** bir çağrı da aynı uçtan geçebilirdi — hâlbuki
 * uzatma jesti ile erişimi erken kesme kararı ayrı sorumluluklar.
 */
export const platformExtendRequest = z.object({
  tenantId: uuid,
  days: z.coerce.number().int().min(1).max(730),
  reason: changeReason,
});

export type PlatformExtendRequest = z.infer<typeof platformExtendRequest>;

/** Site yaşam döngüsü aksiyonu — arşivle / geri aç / kalıcı sil. */
export const platformTenantAction = z.object({
  tenantId: uuid,
  reason: changeReason,
});

export type PlatformTenantAction = z.infer<typeof platformTenantAction>;

/**
 * Hesabı dondur / aktifleştir / kapat.
 *
 * Hesap seviyesinde: firmaya bağlı **tüm** siteler birlikte etkileniyor.
 * Tek tek site kapatmak isteyen süper-admin site aksiyonlarını kullanır;
 * ikisini tek uca sıkıştırmak "hangi kapsamda çalıştığı isteğin gövdesinden
 * anlaşılan" bir yıkım ucu bırakırdı.
 */
export const platformAccountAction = z.object({
  accountKey: z.string().min(3),
  action: z.enum(["freeze", "activate", "close"]),
  reason: changeReason,
});

export type PlatformAccountAction = z.infer<typeof platformAccountAction>;

/** Elle ek paket tanımlama (destek jesti / kampanya ödülü). */
export const platformAddonGrant = z.object({
  tenantId: uuid,
  kind: z.enum(["sms", "whatsapp"]),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  /** Bedelsiz tanımlanabilir; fiyat girilirse fatura kalemi olarak işlenir. */
  totalPriceMinor: moneyMinor.min(0).default(0),
  validUntil: dateTime.nullable().default(null),
  reason: changeReason,
});

export type PlatformAddonGrant = z.infer<typeof platformAddonGrant>;

export const platformActionResult = z.object({
  ok: z.literal(true),
  /** Etkilenen site sayısı — hesap seviyesi aksiyonlarda 1'den büyük olur. */
  affected: z.number().int(),
});

export type PlatformActionResult = z.infer<typeof platformActionResult>;

/**
 * `POST /v1/panel/platform/impersonate` — hesaba geçiş (SPEC Bölüm 18.2).
 *
 * Hedef **kullanıcı**, site değil: bir sitede yöneticinin gördüğü ile
 * muhasebecinin gördüğü farklı ve destek talebi "ben şunu göremiyorum"
 * biçiminde geliyor. Site kimliği ayrıca veriliyor çünkü hedef kullanıcı
 * birden fazla sitede üye olabilir.
 */
export const impersonateRequest = z.object({
  userId: uuid,
  tenantId: uuid,
  reason: changeReason,
});

export type ImpersonateRequest = z.infer<typeof impersonateRequest>;

export const impersonateResult = z.object({
  /** Panel bu çerezi kurup `/panel`e gidiyor. */
  token: z.string(),
  expiresAt: dateTime,
  targetUserName: z.string(),
  tenantSlug: z.string(),
});

export type ImpersonateResult = z.infer<typeof impersonateResult>;
