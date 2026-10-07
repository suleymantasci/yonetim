import type { BudgetFormLine } from "./budget-form";

/**
 * Yeni proje için önerilen kalemler. Gider kategorisi adı eşleşirse kalem o
 * kategoriye bağlanıyor (gerçekleşen karşılaştırması için); eşleşmeyen kalem
 * yalnız plan olarak kalır. Tutarlar boş: tahmin yöneticinin işi.
 */
const SUGGESTED: { label: string; match: RegExp; staff?: boolean }[] = [
  { label: "Personel giderleri (maaş, SGK)", match: /^$/, staff: true },
  { label: "Elektrik (ortak alan)", match: /elektrik/i },
  { label: "Su (ortak alan)", match: /^su\b|su gider/i },
  { label: "Yakıt / doğalgaz", match: /yak[ıi]t|do[ğg]algaz|kalorifer/i },
  { label: "Asansör bakım ve muayene", match: /asans[öo]r/i },
  { label: "Temizlik ve malzeme", match: /temizlik/i },
  { label: "Bahçe ve peyzaj", match: /bah[çc]e|peyzaj/i },
  { label: "Bina sigortası", match: /sigorta|dask/i },
  { label: "Onarım ve bakım", match: /onar[ıi]m|tamir|bak[ıi]m/i },
  { label: "Yönetim ve muhasebe hizmeti", match: /y[öo]netim|muhasebe/i },
];

export function suggestedLines(
  categories: { id: string; name: string }[],
): BudgetFormLine[] {
  return SUGGESTED.map((s, i) => {
    const cat = s.staff ? null : categories.find((c) => s.match.test(c.name));
    return {
      key: `s${i}`,
      label: s.label,
      source: s.staff ? "staff" : (cat?.id ?? ""),
      plannedMinor: 0,
    };
  });
}

/** Önümüzdeki ayın başından 12 ay. */
export function defaultPeriods(now = new Date()): {
  start: string;
  end: string;
} {
  const at = new Date(now.getTime() + 3 * 3_600_000);
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth() + 1; // bu ay
  const key = (yy: number, mm: number) =>
    `${yy}-${String(mm).padStart(2, "0")}`;
  const sy = m === 12 ? y + 1 : y;
  const sm = m === 12 ? 1 : m + 1;
  const ey = sm === 1 ? sy : sy + 1;
  const em = sm === 1 ? 12 : sm - 1;
  return { start: key(sy, sm), end: key(ey, em) };
}
