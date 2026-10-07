import { z } from "zod";

import { dateTime, uuid, changeReason } from "../_shared/fields";

/**
 * `communication` bağlamı — duyuru, anket, mesaj, toplantı (MIMARI-PLAN §6.3).
 *
 * ORTAK ÖZELLİK: dördü de sakinle kurulan iletişimin kaydı ve üçü yasal
 * sonuç doğuruyor (KMK toplantı/karar defteri, anket oy ağırlıkları, KVKK
 * açısından mesaj içeriği). Bu yüzden hiçbiri "sadece bir liste" değil;
 * yanıtlar kararın **dayanağını** da taşıyor (yeter sayı, oy ağırlığı,
 * botun mu insanın mı cevapladığı).
 */

/* ------------------------------------------------------------------ *
 * Duyurular
 * ------------------------------------------------------------------ */

export const announcementRow = z.object({
  id: uuid,
  title: z.string(),
  body: z.string(),
  audience: z.string(),
  channels: z.array(z.string()),
  isUrgent: z.boolean(),
  scheduledAt: dateTime.nullable(),
  publishedAt: dateTime.nullable(),
  expiresAt: dateTime.nullable(),
  /**
   * KVKK tarayıcısı duyuru metninde kişisel veri bulduysa işaretli
   * (GAP 4.1.13). Bulgular listede değil detayda: liste ekranında ham
   * bulguyu göstermek, gizlenmesi gereken veriyi ikinci kez yaymak olurdu.
   */
  kvkkFlagged: z.boolean(),
  createdAt: dateTime,
});

export const announcementListResponse = z.object({
  rows: z.array(announcementRow),
  totals: z.object({
    published: z.number().int(),
    scheduled: z.number().int(),
    draft: z.number().int(),
    flagged: z.number().int(),
  }),
});

export type AnnouncementListResponse = z.infer<typeof announcementListResponse>;

/* ------------------------------------------------------------------ *
 * Anketler / oylama
 * ------------------------------------------------------------------ */

export const pollRow = z.object({
  id: uuid,
  question: z.string(),
  description: z.string().nullable(),
  options: z.array(z.unknown()),
  /** `equal` = daire başı bir oy, `land_share` = arsa payı ağırlıklı (KMK). */
  weightMode: z.string(),
  quorumRule: z.string(),
  visibility: z.string(),
  ownersOnly: z.boolean(),
  /**
   * Düzenleme formu bunu da okuyor. Listede gösterilmiyor ama taşınmazsa
   * form varsayılanı `false` olur ve kaydeden herkes ayarı sessizce
   * kapatırdı — eksik alanın en sinsi hâli.
   */
  allowMultiple: z.boolean(),
  opensAt: dateTime,
  closesAt: dateTime,
  closedAt: dateTime.nullable(),
  resultJson: z.unknown().nullable(),
  /** Oylama şu anda açık mı — sunucu saatine göre. */
  isOpen: z.boolean(),
  voteCount: z.number().int(),
  createdAt: dateTime,
});

export const pollListResponse = z.object({
  rows: z.array(pollRow),
  totals: z.object({
    open: z.number().int(),
    closed: z.number().int(),
  }),
});

export type PollListResponse = z.infer<typeof pollListResponse>;

/* ------------------------------------------------------------------ *
 * Mesajlar (WhatsApp / SMS / uygulama içi)
 * ------------------------------------------------------------------ */

export const messageRow = z.object({
  id: uuid,
  channel: z.string(),
  /** `in` = sakinden geldi, `out` = sisteme gönderildi. */
  direction: z.string(),
  body: z.string().nullable(),
  intent: z.string().nullable(),
  intentConfidence: z.string().nullable(),
  handledByBot: z.boolean(),
  createdAt: dateTime,
});

/** Konuşmanın muhatabı — sakin kaydıyla eşleşmemişse `id` yok. */
export const messageCorrespondent = z.object({
  id: uuid.nullable(),
  name: z.string().nullable(),
  /** "A Blok · 9" gibi; birden çok bağımsız bölüm varsa virgülle. */
  unitLabel: z.string().nullable(),
  phoneMasked: z.string().nullable(),
});

/**
 * Yazışma başlığı — **mesaj değil kişi** satırı.
 *
 * Liste neden mesaj değil konuşma gösteriyor: yönetici "hangi mesaj geldi"
 * diye değil "kime dönmem gerekiyor" diye bakıyor. Düz mesaj kütüğünde aynı
 * sakinin beş mesajı beş satırdı ve hiçbirinde kimin yazdığı yazmıyordu;
 * gelen kutusu olmayan bir gelen kutusuydu.
 */
export const messageThreadRow = z.object({
  correspondent: messageCorrespondent,
  channel: z.string(),
  lastBody: z.string().nullable(),
  lastDirection: z.string(),
  lastAt: dateTime,
  messageCount: z.number().int(),
  /** Son söz sakinde — yönetimin dönmesi bekleniyor. */
  awaitingReply: z.boolean(),
});

export const messageListResponse = z.object({
  threads: z.array(messageThreadRow),
  totals: z.object({
    inbound: z.number().int(),
    botHandled: z.number().int(),
    needsHuman: z.number().int(),
    /** Botun devraldığı gelen mesaj oranı (%) — otomasyonun gerçek etkisi. */
    botRatePct: z.number().int(),
    /** Cevap bekleyen yazışma sayısı — yöneticinin iş listesi. */
    awaitingReply: z.number().int(),
  }),
});

export type MessageListResponse = z.infer<typeof messageListResponse>;

/** Tek sakinle yazışmanın tamamı — eskiden yeniye sıralı. */
export const messageThreadDetail = z.object({
  correspondent: messageCorrespondent,
  rows: z.array(messageRow),
});

export type MessageThreadDetail = z.infer<typeof messageThreadDetail>;

/* ------------------------------------------------------------------ *
 * Toplantılar ve karar defteri
 * ------------------------------------------------------------------ */

export const meetingDecisionRow = z.object({
  id: uuid,
  meetingId: uuid,
  decisionNo: z.number().int(),
  title: z.string(),
  body: z.string(),
  quorumRule: z.string(),
  votesFor: z.string(),
  votesAgainst: z.string(),
  abstentions: z.string(),
  passed: z.boolean(),
  /** Karar defteri sayfa numarası — KMK md.32 fiziki defterle eşleşme. */
  ledgerPageNo: z.number().int().nullable(),
});

export const meetingRow = z.object({
  id: uuid,
  title: z.string(),
  kind: z.string(),
  scheduledAt: dateTime,
  secondCallAt: dateTime.nullable(),
  location: z.string().nullable(),
  onlineUrl: z.string().nullable(),
  agenda: z.array(z.unknown()),
  attendanceShare: z.string().nullable(),
  quorumMet: z.boolean().nullable(),
  minutesUrl: z.string().nullable(),
  status: z.string(),
  statusReason: z.string().nullable(),
  noticeSentAt: dateTime.nullable(),
  decisions: z.array(meetingDecisionRow),
});

export const meetingListResponse = z.object({
  rows: z.array(meetingRow),
  totals: z.object({
    planned: z.number().int(),
    completed: z.number().int(),
    decisions: z.number().int(),
  }),
});

export type MeetingListResponse = z.infer<typeof meetingListResponse>;

/* ------------------------------------------------------------------ *
 * Duyuru oluşturma
 * ------------------------------------------------------------------ */

export const ANNOUNCEMENT_AUDIENCES = [
  "all",
  "owners",
  "tenants",
  "block",
  "units",
  "new_residents",
] as const;

export const ANNOUNCEMENT_CHANNELS = [
  "whatsapp",
  "sms",
  "email",
  "in_app",
] as const;

export const announcementCreate = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(4000),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).default("all"),
  channels: z.array(z.enum(ANNOUNCEMENT_CHANNELS)).min(1),
  isUrgent: z.coerce.boolean().default(false),
  publish: z.coerce.boolean().default(true),
});

export type AnnouncementCreate = z.infer<typeof announcementCreate>;

/**
 * Taslak düzenleme — yayımlanmış duyuru düzenlenemez (sakinlere gitti;
 * metni sonradan değiştirmek, gönderilenle kayıttakini ayırırdı).
 */
export const announcementUpdate = announcementCreate;
export type AnnouncementUpdate = AnnouncementCreate;

/** Yayından kaldırma — gerekçe denetim kütüğüne. */
export const announcementWithdraw = z.object({ reason: changeReason });
export type AnnouncementWithdraw = z.infer<typeof announcementWithdraw>;

export const kvkkFinding = z.object({
  severity: z.string(),
  /** `kvkk.finding.<code>` altındaki mesaj/öneri çiftinin kodu. */
  code: z.string(),
  match: z.string(),
});

/**
 * KVKK tarama sonucu.
 *
 * Tarama **sunucuda** yapılıyor ve `blocked` bir uyarı değil **karar**:
 * engellenen duyuru hiç kaydedilmiyor. İstemcinin gönderdiği bir bayrağa
 * güvenseydik, filtreyi atlatmak isteyen bir istemci için kapı diye bir şey
 * kalmazdı. Panelde yazarken çalışan canlı kontrol aynı saf fonksiyonu
 * kullanıyor ama o yalnız önizleme.
 */
export const announcementCreateResult = z.object({
  id: uuid.nullable(),
  published: z.boolean(),
  kvkk: z.object({
    blocked: z.boolean(),
    score: z.number(),
    findings: z.array(kvkkFinding),
    /** Bireysel gönderim gerektiriyor mu (toplu kanal kapatılmalı). */
    requiresIndividual: z.boolean(),
  }),
  /** Acil durum override'ı kanalları genişlettiyse nihai liste. */
  channels: z.array(z.string()),
});

export type AnnouncementCreateResult = z.infer<typeof announcementCreateResult>;

/* ------------------------------------------------------------------ *
 * Anket — yazma
 * ------------------------------------------------------------------ */

export const POLL_WEIGHT_MODES = ["equal", "land_share"] as const;
export const pollWeightMode = z.enum(POLL_WEIGHT_MODES);

export const POLL_VISIBILITIES = ["open", "secret"] as const;
export const pollVisibility = z.enum(POLL_VISIBILITIES);

export const QUORUM_RULES = [
  "simple_majority",
  "absolute_majority",
  "two_thirds",
  "four_fifths",
  "unanimous",
] as const;
export const quorumRule = z.enum(QUORUM_RULES);

/**
 * `POST /v1/panel/communication/polls`.
 *
 * SEÇENEK KİMLİKLERİ SUNUCUDA ÜRETİLİYOR: oy `option_id` ile saklanıyor ve
 * istemcinin verdiği bir kimlik, düzenlemede yeniden üretilirse verilmiş
 * oyları başka bir seçeneğe bağlardı.
 *
 * KMK VARSAYILANLARI: `ownersOnly` **açık** ve `weightMode` varsayılan
 * `equal`. Kat Mülkiyeti Kanunu'nda oy hakkı kat malikinindir (md.31) ve her
 * bağımsız bölüm bir oydur; arsa payı ağırlığı ancak yönetim planı öyle
 * diyorsa geçerli. Varsayılanı tersine çevirmek, kanunun istisnasını kural
 * haline getirirdi.
 */
export const pollSave = z
  .object({
    question: z.string().trim().min(5).max(500),
    description: z.string().trim().max(4000).nullish(),
    /** En az iki seçenek; tek seçenekli oylama oylama değildir. */
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(20),
    weightMode: pollWeightMode.default("equal"),
    quorumRule: quorumRule.default("simple_majority"),
    visibility: pollVisibility.default("open"),
    allowMultiple: z.coerce.boolean().default(false),
    ownersOnly: z.coerce.boolean().default(true),
    opensAt: dateTime,
    closesAt: dateTime,
    meetingId: uuid.nullish(),
  })
  .refine((d) => d.closesAt > d.opensAt, {
    message: "Kapanış, açılıştan sonra olmalı.",
    path: ["closesAt"],
  });

export type PollSave = z.infer<typeof pollSave>;

/**
 * Oylamayı kapat.
 *
 * Sonuç **kapatma anında hesaplanıp saklanıyor** (`result_json`): ağırlık
 * modu ya da arsa payları sonradan değişirse geçmiş bir oylamanın sonucu
 * değişmemeli. Sonucu her okumada yeniden hesaplamak, kapanmış bir kararı
 * geriye dönük oynatılabilir kılardı.
 */
export const pollClose = z.object({
  /** Erken kapatma gerekçesi — süresi dolmadan kapatılıyorsa zorunlu. */
  reason: z.string().trim().max(1000).nullish(),
});

export type PollClose = z.infer<typeof pollClose>;

export const pollResultOption = z.object({
  id: z.string(),
  label: z.string(),
  votes: z.number().int(),
  weight: z.string(),
  pct: z.number(),
});

export const pollCloseResult = z.object({
  id: uuid,
  totalVotes: z.number().int(),
  totalWeight: z.string(),
  options: z.array(pollResultOption),
  /** Yeter sayı kuralına göre kabul edilen seçenek; yoksa `null`. */
  winnerOptionId: z.string().nullable(),
  quorumMet: z.boolean(),
});

export type PollCloseResult = z.infer<typeof pollCloseResult>;

export const pollSaveResult = z.object({ id: uuid });

export type PollSaveResult = z.infer<typeof pollSaveResult>;

/* ------------------------------------------------------------------ *
 * Toplantı — yazma
 * ------------------------------------------------------------------ */

export const MEETING_KINDS = ["ordinary", "extraordinary"] as const;
export const meetingKind = z.enum(MEETING_KINDS);

export const MEETING_STATUSES = [
  "planned",
  "held",
  "cancelled",
  "postponed",
] as const;
export const meetingStatus = z.enum(MEETING_STATUSES);

/**
 * `POST /v1/panel/communication/meetings`.
 *
 * İKİNCİ ÇAĞRI (`secondCallAt`) AYRI BİR ALAN, otomatik hesaplanmıyor:
 * KMK md.30 ilk toplantıda yeter sayı sağlanamazsa ikinci toplantıyı en erken
 * yedi gün sonra öngörüyor ama tarihi çağrı metnine yazmak yönetimin işi.
 * Otomatik doldurmak, kanuni asgariyi bir varsayılan sanmaya yol açardı.
 */
export const meetingSave = z
  .object({
    title: z.string().trim().min(3).max(200),
    kind: meetingKind.default("ordinary"),
    scheduledAt: dateTime,
    secondCallAt: dateTime.nullish(),
    location: z.string().trim().max(200).nullish(),
    onlineUrl: z.string().trim().max(500).nullish(),
    /** Gündem maddeleri — sırası korunur, numaralandırma ekranda. */
    agenda: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
    status: meetingStatus.default("planned"),
    minutesUrl: z.string().trim().max(500).nullish(),
  })
  .refine((d) => !d.secondCallAt || d.secondCallAt > d.scheduledAt, {
    message: "İkinci toplantı, ilkinden sonra olmalı.",
    path: ["secondCallAt"],
  });

export type MeetingSave = z.infer<typeof meetingSave>;

/* ------------------------------------------------------------------ *
 * Toplantı — tebliğ, hazirun, yeter sayı (KMK md.29–31)
 * ------------------------------------------------------------------ */

export const MEETING_NOTICE_METHODS = [
  "hand", // elden imza karşılığı
  "registered_mail", // iadeli taahhütlü
  "notice_board", // ilan panosu (yönetim planı izin veriyorsa)
  "electronic", // e-posta/SMS/uygulama (yönetim planı izin veriyorsa)
] as const;
export const meetingNoticeMethod = z.enum(MEETING_NOTICE_METHODS);

/** KMK md.29: çağrı toplantıdan en az 15 gün önce tebliğ edilir. */
export const MEETING_NOTICE_MIN_DAYS = 15;

/** `POST /v1/panel/communication/meetings/:id/notice` — tebliğ kaydı. */
export const meetingNotice = z.object({
  noticeSentAt: dateTime,
  method: meetingNoticeMethod,
});
export type MeetingNotice = z.infer<typeof meetingNotice>;

/**
 * `POST /v1/panel/communication/meetings/:id/status` — iptal / erteleme /
 * yapıldı. Ertelemede yeni tarih zorunlu ve tebliğ sıfırlanır: yeni tarih
 * için çağrı yeniden yapılmalı.
 */
export const meetingStatusChange = z
  .object({
    status: z.enum(["cancelled", "postponed", "held"]),
    reason: z.string().trim().min(3).max(1000).nullish(),
    newScheduledAt: dateTime.nullish(),
  })
  .refine((d) => d.status !== "postponed" || !!d.newScheduledAt, {
    message: "Erteleme için yeni tarih gerekli.",
    path: ["newScheduledAt"],
  })
  .refine((d) => d.status === "held" || (d.reason ?? "").length >= 3, {
    message: "Gerekçe gerekli.",
    path: ["reason"],
  });
export type MeetingStatusChange = z.infer<typeof meetingStatusChange>;

/** `POST /v1/panel/communication/meetings/:id/attendance` — hazirun satırı. */
export const meetingAttendanceAdd = z.object({
  unitId: uuid,
  /** Vekâleten katılımda vekilin adı; boşsa malik bizzat katıldı. */
  proxyName: z.string().trim().min(2).max(160).nullish(),
  proxyDocumentUrl: z.string().trim().max(500).nullish(),
});
export type MeetingAttendanceAdd = z.infer<typeof meetingAttendanceAdd>;

export const meetingAttendanceRow = z.object({
  id: uuid,
  unitId: uuid,
  unitLabel: z.string(),
  ownerName: z.string(),
  proxyName: z.string().nullable(),
  proxyDocumentUrl: z.string().nullable(),
  landShare: z.string(),
});

export const meetingUnitOption = z.object({
  unitId: uuid,
  unitLabel: z.string(),
  ownerName: z.string().nullable(),
  landShare: z.string(),
  attending: z.boolean(),
});

export const meetingQuorum = z.object({
  totalUnits: z.number().int(),
  attendingUnits: z.number().int(),
  totalShare: z.number(),
  attendingShare: z.number(),
  /** İlk toplantı: sayı ve arsa payı çoğunluğu (KMK md.30/1). */
  firstCallMet: z.boolean(),
  /** İkinci toplantı: sayının en az üçte biri (KMK md.30/2). */
  secondCallMet: z.boolean(),
  /** Bir vekilin temsil edebileceği en çok malik (KMK md.31). */
  proxyLimit: z.number().int(),
});

export const meetingDetail = z.object({
  id: uuid,
  title: z.string(),
  kind: z.string(),
  scheduledAt: dateTime,
  secondCallAt: dateTime.nullable(),
  location: z.string().nullable(),
  onlineUrl: z.string().nullable(),
  agenda: z.array(z.unknown()),
  status: z.string(),
  statusReason: z.string().nullable(),
  minutesUrl: z.string().nullable(),
  noticeSentAt: dateTime.nullable(),
  noticeMethod: z.string().nullable(),
  /** `missing`: tebliğ kaydı yok; `late`: 15 günden az önce yapılmış. */
  noticeWarning: z.enum(["missing", "late"]).nullable(),
  noticeDays: z.number().int().nullable(),
  attendances: z.array(meetingAttendanceRow),
  units: z.array(meetingUnitOption),
  quorum: meetingQuorum,
  decisions: z.array(meetingDecisionRow),
});
export type MeetingDetail = z.infer<typeof meetingDetail>;

export const meetingSaveResult = z.object({ id: uuid, title: z.string() });

export type MeetingSaveResult = z.infer<typeof meetingSaveResult>;

/**
 * Toplantı kararı.
 *
 * NOT — bu tablo **karar defteri değil**: `decision_book_entries` site geneli
 * sürekli numaralı ve ekleme-yalnızdır (§2.7). Buradaki numara toplantı
 * içinde tekildir ve tutanağın kendi sırasını taşır. İkisi bilinçli ayrı.
 */
export const meetingDecisionSave = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(8000),
  quorumRule: quorumRule.default("simple_majority"),
  votesFor: z.coerce.number().min(0).default(0),
  votesAgainst: z.coerce.number().min(0).default(0),
  abstentions: z.coerce.number().min(0).default(0),
  passed: z.coerce.boolean().default(false),
  ledgerPageNo: z.coerce.number().int().min(1).max(99_999).nullish(),
});

export type MeetingDecisionSave = z.infer<typeof meetingDecisionSave>;

export const meetingDecisionSaveResult = z.object({
  id: uuid,
  decisionNo: z.number().int(),
});

export type MeetingDecisionSaveResult = z.infer<
  typeof meetingDecisionSaveResult
>;

/* ------------------------------------------------------------------ *
 * Mesaj — gönderme
 * ------------------------------------------------------------------ */

export const MESSAGE_SEND_CHANNELS = ["whatsapp", "sms", "in_app"] as const;
export const messageSendChannel = z.enum(MESSAGE_SEND_CHANNELS);

/**
 * `POST /v1/panel/communication/messages` — tek kişiye mesaj.
 *
 * DUYURUDAN FARKI **muhatap**: duyuru bir kitleye, mesaj bir kişiye gider ve
 * bu fark KVKK açısından belirleyici. Duyuru akışındaki toplu-kanal filtresi
 * (bir kişinin borcunu herkese duyurmama) burada gerekmiyor; buradaki risk
 * tersine, yanlış kişiye gönderim.
 *
 * `channel` **istek üzerine** seçiliyor ama WhatsApp'ta 24 saatlik servis
 * penceresi kapalıysa sunucu şablona düşmek zorunda kalabilir; hangi kanalın
 * gerçekten kullanıldığı yanıtta dönüyor.
 */
export const messageSend = z.object({
  userId: uuid,
  channel: messageSendChannel.default("whatsapp"),
  body: z.string().trim().min(1).max(4000),
});

export type MessageSend = z.infer<typeof messageSend>;

export const messageSendResult = z.object({
  id: uuid,
  /** Gerçekte kullanılan kanal — istenenden farklı olabilir. */
  channel: z.string(),
  queued: z.boolean(),
  /** Gönderilemediyse sebep kodu (`no_phone`, `opted_out`, `window_closed`). */
  blockedReason: z.string().nullable(),
});

export type MessageSendResult = z.infer<typeof messageSendResult>;

/* ------------------------------------------------------------------ *
 * Uygulama içi bildirimler
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/panel/notifications` — kabuktaki bildirim merkezi.
 *
 * Yetki adı yok: kullanıcı yalnız **kendi** bildirimini görür ve işaretler,
 * sorgu `userId = ctx.userId` ile sınırlı. Ayrı bir izin adı üretmek yanlış
 * bir güvenlik hissi verirdi — kısıtlama izinde değil, sorgunun kendisinde.
 */
export const inAppNotificationRow = z.object({
  id: uuid,
  title: z.string(),
  body: z.string().nullable(),
  createdAt: dateTime,
  read: z.boolean(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
});

export const inAppNotificationList = z.object({
  items: z.array(inAppNotificationRow),
  unreadCount: z.number().int(),
});

export type InAppNotificationList = z.infer<typeof inAppNotificationList>;

/** Tek bildirim ya da tümü — `id` yoksa okunmamışların hepsi işaretlenir. */
export const notificationReadRequest = z.object({ id: uuid.nullish() });

export type NotificationReadRequest = z.infer<typeof notificationReadRequest>;
