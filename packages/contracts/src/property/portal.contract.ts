import { z } from "zod";

import { dateTime, moneyMinor, uuid } from "../_shared/fields";

/**
 * Sakin self-servis portalı sözleşmesi — SPEC Faz 2 / Bölüm 6.1.
 *
 * KAPSAM İZİNLE DEĞİL SORGUYLA DARALTILIR. Bu dosyadaki her uç, oturumdaki
 * kullanıcının **kendi** dairesine ait veriyi döndürür; istemci bir daire ya
 * da kullanıcı kimliği gönderemez. Gönderebilseydi sakin komşusunun kimliğini
 * yazıp onun borcunu okurdu — bu yüzden filtre parametresi yok, olmayacak.
 *
 * NEDEN YÖNETİM UÇLARI YENİDEN KULLANILMADI: yönetim tarafındaki listeler
 * (`/v1/panel/debts`, `/v1/panel/communication/messages`) site genelini
 * döndürür ve `debt:read` / `message:read` ister. Sakine bu izinleri vermek
 * "kendi borcunu görsün" derken tüm siteyi açmak olurdu. `*_own` izinleri ve
 * ayrı uçlar bu yüzden var (bkz. `packages/core/src/rbac.ts` RESIDENT_BASE).
 */

/* ------------------------------------------------------------------ borç */

export const portalDebtDetail = z.object({
  id: uuid,
  description: z.string(),
  period: z.string().nullable(),
  dueDate: dateTime,
  amountMinor: moneyMinor,
  lateFeeMinor: moneyMinor,
  paidMinor: moneyMinor,
  /** `amount + lateFee - paid` — sunucuda hesaplanır, ekranda toplanmaz. */
  remainingMinor: moneyMinor,
  status: z.string(),
  overdue: z.boolean(),
  /** Vadeye kalan/geçen gün; negatif = gecikmiş. Sunucu saatiyle. */
  daysToDue: z.number().int(),
});

/**
 * Borç düzeltmeleri — yalnız `visible_to_resident` olanlar.
 *
 * Sakine "borcun neden değişti" sorusunun cevabını veren tek yer burası.
 * İç not niteliğindeki düzeltmeler (yönetimin kendi arasında yazdığı gerekçe)
 * bu listede yok; onları göstermek yönetimin çalışma notunu sakine açmak olur.
 */
export const portalDebtChange = z.object({
  id: uuid,
  changeType: z.string(),
  oldAmountMinor: moneyMinor,
  newAmountMinor: moneyMinor,
  reason: z.string().nullable(),
  createdAt: dateTime,
});

export const portalDebtsResponse = z.object({
  totals: z.object({
    outstandingMinor: moneyMinor,
    overdueMinor: moneyMinor,
    lateFeeMinor: moneyMinor,
  }),
  rows: z.array(portalDebtDetail),
  changes: z.array(portalDebtChange),
});

/* ----------------------------------------------------------------- ödeme */

export const portalPaymentRow = z.object({
  id: uuid,
  /**
   * Tamamlanmamış ödemede (kart akışı sürerken) `null`. Satır yine listede
   * duruyor: sakin "kartla ödedim, görünmüyor" derken aslında beklemede olan
   * kaydı görebilmeli.
   */
  paidAt: dateTime.nullable(),
  amountMinor: moneyMinor,
  method: z.string(),
  status: z.string(),
  /** Makbuz numarası — yoksa henüz kesilmemiştir. */
  receiptNo: z.string().nullable(),
  /**
   * Ödeyen bu kullanıcı değilse adı burada. Kiracı malikin borcunu ödemiş
   * olabilir; "benim hesabıma kim ödedi" sorusu ekranda cevaplanabilmeli.
   */
  paidByName: z.string().nullable(),
});

export const portalPaymentsResponse = z.object({
  totals: z.object({
    /** İçinde bulunulan yılın toplam ödemesi. */
    thisYearMinor: moneyMinor,
    allTimeMinor: moneyMinor,
  }),
  rows: z.array(portalPaymentRow),
});

/* ----------------------------------------------------------------- talep */

export const portalRequestRow = z.object({
  id: uuid,
  code: z.string(),
  title: z.string(),
  category: z.string(),
  status: z.string(),
  priority: z.string(),
  createdAt: dateTime,
  resolvedAt: dateTime.nullable(),
  commentCount: z.number().int(),
});

export const portalRequestComment = z.object({
  id: uuid,
  body: z.string(),
  createdAt: dateTime,
  /** Yazan sakinin kendisi mi, yönetim mi — baloncuk yönü buna bakar. */
  mine: z.boolean(),
  authorName: z.string().nullable(),
});

export const portalRequestDetail = portalRequestRow.extend({
  description: z.string().nullable(),
  photoUrls: z.array(z.string()),
  /** `is_internal` yorumlar bu listede YOKTUR — yönetimin iç notu. */
  comments: z.array(portalRequestComment),
});

export const portalRequestsResponse = z.object({
  rows: z.array(portalRequestRow),
});

export const portalRequestCreate = z.object({
  title: z.string().trim().min(3).max(200),
  category: z.string().trim().min(1).max(40),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
});

export const portalCommentCreate = z.object({
  body: z.string().trim().min(1).max(4000),
});

/* ----------------------------------------------------------------- mesaj */

export const portalMessageRow = z.object({
  id: uuid,
  body: z.string().nullable(),
  channel: z.string(),
  /** `in` = sakinden yönetime, `out` = yönetimden sakine. */
  direction: z.string(),
  createdAt: dateTime,
});

export const portalMessagesResponse = z.object({
  rows: z.array(portalMessageRow),
});

export const portalMessageCreate = z.object({
  body: z.string().trim().min(1).max(2000),
});

/* -------------------------------------------------------------- bilgiler */

/**
 * "Bilgilerim" — sakinin kendi kaydı.
 *
 * TCKN burada da maskeli döner. Kendi TCKN'sini görmek zararsız görünür ama
 * uç `apps/app`'e ham değer göndermeye başladığı anda o değer sunucu
 * loglarına, hata izlerine ve tarayıcı önbelleğine girer. Maskeli metin
 * "kaydım doğru mu" sorusuna zaten yetiyor.
 */
export const portalProfile = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phoneMasked: z.string().nullable(),
  tcknMasked: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  units: z.array(
    z.object({
      id: uuid,
      number: z.string(),
      block: z.string().nullable(),
      relation: z.string(),
      startDate: dateTime.nullable(),
      shareRatio: z.string().nullable(),
    }),
  ),
});

export const portalProfileUpdate = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255).nullable().optional(),
  emergencyContactName: z.string().trim().max(120).nullable().optional(),
  emergencyContactPhone: z.string().trim().max(20).nullable().optional(),
});

/* ------------------------------------------------------- yönetim bilgisi */

/**
 * "Yönetim bilgileri" — sakinin kime, nasıl ulaşacağı.
 *
 * KMK md.34 gereği yöneticinin kimliği kat maliklerine açıktır; iletişim
 * bilgisi de pratikte zorunlu. Banka hesabı da burada: aidatını nereye
 * yatıracağını bulmak için sakinin yönetimi araması saçma.
 */
export const portalManagement = z.object({
  tenantName: z.string(),
  tenantType: z.string(),
  address: z.string().nullable(),
  managerName: z.string().nullable(),
  managerPhone: z.string().nullable(),
  managerEmail: z.string().nullable(),
  /**
   * Aidat yatırılacak hesaplar — IBAN **maskeli**.
   *
   * Bu ekranın amacı "nereye yatıracağım" olduğu için açık IBAN daha faydalı
   * olurdu; yine de maskeli dönüyor, çünkü kod tabanında IBAN yöneticinin
   * kendi banka ekranında bile maskeli (`bank-account-write.service.ts`).
   * Sakine açıp yöneticiye kapatmak savunulabilir bir çizgi değil. Açık IBAN
   * gerekiyorsa karar ayrı verilmeli (bkz. PROJE-DURUMU §6).
   */
  bankAccounts: z.array(
    z.object({
      id: uuid,
      label: z.string(),
      bankName: z.string().nullable(),
      ibanMasked: z.string(),
    }),
  ),
  /** Kapıcı/güvenlik gibi ulaşılabilir personel. */
  staff: z.array(
    z.object({
      id: uuid,
      name: z.string(),
      role: z.string(),
      phone: z.string().nullable(),
    }),
  ),
});

/* ------------------------------------------------------------- duyurular */

export const portalAnnouncement = z.object({
  id: uuid,
  title: z.string(),
  body: z.string(),
  category: z.string().nullable(),
  urgent: z.boolean(),
  publishedAt: dateTime.nullable(),
});

export const portalAnnouncementsResponse = z.object({
  rows: z.array(portalAnnouncement),
});

/* ------------------------------------------------------------------ özet */

/**
 * Sakin ana ekranı — bir ekran, bir çağrı (MIMARI-PLAN §9a).
 *
 * Dashboard'un yönetim sürümü `report:read` istiyor ve sakinde yok; bu yüzden
 * `/panel` sakine bu özeti gösterir. Ayrı bir uç olması gerekiyordu: aynı
 * yanıtı iznin iki tarafına birden uydurmak, ya sakine site geneli sayıları
 * sızdırırdı ya da yöneticinin ekranını fakirleştirirdi.
 */
export const portalSummary = z.object({
  tenantName: z.string(),
  unit: z
    .object({ id: uuid, number: z.string(), relation: z.string() })
    .nullable(),
  totals: z.object({
    outstandingMinor: moneyMinor,
    overdueMinor: moneyMinor,
    lastPaymentMinor: moneyMinor.nullable(),
    lastPaymentAt: dateTime.nullable(),
  }),
  /** Vadesi en yakın açık borç — "sırada ne var" sorusu. */
  nextDue: z
    .object({
      id: uuid,
      description: z.string(),
      dueDate: dateTime,
      remainingMinor: moneyMinor,
      overdue: z.boolean(),
    })
    .nullable(),
  openRequestCount: z.number().int(),
  unreadMessageCount: z.number().int(),
  /** Oy bekleyen açık anket sayısı — sakinin kaçırmaması gereken tek eylem. */
  openPollCount: z.number().int(),
  announcements: z.array(portalAnnouncement),
});

export type PortalSummary = z.infer<typeof portalSummary>;
export type PortalDebtsResponse = z.infer<typeof portalDebtsResponse>;
export type PortalPaymentsResponse = z.infer<typeof portalPaymentsResponse>;
export type PortalRequestsResponse = z.infer<typeof portalRequestsResponse>;
export type PortalRequestDetail = z.infer<typeof portalRequestDetail>;
export type PortalRequestCreate = z.infer<typeof portalRequestCreate>;
export type PortalCommentCreate = z.infer<typeof portalCommentCreate>;
export type PortalMessagesResponse = z.infer<typeof portalMessagesResponse>;
export type PortalMessageCreate = z.infer<typeof portalMessageCreate>;
export type PortalProfile = z.infer<typeof portalProfile>;
export type PortalProfileUpdate = z.infer<typeof portalProfileUpdate>;
export type PortalManagement = z.infer<typeof portalManagement>;
export type PortalAnnouncementsResponse = z.infer<
  typeof portalAnnouncementsResponse
>;
