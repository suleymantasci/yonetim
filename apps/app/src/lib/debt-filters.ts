import { RISK_THRESHOLDS_MINOR } from "@yonetim/contracts";

/**
 * Listelerde ortak borç süzgeçleri — borç türü (`?tur=`) ve kalan borç eşiği
 * (`?esik=` kuruş). Yönetimcell üye/taşınmaz listelerindeki "AİDAT / YAKIT …"
 * ve "≥ 500 ₺ borcu olan" seçeneklerinin karşılığı.
 */
export function debtTypeFilter(
  types: { id: string; name: string }[],
  value: string | undefined,
  labels: { label: string; all: string },
) {
  return {
    param: "tur",
    label: labels.label,
    value: value ?? "",
    options: [{ value: "", label: labels.all }, ...types.map((t) => ({ value: t.id, label: t.name }))],
  };
}

export function thresholdFilter(
  value: string | undefined,
  labels: { label: string; all: string; atLeast: (amount: string) => string },
  money: (minor: number) => string,
) {
  return {
    param: "esik",
    label: labels.label,
    value: value ?? "",
    options: [
      { value: "", label: labels.all },
      ...RISK_THRESHOLDS_MINOR.map((minor) => ({ value: String(minor), label: labels.atLeast(money(minor)) })),
    ],
  };
}

export function thresholdValue(value: string | undefined): number | undefined {
  const n = Number(value);
  return (RISK_THRESHOLDS_MINOR as readonly number[]).includes(n) ? n : undefined;
}

export function uuidParam(value: string | undefined): string | undefined {
  return value && /^[0-9a-f-]{36}$/.test(value) ? value : undefined;
}
