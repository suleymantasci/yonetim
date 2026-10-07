/**
 * Demo sitelerinin tarifi — herkese aynı.
 *
 * Yönetici demosu yalnız ilk siteyi alır; yönetim firması demosu üçünü
 * birden (firma kaydıyla). Her site 30–50 bağımsız bölüm, birden çok blok.
 */
export interface BlockSpec {
  name: string;
  floors: number;
  unitsPerFloor: number;
  hasElevator: boolean;
  /** Zemin katta dükkân sayısı (bu blokta). */
  shops?: number;
}

export interface StaffSpec {
  fullName: string;
  role: "kapici" | "guvenlik" | "temizlik" | "bahcivan" | "teknik" | "diger";
  netTl: number;
  grossTl: number;
  sgkTl: number;
  /** İşe başlama — "şimdi"den kaç ay önce. */
  startedMonthsAgo: number;
}

export interface ResourceSpec {
  name: string;
  kind: "salon" | "misafir_odasi" | "spor" | "havuz" | "otopark" | "teras" | "bahce" | "diger";
  capacity: number;
  requiresApproval: boolean;
  openHour: number;
  closeHour: number;
  rulesText: string;
}

export interface SiteBlueprint {
  key: string;
  name: string;
  type: "site" | "apartment" | "residence";
  city: string;
  district: string;
  neighborhood: string;
  addressLine: string;
  blocks: BlockSpec[];
  /** İlk aidat planının aylık birim tutarı (TL). Yıl ortasında %25 artış kararı var. */
  duesTl: number;
  formula: "equal" | "land_share";
  /** Gider tutarlarının ölçeği (küçük apartman daha az harcar). */
  expenseScale: number;
  staff: StaffSpec[];
  resources: ResourceSpec[];
  /** Bağımsız bölüm su sayaçları ve endeksleri. */
  hasMeters: boolean;
  openingCashTl: number;
  openingBankTl: number;
  bankName: string;
}

export const SITE_BLUEPRINTS: readonly SiteBlueprint[] = [
  {
    key: "yesilvadi",
    name: "Yeşilvadi Sitesi",
    type: "site",
    city: "İstanbul",
    district: "Ataşehir",
    neighborhood: "Barbaros",
    addressLine: "Yeşilvadi Caddesi No: 12",
    blocks: [
      { name: "A Blok", floors: 5, unitsPerFloor: 3, hasElevator: true },
      { name: "B Blok", floors: 5, unitsPerFloor: 3, hasElevator: true },
      { name: "C Blok", floors: 4, unitsPerFloor: 3, hasElevator: false },
    ],
    duesTl: 2_000,
    formula: "equal",
    expenseScale: 1,
    staff: [
      { fullName: "Ramazan Toprak", role: "kapici", netTl: 28_000, grossTl: 33_000, sgkTl: 6_900, startedMonthsAgo: 40 },
      { fullName: "Cengiz Yaprak", role: "bahcivan", netTl: 14_500, grossTl: 17_000, sgkTl: 3_600, startedMonthsAgo: 18 },
    ],
    resources: [
      { name: "Toplantı salonu", kind: "salon", capacity: 40, requiresApproval: true, openHour: 9, closeHour: 22, rulesText: "Etkinlik sonrası salon temiz teslim edilir. 23:00 sonrası müzik yasaktır." },
      { name: "Spor salonu", kind: "spor", capacity: 8, requiresApproval: false, openHour: 7, closeHour: 23, rulesText: "Havlu ve temiz spor ayakkabısı zorunludur." },
      { name: "Barbekü alanı", kind: "bahce", capacity: 15, requiresApproval: true, openHour: 10, closeHour: 22, rulesText: "Ateş söndürülmeden alan terk edilmez." },
    ],
    hasMeters: true,
    openingCashTl: 12_500,
    openingBankTl: 185_000,
    bankName: "Ziraat Bankası",
  },
  {
    key: "lale",
    name: "Lale Apartmanı",
    type: "apartment",
    city: "İstanbul",
    district: "Kadıköy",
    neighborhood: "Fenerbahçe",
    addressLine: "Lale Sokak No: 7",
    blocks: [{ name: "Ana Blok", floors: 8, unitsPerFloor: 4, hasElevator: true }],
    duesTl: 1_500,
    formula: "land_share",
    expenseScale: 0.55,
    staff: [
      { fullName: "Nurettin Çınar", role: "kapici", netTl: 26_500, grossTl: 31_000, sgkTl: 6_500, startedMonthsAgo: 70 },
    ],
    resources: [
      { name: "Çatı terası", kind: "teras", capacity: 20, requiresApproval: true, openHour: 10, closeHour: 22, rulesText: "Kullanım sonrası şemsiyeler kapatılır." },
    ],
    hasMeters: false,
    openingCashTl: 6_000,
    openingBankTl: 92_000,
    bankName: "İş Bankası",
  },
  {
    key: "mavikoru",
    name: "Mavi Koru Evleri",
    type: "residence",
    city: "İstanbul",
    district: "Beylikdüzü",
    neighborhood: "Adnan Kahveci",
    addressLine: "Koru Bulvarı No: 48",
    blocks: [
      { name: "A Blok", floors: 6, unitsPerFloor: 4, hasElevator: true },
      { name: "B Blok", floors: 5, unitsPerFloor: 4, hasElevator: true, shops: 2 },
    ],
    duesTl: 2_150,
    formula: "equal",
    expenseScale: 0.95,
    staff: [
      { fullName: "Halil Serin", role: "kapici", netTl: 28_000, grossTl: 33_000, sgkTl: 6_900, startedMonthsAgo: 26 },
      { fullName: "Tuncay Bekçi", role: "guvenlik", netTl: 29_500, grossTl: 35_000, sgkTl: 7_300, startedMonthsAgo: 14 },
    ],
    resources: [
      { name: "Misafir odası", kind: "misafir_odasi", capacity: 3, requiresApproval: true, openHour: 0, closeHour: 23, rulesText: "En fazla 3 gece; anahtar güvenlikten alınır." },
      { name: "Havuz", kind: "havuz", capacity: 25, requiresApproval: false, openHour: 9, closeHour: 20, rulesText: "Duş almadan havuza girilmez. 12 yaş altı yetişkin refakatiyle." },
    ],
    hasMeters: true,
    openingCashTl: 9_000,
    openingBankTl: 160_000,
    bankName: "Garanti BBVA",
  },
];

export function blueprintsFor(kind: "manager" | "company"): readonly SiteBlueprint[] {
  return kind === "company" ? SITE_BLUEPRINTS : SITE_BLUEPRINTS.slice(0, 1);
}

export function unitCountOf(bp: SiteBlueprint): number {
  return bp.blocks.reduce((sum, b) => sum + b.floors * b.unitsPerFloor + (b.shops ?? 0), 0);
}
