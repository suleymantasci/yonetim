import type { Block } from "@/lib/pdf/report-pdf";

/** Anahtar–değer listesi (faaliyet / denetim raporu bölümleri). */
export function kv(rows: [string, string][]): Block {
  return {
    type: "table",
    headless: true,
    columns: [
      { header: "", weight: 3, wrap: true },
      { header: "", weight: 1.3, align: "right" },
    ],
    rows: rows.map(([k, v]) => ({ cells: [k, v] })),
  };
}
