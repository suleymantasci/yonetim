import type { NotificationKind } from "./router";

/**
 * OLAY → BİLDİRİM haritası — GAP 4.6.5, MIMARI-PLAN §10.
 *
 * ÇÖZDÜĞÜ SORUN: "hangi olay hangi bildirimi doğurur" sorusunun bugün tek bir
 * cevabı yok. Her servis kendi gönderimini kendi yerinde yapsaydı (ve önceki
 * hâlinde öyle olacaktı), cevap 55 dosyaya dağılırdı; "borç oluşunca sakine
 * haber gidiyor mu" sorusu ancak kodu baştan sona okuyarak cevaplanırdı.
 *
 * Burası o cevabın **tek** yeri. Domain servisleri yalnız olay yayar; neyin
 * kime hangi kanaldan gideceğine bu tablo karar verir, gönderimi worker yapar.
 *
 * ÜÇ AYRI KARAR, BİLİNÇLİ OLARAK AYRI YERLERDE:
 *
 *   1. **Olay oldu mu** — domain servisi bilir (borç yazıldı mı, gerçekten).
 *   2. **Bildirim doğar mı, kime** — bu tablo.
 *   3. **Hangi kanaldan, ne zaman** — `router.ts` (opt-in, sessiz saat, maliyet).
 *
 * İkisini birleştirmek cazip ama yanlış olurdu: kanal kararı kişiye bağlı
 * (WhatsApp kayıtlı mı, saat kaç), bildirim kararı olaya bağlı. Aynı yerde
 * tutulsalardı "bu kullanıcıya WhatsApp yok" bilgisi, bildirimin hiç
 * doğmamasına yol açabilirdi — oysa uygulama içi bildirim yine gitmeli.
 */

/** Yayınlanan domain olayları. Ad `bağlam.olay` biçiminde. */
export const DOMAIN_EVENTS = [
  "debt.created",
  "debt.corrected",
  "payment.received",
  "request.created",
  "request.status_changed",
  "request.sla_breached",
  "announcement.published",
  "maintenance.due",
  "meeting.scheduled",
  "poll.opened",
  "certificate.issued",
  "kvkk.request_received",
] as const;

export type DomainEventName = (typeof DOMAIN_EVENTS)[number];

/**
 * Bildirimin **kime** gideceği.
 *
 * Kimlik listesi değil, kural: alıcıyı olayın taşıdığı kaynaktan worker
 * çözüyor. Olayı yayan servisin "bu dairede kim oturuyor" sorusunu cevaplaması
 * gerekseydi, her servis sakin tablosuna bağımlı hale gelirdi.
 */
export type Audience =
  /** Olayın konusu olan dairenin sakinleri (malik + kiracı). */
  | "unit_residents"
  /** Olayın doğrudan muhatabı olan kullanıcı. */
  | "subject_user"
  /** Sitenin yöneticileri ve denetçileri. */
  | "managers"
  /** Sitedeki tüm sakinler. */
  | "all_residents";

export interface NotificationRule {
  kind: NotificationKind;
  audience: Audience;
  /** Bildirim merkezinde tıklanınca gidilecek kaynağın türü. */
  resourceType: string;
  /**
   * Uygulama içi bildirim **her zaman** yazılır mı?
   *
   * `true` olanlarda kullanıcı hiçbir kanala açık olmasa bile panelde kayıt
   * görünür. Bir borcun doğduğunu kimseye söylememek, iletişim tercihiyle
   * değil şeffaflıkla ilgili bir sorun olurdu (SPEC 1.2).
   */
  alwaysInApp: boolean;
}

/**
 * KAPSAM NOTU: burada olmayan olay bildirim doğurmaz. Sessizce düşmez —
 * worker tanımsız olayı `unmapped` olarak log'lar. "Neden bildirim gitmedi"
 * sorusunun cevabı ya bu tabloda ya da log'da; üçüncü bir ihtimal yok.
 */
export const NOTIFICATION_POLICY: Partial<
  Record<DomainEventName, NotificationRule>
> = {
  "debt.created": {
    kind: "dues_reminder",
    audience: "unit_residents",
    resourceType: "debt",
    alwaysInApp: true,
  },
  "debt.corrected": {
    // Düzeltme ayrı bir bildirim: borcun **değiştiği** bilgisi, borcun kendisi
    // kadar önemli (GAP 4.1.6 şeffaflık kaydı).
    kind: "dues_reminder",
    audience: "unit_residents",
    resourceType: "debt",
    alwaysInApp: true,
  },
  "payment.received": {
    // Daireye, ödeyene değil: tahsilatı çoğu zaman yönetici kaydediyor
    // (kapıda nakit, havale eşleştirmesi). Makbuzu görmesi gereken taraf
    // borcu kapanan sakin.
    kind: "payment_receipt",
    audience: "unit_residents",
    resourceType: "payment",
    alwaysInApp: true,
  },
  "request.status_changed": {
    kind: "request_status",
    audience: "subject_user",
    resourceType: "request",
    alwaysInApp: true,
  },
  "request.sla_breached": {
    // Sakine değil **yöneticiye**: süreyi aşan taraf yönetim, uyarılması
    // gereken de o. Sakine "talebiniz gecikti" demek, çözmeden özür dilemek.
    kind: "request_status",
    audience: "managers",
    resourceType: "request",
    alwaysInApp: true,
  },
  "announcement.published": {
    kind: "announcement",
    audience: "all_residents",
    resourceType: "announcement",
    alwaysInApp: true,
  },
  "maintenance.due": {
    kind: "maintenance_reminder",
    audience: "managers",
    resourceType: "maintenance",
    alwaysInApp: true,
  },
  "meeting.scheduled": {
    kind: "meeting_invite",
    audience: "all_residents",
    resourceType: "meeting",
    alwaysInApp: true,
  },
  "poll.opened": {
    kind: "poll_invite",
    audience: "all_residents",
    resourceType: "poll",
    alwaysInApp: true,
  },
  "certificate.issued": {
    kind: "debt_certificate",
    audience: "subject_user",
    resourceType: "debt_certificate",
    alwaysInApp: true,
  },
  "kvkk.request_received": {
    kind: "kvkk_ack",
    audience: "subject_user",
    resourceType: "kvkk_request",
    alwaysInApp: true,
  },
};

/** Kuyruğa giden olay gövdesi — üretici ve tüketicinin ortak sözleşmesi. */
export interface DomainEventPayload {
  event: DomainEventName;
  tenantId: string;
  /** Olayın konusu olan kayıt (borç, talep, duyuru…). */
  resourceId?: string;
  /** `subject_user` hedeflemesi için. */
  subjectUserId?: string;
  /** `unit_residents` hedeflemesi için. */
  unitId?: string;
  /** Şablon değişkenleri — dile bağımsız anahtar/değer. */
  params?: Record<string, string | number>;
  /** Olayı doğuran işlemin iz kimliği (app → api → worker aynı kimlikle). */
  requestId?: string;
}

export function ruleFor(event: string): NotificationRule | null {
  return NOTIFICATION_POLICY[event as DomainEventName] ?? null;
}
