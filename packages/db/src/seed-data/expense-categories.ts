/** Varsayılan gider kategorileri — SPEC Bölüm 6.2. */
export interface ExpenseCategorySeed {
  name: string;
  distribution: "equal" | "land_share" | "area" | "person_count" | "meter";
  isShared: boolean;
  color: string;
  children?: { name: string; distribution?: ExpenseCategorySeed["distribution"] }[];
}

export const EXPENSE_CATEGORY_SEED: ExpenseCategorySeed[] = [
  {
    name: "Personel Giderleri",
    distribution: "equal",
    isShared: true,
    color: "#0F4C81",
    children: [
      { name: "Maaş" },
      { name: "SGK Primi" },
      { name: "Kıdem/İhbar Tazminatı" },
      { name: "Yemek ve Yol" },
    ],
  },
  {
    name: "Isıtma Giderleri",
    distribution: "meter",
    isShared: true,
    color: "#EF4444",
    children: [
      { name: "Doğalgaz", distribution: "meter" },
      { name: "Kazan Bakım", distribution: "equal" },
      { name: "Isı Pay Ölçer Okuma", distribution: "equal" },
    ],
  },
  {
    name: "Su Giderleri",
    distribution: "meter",
    isShared: true,
    color: "#06B6D4",
    children: [
      { name: "Şebeke Suyu", distribution: "meter" },
      { name: "Ortak Alan Suyu", distribution: "equal" },
      { name: "Hidrofor Bakım", distribution: "equal" },
    ],
  },
  {
    name: "Elektrik Giderleri",
    distribution: "equal",
    isShared: true,
    color: "#F59E0B",
    children: [
      { name: "Ortak Alan Aydınlatma" },
      { name: "Asansör Elektriği" },
      { name: "Otopark Aydınlatma" },
    ],
  },
  {
    name: "Asansör",
    distribution: "equal",
    isShared: true,
    color: "#8B5CF6",
    children: [{ name: "Aylık Bakım" }, { name: "Yıllık Muayene" }, { name: "Arıza/Yedek Parça" }],
  },
  {
    name: "Temizlik",
    distribution: "equal",
    isShared: true,
    color: "#10B981",
    children: [{ name: "Temizlik Malzemesi" }, { name: "Temizlik Hizmeti" }, { name: "Çöp/Atık" }],
  },
  {
    name: "Bakım ve Onarım",
    distribution: "land_share",
    isShared: true,
    color: "#64748B",
    children: [
      { name: "Tesisat" },
      { name: "Boya/Badana" },
      { name: "Çatı ve İzolasyon", distribution: "land_share" },
      { name: "Dış Cephe", distribution: "land_share" },
    ],
  },
  {
    name: "Güvenlik",
    distribution: "equal",
    isShared: true,
    color: "#0EA5E9",
    children: [{ name: "Güvenlik Hizmeti" }, { name: "Kamera Sistemi" }, { name: "Geçiş Kontrol" }],
  },
  {
    name: "Peyzaj ve Bahçe",
    distribution: "equal",
    isShared: true,
    color: "#22C55E",
    children: [{ name: "Bahçe Bakımı" }, { name: "Sulama" }, { name: "Bitki/Çiçek" }],
  },
  {
    name: "Sigorta",
    distribution: "land_share",
    isShared: true,
    color: "#F43F5E",
    children: [{ name: "DASK" }, { name: "Bina Sigortası" }, { name: "Asansör Mali Mesuliyet" }],
  },
  {
    name: "Yönetim Giderleri",
    distribution: "equal",
    isShared: true,
    color: "#A855F7",
    children: [
      { name: "Yazılım/Abonelik" },
      { name: "Kırtasiye" },
      { name: "Banka Masrafları" },
      { name: "Noter/Posta" },
    ],
  },
  {
    name: "Hukuk ve Danışmanlık",
    distribution: "equal",
    isShared: true,
    color: "#78716C",
    children: [{ name: "Avukat" }, { name: "Mali Müşavir" }, { name: "İcra Masrafları" }],
  },
  {
    name: "Sosyal Tesis",
    distribution: "equal",
    isShared: true,
    color: "#EC4899",
    children: [{ name: "Havuz" }, { name: "Spor Salonu" }, { name: "Sauna/Hamam" }],
  },
  {
    name: "Demirbaş ve Yatırım",
    distribution: "land_share",
    isShared: true,
    color: "#334155",
    children: [{ name: "Ekipman Alımı" }, { name: "Yenileme Projeleri" }],
  },
  {
    name: "Diğer",
    distribution: "equal",
    isShared: true,
    color: "#94A3B8",
  },
];
