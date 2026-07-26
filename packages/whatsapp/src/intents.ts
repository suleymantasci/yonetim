import { foldTurkish } from "@yonetim/core";

/**
 * Niyet tespiti — SPEC Bölüm 3.2 (AI YOK).
 * Pattern matching + skorlama ile %90+ doğruluk hedefi; eşiğin altında kalan
 * mesajlar AI fallback'e (Bölüm 9.2) veya insana devredilir.
 */

export type Intent =
  | "aidat_sorgu"
  | "odeme_talebi"
  | "odeme_bildirimi"
  | "talep_ariza"
  | "duyuru_sorgu"
  | "yonetici_iletisim"
  | "borcu_yoktur_belgesi"
  | "toplanti_sorgu"
  | "rezervasyon"
  | "anket_oy"
  | "kvkk_talebi"
  | "iptal_optout"
  | "yardim"
  | "selamlama"
  | "tesekkur"
  | "bilinmiyor";

export interface IntentMatch {
  intent: Intent;
  confidence: number;
  matchedKeywords: string[];
  /** Mesajdan çıkarılan yapılandırılmış veriler. */
  slots: Record<string, string>;
}

/** Türkçe normalizasyon: aksan/şapka kaldır, ASCII-yazımı tolere et. */
export function normalize(text: string): string {
  return foldTurkish(text)
    .replace(/[^a-z0-9\s.,!?+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface IntentRule {
  intent: Intent;
  /** Tek başına güçlü sinyal veren kelimeler. */
  strong: string[];
  /** Destekleyici kelimeler. */
  weak?: string[];
  /** Bu kelimeler varsa eşleşme iptal (yanlış pozitif önleme). */
  negative?: string[];
  /** Tam eşleşen komut (menü kısayolu). */
  exact?: string[];
  basePriority?: number;
}

const RULES: IntentRule[] = [
  {
    intent: "iptal_optout",
    exact: ["iptal", "dur", "stop", "cikis", "abonelikten cik"],
    strong: ["mesaj gondermeyin", "listeden cikar", "rahatsiz olmak istemiyorum", "engelle"],
    basePriority: 10,
  },
  {
    intent: "aidat_sorgu",
    exact: ["borc", "borcum", "aidat", "bakiye", "kalan"],
    strong: [
      "borcum ne kadar", "ne kadar borcum", "aidat borcu", "borc sorgu", "kac lira borcum",
      "odemem gereken", "bakiyem", "hesabim", "kalan taksit", "ne kadar odeyecegim",
    ],
    weak: ["borc", "aidat", "bakiye", "tutar", "ne kadar"],
    negative: ["odedim", "yatirdim", "gonderdim"],
  },
  {
    intent: "odeme_bildirimi",
    strong: [
      "odedim", "yatirdim", "havale yaptim", "eft yaptim", "gonderdim", "dekont",
      "odeme yaptim", "transfer ettim",
    ],
    weak: ["dekont", "makbuz"],
  },
  {
    intent: "odeme_talebi",
    exact: ["ode", "odeme", "odemek istiyorum", "kart"],
    strong: [
      "nasil odeyebilirim", "odeme yapmak istiyorum", "kredi karti ile", "odeme linki",
      "online odeme", "taksit", "iban", "hesap numarasi",
    ],
    weak: ["odeme", "link", "kart"],
    negative: ["odedim", "yatirdim"],
  },
  {
    intent: "talep_ariza",
    exact: ["ariza", "talep", "sikayet"],
    strong: [
      "bozuldu", "calismiyor", "ariza", "arizali", "su akmiyor", "su kesik", "elektrik yok",
      "asansor", "kombi", "isitma yok", "sicak su yok", "tikandi", "kirildi", "sizinti",
      "koku var", "lamba yanmiyor", "kapi acilmiyor", "gurultu", "temizlik yapilmadi",
      "cop toplanmadi", "kacak", "patladi", "dusuyor", "bozuk",
      // "doğalgaz faturası 450 tl geldi ne yapayım" gibi yönlendirme talepleri (SPEC 3.2)
      "ne yapayim", "ne yapmaliyim", "kime basvuracagim",
    ],
    weak: ["sorun", "problem", "yardim edin", "sikayet", "fatura", "dogalgaz"],
  },
  {
    intent: "duyuru_sorgu",
    exact: ["duyuru", "duyurular", "haberler"],
    strong: ["son duyurular", "duyuru var mi", "ne oldu", "bilgilendirme"],
    weak: ["duyuru", "bilgi"],
  },
  {
    intent: "borcu_yoktur_belgesi",
    strong: [
      "borcu yoktur", "borcu yoktur belgesi", "borcum yoktur yazisi", "banka icin belge",
      "kredi icin belge", "yazi istiyorum", "belge talep",
    ],
    weak: ["belge", "yazi"],
  },
  {
    intent: "toplanti_sorgu",
    exact: ["toplanti"],
    strong: ["kat malikleri toplantisi", "toplanti ne zaman", "genel kurul", "gundem"],
    weak: ["toplanti", "gundem"],
  },
  {
    intent: "rezervasyon",
    exact: ["rezervasyon"],
    strong: [
      "salon kiralamak", "misafir odasi", "spor salonu", "toplanti odasi", "rezerve etmek",
      "yer ayirtmak", "otopark",
    ],
    weak: ["rezervasyon", "salon"],
  },
  {
    intent: "anket_oy",
    exact: ["anket", "oy"],
    strong: ["oy kullanmak", "ankete katil", "oylama"],
    weak: ["anket", "oy"],
  },
  {
    intent: "yonetici_iletisim",
    exact: ["yonetici", "yonetim"],
    strong: [
      "yonetici kim", "yoneticiye ulas", "yonetici numarasi", "kiminle gorusebilirim",
      "yetkili", "muduru arayin", "yoneticiyle gorusmek",
    ],
    weak: ["yonetici", "iletisim", "telefon"],
  },
  {
    intent: "kvkk_talebi",
    strong: [
      "kvkk", "kisisel verilerim", "verilerimi sil", "verilerimi silin", "bilgilerimi silin",
      "veri talebi", "aydinlatma metni",
    ],
    weak: ["kvkk", "veri"],
  },
  {
    intent: "yardim",
    exact: ["yardim", "menu", "komutlar", "help", "?"],
    strong: ["ne yapabilirim", "nasil kullanilir", "seceneklerim"],
  },
  {
    intent: "selamlama",
    exact: ["merhaba", "selam", "iyi gunler", "gunaydin", "iyi aksamlar", "slm", "mrb"],
    strong: ["kolay gelsin"],
  },
  {
    intent: "tesekkur",
    exact: ["tesekkurler", "tesekkur ederim", "sagolun", "eyvallah", "tamamdir", "ok"],
    strong: ["tesekkur", "sagol"],
  },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Kelime sınırı araması; noktalama içeren komutlarda ("?") güvenli çalışır. */
function wordBoundaryTest(needle: string, haystack: string): boolean {
  const escaped = escapeRegex(needle);
  if (!/^[\w\s]/.test(needle)) return haystack.includes(needle);
  return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

/** Mesajdan dönem, tutar, daire no gibi slotları çıkarır. */
export function extractSlots(normalized: string): Record<string, string> {
  const slots: Record<string, string> = {};

  const amount = /(\d+(?:[.,]\d{1,2})?)\s*(?:tl|lira|₺)/.exec(normalized);
  if (amount?.[1]) slots.amount = amount[1].replace(",", ".");

  const unit = /(?:daire|no|numara)\s*[:.]?\s*([a-z]?-?\d{1,4})/.exec(normalized);
  if (unit?.[1]) slots.unit = unit[1].toUpperCase();

  const months = [
    "ocak", "subat", "mart", "nisan", "mayis", "haziran",
    "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik",
  ];
  const monthIdx = months.findIndex((m) => normalized.includes(m));
  if (monthIdx >= 0) slots.month = String(monthIdx + 1);

  const year = /\b(20\d{2})\b/.exec(normalized);
  if (year?.[1]) slots.year = year[1];

  const category = detectRequestCategory(normalized);
  if (category) slots.category = category;

  return slots;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  asansor: ["asansor", "lift"],
  su: ["su akmiyor", "su kesik", "su yok", "sizinti", "tikandi", "tesisat", "musluk", "lavabo"],
  elektrik: ["elektrik", "lamba", "sigorta", "priz", "aydinlatma"],
  dogalgaz: ["dogalgaz", "gaz", "kombi", "kalorifer", "isitma", "petek"],
  ortak_alan: ["bahce", "otopark", "merdiven", "koridor", "cati", "teras", "cephe"],
  guvenlik: ["guvenlik", "kamera", "hirsiz", "kapi acilmiyor", "interkom", "diafon"],
  temizlik: ["temizlik", "cop", "kirli", "koku"],
  hasere: ["bocek", "fare", "hamamboceg", "ilaclama", "hasere"],
};

export function detectRequestCategory(normalized: string): string | null {
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => normalized.includes(w))) return cat;
  }
  return null;
}

/**
 * Niyet tespiti. Skorlama:
 *  - exact komut eşleşmesi: 1.0
 *  - strong ifade: 0.85 + ek eşleşme başına 0.05
 *  - weak kelime: 0.45 + 0.1/kelime
 */
export function detectIntent(rawText: string): IntentMatch {
  const text = normalize(rawText);
  if (!text) {
    return { intent: "bilinmiyor", confidence: 0, matchedKeywords: [], slots: {} };
  }

  const slots = extractSlots(text);
  let best: IntentMatch = { intent: "bilinmiyor", confidence: 0, matchedKeywords: [], slots };

  for (const rule of RULES) {
    if (rule.negative?.some((n) => text.includes(n))) continue;

    const matched: string[] = [];
    let score = 0;

    if (rule.exact?.some((e) => text === e || text === `${e}?`)) {
      score = 1;
      matched.push(...(rule.exact ?? []).filter((e) => text === e));
    } else {
      const strongHits = (rule.strong ?? []).filter((s) => text.includes(s));
      const weakHits = (rule.weak ?? []).filter((w) => wordBoundaryTest(w, text));
      const exactWordHits = (rule.exact ?? []).filter((e) => wordBoundaryTest(e, text));

      if (strongHits.length > 0) {
        score = Math.min(0.98, 0.85 + (strongHits.length - 1) * 0.05);
        matched.push(...strongHits);
      } else if (exactWordHits.length > 0) {
        score = 0.75;
        matched.push(...exactWordHits);
      } else if (weakHits.length > 0) {
        score = Math.min(0.7, 0.45 + (weakHits.length - 1) * 0.1);
        matched.push(...weakHits);
      }
    }

    if (rule.basePriority) score += rule.basePriority > 5 && score > 0 ? 0.02 : 0;

    if (score > best.confidence) {
      best = { intent: rule.intent, confidence: Number(score.toFixed(2)), matchedKeywords: matched, slots };
    }
  }

  return best;
}

/** Niyet etiketleri i18n katmanındadır: `enum.intent.<intent>`. */
export const INTENTS: readonly Intent[] = [
  "aidat_sorgu", "odeme_talebi", "odeme_bildirimi", "talep_ariza", "duyuru_sorgu",
  "yonetici_iletisim", "borcu_yoktur_belgesi", "toplanti_sorgu", "rezervasyon",
  "anket_oy", "kvkk_talebi", "iptal_optout", "yardim", "selamlama", "tesekkur",
  "bilinmiyor",
];

/** Arıza kategorileri — etiketleri `enum.requestCategory.<id>` altındadır. */
export const REQUEST_CATEGORIES: readonly string[] = [
  "asansor", "su", "elektrik", "dogalgaz", "ortak_alan", "guvenlik", "temizlik",
  "hasere", "diger",
];
