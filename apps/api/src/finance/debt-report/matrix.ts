/**
 * Dönem matrisi — saf toplama (servis SQL'den gruplanmış satırları verir).
 *
 * Değerler:
 *  - `charged`: tahakkuk (gecikme dahilse tazminat da)
 *  - `paid`: borca mahsup edilen tahsilat
 *  - `remaining`: kalan; gecikme hariçse **anapara** kalanı
 *    (`max(0, tutar − ödenen)`), silinen/iptal borçta 0.
 */
export interface MatrixInputRow {
  key: string;
  label: string;
  sub: string | null;
  /** `YYYY-MM` */
  bucket: string;
  amount: number;
  lateFee: number;
  paid: number;
  /** Silinen (written_off) borç: kalanı yok. */
  closed: boolean;
}

export interface MatrixOptions {
  year: number;
  value: "remaining" | "charged" | "paid";
  lateFee: boolean;
}

export interface MatrixRow {
  key: string;
  label: string;
  sub: string | null;
  beforeMinor: number;
  months: number[];
  afterMinor: number;
  totalMinor: number;
}

export function valueOf(row: Omit<MatrixInputRow, "key" | "label" | "sub" | "bucket">, opts: MatrixOptions): number {
  if (opts.value === "charged") return row.amount + (opts.lateFee ? row.lateFee : 0);
  if (opts.value === "paid") return row.paid;
  if (row.closed) return 0;
  return opts.lateFee
    ? Math.max(0, row.amount + row.lateFee - row.paid)
    : Math.max(0, row.amount - row.paid);
}

export function buildDebtMatrix(
  input: readonly MatrixInputRow[],
  opts: MatrixOptions,
): { rows: MatrixRow[]; totals: Omit<MatrixRow, "key" | "label" | "sub"> } {
  const byKey = new Map<string, MatrixRow>();
  const first = `${opts.year}-01`;
  const last = `${opts.year}-12`;
  for (const r of input) {
    const v = valueOf(r, opts);
    if (v === 0) continue;
    let row = byKey.get(r.key);
    if (!row) {
      row = {
        key: r.key,
        label: r.label,
        sub: r.sub,
        beforeMinor: 0,
        months: Array.from({ length: 12 }, () => 0),
        afterMinor: 0,
        totalMinor: 0,
      };
      byKey.set(r.key, row);
    }
    if (r.bucket < first) row.beforeMinor += v;
    else if (r.bucket > last) row.afterMinor += v;
    else row.months[Number(r.bucket.slice(5, 7)) - 1]! += v;
    row.totalMinor += v;
  }
  const rows = [...byKey.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "tr", { numeric: true }),
  );
  const totals = {
    beforeMinor: rows.reduce((s, r) => s + r.beforeMinor, 0),
    months: Array.from({ length: 12 }, (_, i) => rows.reduce((s, r) => s + r.months[i]!, 0)),
    afterMinor: rows.reduce((s, r) => s + r.afterMinor, 0),
    totalMinor: rows.reduce((s, r) => s + r.totalMinor, 0),
  };
  return { rows, totals };
}
